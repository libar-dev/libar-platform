import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { createAdminAccess, guarded } from "./admin.js";
import type { AdminAccess, AdminDependencies, AdminState } from "./admin.js";
import type { Composition } from "./composition.js";
import type { HostedUsage, JsonValue } from "./evidence.js";
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.native-harness.hosted"),
  label: "the selection of a hosted deployment and its admin access",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;
// What a native run on a hosted deployment knows of it. The deploy key is no member: the admin
// access holds it, and a test never reads it.
export interface HostedTarget {
  url: string;
  deployment: string;
  keyName: string;
  statedPlan: string;
}
// What the hosted run's global setup gives every test: the target and when the run started.
export interface HostedRun {
  target: HostedTarget;
  startedAt: string;
}
declare module "vitest" {
  interface ProvidedContext {
    hostedRun: HostedRun;
  }
}
type Variables = Readonly<Record<string, string | undefined>>;
// The four process variables a hosted run reads. Only the deploy key is a secret.
export const hostedVariables = [
  "HOSTED_DEPLOYMENT_URL",
  "HOSTED_DEPLOY_KEY",
  "HOSTED_DEPLOY_KEY_NAME",
  "HOSTED_PLAN",
] as const;
// Every refusal names the variable and never its value.
function read(variables: Variables, name: (typeof hostedVariables)[number]) {
  const value = variables[name];
  if (value === undefined || value.trim() === "")
    throw new Error(
      `${name} is not set. A native run on a hosted deployment reads ${hostedVariables.join(", ")} from the process environment.`,
    );
  return value;
}
const deploymentName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// The deployment a development deploy key carries: dev:, the deployment's name, | and the secret.
function keyDeployment(key: string): string {
  if (!key.startsWith("dev:"))
    throw new Error(
      "HOSTED_DEPLOY_KEY does not begin dev:. A native run on a hosted deployment takes a development deploy key and refuses a production, preview or project key.",
    );
  const bar = key.indexOf("|");
  const name = key.slice("dev:".length, bar);
  if (bar === -1 || !deploymentName.test(name) || bar === key.length - 1)
    throw new Error(
      "HOSTED_DEPLOY_KEY is not dev:, a deployment name, | and a secret.",
    );
  return name;
}
// Reads the four variables and refuses a key that is not a development deploy key, and a URL
// that does not name the deployment the key carries: https://, the name, optionally the region
// the CLI prints, and .convex.cloud.
export function hostedTarget(variables: Variables): HostedTarget {
  const url = read(variables, "HOSTED_DEPLOYMENT_URL");
  const key = read(variables, "HOSTED_DEPLOY_KEY");
  const keyName = read(variables, "HOSTED_DEPLOY_KEY_NAME");
  const statedPlan = read(variables, "HOSTED_PLAN");
  const deployment = keyDeployment(key);
  const printed = new RegExp(
    `^https://${deployment}(?:\\.[a-z0-9]+(?:-[a-z0-9]+)*)?\\.convex\\.cloud$`,
  );
  if (!printed.test(url))
    throw new Error(
      "HOSTED_DEPLOYMENT_URL does not name the deployment HOSTED_DEPLOY_KEY carries: it is not https://, that deployment's name, an optional region and .convex.cloud.",
    );
  return { url, deployment, keyName, statedPlan };
}
// The secrets of a hosted run: the whole key, its part after the |, and both URL-encoded.
export function deployKeyForms(key: string): string[] {
  const secret = key.slice(key.indexOf("|") + 1);
  return [
    ...new Set(
      [key, secret, encodeURIComponent(key), encodeURIComponent(secret)].filter(
        (form) => form !== "",
      ),
    ),
  ];
}
// The admin access to a hosted deployment, and the two reads only a hosted deployment answers.
export interface HostedAccess extends AdminAccess {
  // The deployment's answer to GET /api/v1/get_current_usage, read with the deploy key.
  usage(): Promise<HostedUsage>;
  // The answer of /instance_version, or null when the deployment gives none.
  instanceVersion(): Promise<string | null>;
}
export function createHostedAccess(options: {
  variables: Variables;
  composition: Composition;
  home: string;
  state: AdminState;
  signal?: AbortSignal;
  dependencies?: AdminDependencies;
}): { target: HostedTarget; access: HostedAccess; secrets: string[] } {
  const target = hostedTarget(options.variables);
  const key = read(options.variables, "HOSTED_DEPLOY_KEY");
  const secrets = deployKeyForms(key);
  const dependencies = options.dependencies ?? {};
  const fetch: typeof globalThis.fetch = (input, init) =>
    (dependencies.fetch ?? globalThis.fetch)(input, init);
  const access = createAdminAccess(
    {
      selection: { kind: "hosted", url: target.url, key },
      home: options.home,
      composition: options.composition,
      secrets,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    options.state,
    dependencies,
  );
  const hosted: HostedAccess = guarded(secrets, {
    ...access,
    async usage() {
      const response = await fetch(`${target.url}/api/v1/get_current_usage`, {
        headers: { Authorization: `Convex ${key}` },
        signal: AbortSignal.timeout(30000),
      });
      const readAt = new Date().toISOString();
      const text = await response.text();
      if (!response.ok)
        throw new Error(
          `Reading the deployment's usage failed with status ${response.status}: ${text}`,
        );
      const answer = JSON.parse(text) as JsonValue;
      const seedStatus =
        typeof answer === "object" &&
        answer !== null &&
        !Array.isArray(answer) &&
        typeof answer["seedStatus"] === "string"
          ? answer["seedStatus"]
          : null;
      return { readAt, seedStatus, response: answer };
    },
    async instanceVersion() {
      try {
        const response = await fetch(`${target.url}/instance_version`, {
          signal: AbortSignal.timeout(10000),
        });
        return response.ok ? (await response.text()).trim() : null;
      } catch {
        return null;
      }
    },
  });
  return { target, access: hosted, secrets };
}

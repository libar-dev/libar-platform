import type { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { expect } from "vitest";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { ordinaryClientRefusedComponentFunctionContract as contract } from "../../generated/contracts/platform.native-harness.ordinary-client-refused-component-function.contract.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, required } from "../../harness/native.js";
const anchor = specTest({
  id: testAnchorId(
    "test:platform.native-harness.ordinary-client-refused-component-function",
  ),
  verifies: ref(
    "spec:platform.native-harness.ordinary-client-refused-component-function",
  ),
});
void anchor;
// Both refused routes and the admin call are built from these two names.
const component = "annex";
const target = "notes:add";
const refusalOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (error: unknown) => error,
  );
// The public endpoint, POST /api/mutation, given the component's name as a path prefix.
const byQualifiedName = (client: ConvexHttpClient) =>
  refusalOf(
    client.mutation(
      makeFunctionReference<"mutation">(`${component}/${target}`),
      {},
    ),
  );
// POST /api/function takes a component path. Convex 1.46.0 implements this method and strips it
// from its declarations.
const byComponentPath = (client: ConvexHttpClient) =>
  refusalOf(
    (
      client as unknown as {
        function(name: string, componentPath: string, args: object): unknown;
      }
    ).function(target, component, {}) as Promise<unknown>,
  );
interface World {
  backend?: Backend;
  client?: ConvexHttpClient;
  publicRouteError?: unknown;
  componentRouteError?: unknown;
}
bindExample(contract, (): World => ({}), {
  "a disposable backend running the fixture composition, which mounts a component with a mutation that writes one row":
    async (world) => {
      world.backend = await fixtureBackend();
    },
  "an ordinary client carrying a token the harness signed for subject {subject}":
    async (world, { subject }) => {
      const backend = required(world.backend, "the backend");
      world.client = ordinaryClient(backend.url, {
        token: await backend.issuer.token(subject),
      });
    },
  "the client calls the component's mutation by each of the two routes a client has":
    async (world) => {
      const client = required(world.client, "the client");
      world.publicRouteError = await byQualifiedName(client);
      world.componentRouteError = await byComponentPath(client);
    },
  "the call to the public endpoint with a component-qualified name fails with an error whose text holds {publicRouteRefusal}":
    async (world, { publicRouteRefusal }) => {
      expect(world.publicRouteError).toBeInstanceOf(Error);
      expect(String(world.publicRouteError)).toContain(publicRouteRefusal);
      const noToken = ordinaryClient(
        required(world.backend, "the backend").url,
      );
      expect(String(await byQualifiedName(noToken))).toContain(
        publicRouteRefusal,
      );
    },
  "the call to the endpoint that takes a component path fails with an error whose text holds {componentRouteRefusal}":
    async (world, { componentRouteRefusal }) => {
      expect(world.componentRouteError).toBeInstanceOf(Error);
      expect(String(world.componentRouteError)).toContain(
        componentRouteRefusal,
      );
      const noToken = ordinaryClient(
        required(world.backend, "the backend").url,
      );
      expect(String(await byComponentPath(noToken))).toContain(
        componentRouteRefusal,
      );
    },
  "the table the component's mutation writes holds {rowsAfterRefusal} rows":
    async (world, { rowsAfterRefusal }) => {
      const { admin } = required(world.backend, "the backend");
      expect(await admin.readTable("notes", { component })).toHaveLength(
        rowsAfterRefusal,
      );
    },
  "the same mutation called with the harness's admin access writes {rowsAfterAdminCall} row":
    async (world, { rowsAfterAdminCall }) => {
      const { admin } = required(world.backend, "the backend");
      await admin.run(target, {}, { component });
      const rows = await admin.readTable("notes", { component });
      expect(rows).toHaveLength(rowsAfterAdminCall);
      expect(rows[0]).toMatchObject({ source: "annex" });
    },
});

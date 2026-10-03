// The steps of spec:command.tenancy-and-authority's example space, shared by its native examples. The
// command is the fixture's CreateDocument; the caller is an ordinary client with a fixture-issuer
// token. Admin access only gives and revokes grants and reads tables and the function log.
import type { ConvexHttpClient } from "convex/browser";
import {
  getFunctionName,
  makeFunctionReference,
  type FunctionReturnType,
} from "convex/server";
import { ConvexError, convexToJson, type Value } from "convex/values";
import { expect } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import type { CompletionRecord } from "../../harness/admin.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, required } from "../../harness/native.js";
export const publicEntry = getFunctionName(api.depotCommands.createDocument);
export const internalEntry = getFunctionName(
  internal.depotCommands.createDocumentInternal,
);
const title = "Report";
export type Response = FunctionReturnType<
  typeof api.depotCommands.createDocument
>;
export type Claimed = "worker" | "agent";
export type Via =
  | "passing a namespace argument to the public entry"
  | "calling the internal entry directly";
export type Answer = { returned: Response } | { threw: unknown };
export interface TenancyWorld {
  backend?: Backend;
  tenantId?: string;
  subject?: string;
  client?: ConvexHttpClient;
  other?: { tenantId: string; response: Response };
  grant?: "still valid" | "revoked after a successful run";
  claim?: { claimed: Claimed; via: Via };
  sent?: { requestKey: string; localId: string };
  firstRun?: Response;
  receiptsAfterFirstRun?: Record<string, Value>[];
  answer?: Answer;
  completion?: CompletionRecord;
}
// The token identifier Convex derives from a fixture-issuer token: the actor's id and a grant's principal.
export const principalOf = (backend: Backend, subject: string) =>
  `${backend.issuer.issuer}|${subject}`;
const grantArgs = (backend: Backend, tenantId: string, subject: string) => ({
  tenantId,
  principalKind: "human",
  principalId: principalOf(backend, subject),
  permission: permissions.documents,
});
export async function giveGrant(
  backend: Backend,
  tenantId: string,
  subject: string,
) {
  await backend.admin.run(getFunctionName(internal.grants.grant), {
    ...grantArgs(backend, tenantId, subject),
    grantedBy: "native-test",
  });
}
async function clientOf(backend: Backend, subject: string) {
  return ordinaryClient(backend.url, {
    token: await backend.issuer.token(subject),
  });
}
export async function settle(call: Promise<unknown>): Promise<Answer> {
  return call.then(
    (returned) => ({ returned: returned as Response }),
    (threw: unknown) => ({ threw }),
  );
}
export function returned(answer: Answer | undefined): Response {
  const settled = required(answer, "the answer");
  if (!("returned" in settled))
    throw new Error(`The call threw: ${String(settled.threw)}`);
  return settled.returned;
}
export function threw(answer: Answer | undefined): unknown {
  const settled = required(answer, "the answer");
  if (!("threw" in settled))
    throw new Error(
      `The call returned: ${JSON.stringify(convexToJson(settled.returned))}`,
    );
  return settled.threw;
}
// The parent's completion record of the first call to the function after the mark.
export async function completionOf(
  backend: Backend,
  mark: Awaited<ReturnType<Backend["admin"]["logMark"]>>,
  identifier: string,
): Promise<CompletionRecord> {
  const ofTarget = (record: CompletionRecord) =>
    record.componentPath === null && record.identifier === identifier;
  const records = await backend.admin.completionsSince(mark, (seen) =>
    seen.some(ofTarget),
  );
  return required(records.find(ofTarget), `a completion of ${identifier}`);
}
export const readDocuments = (completion: CompletionRecord) =>
  completion.usageStats.databaseReadDocuments;
export async function stored(backend: Backend) {
  return {
    receipts: await backend.admin.readTable("receipts"),
    streams: await backend.admin.readTable("streams", { component: "depot" }),
    events: await backend.admin.readTable("events", { component: "depot" }),
  };
}
const callOf = (world: TenancyWorld, requestKey: string, localId: string) => ({
  tenantId: required(world.tenantId, "the tenant"),
  requestKey,
  input: { documentId: localId, title },
});
// Sends the command the way a client that claims a namespace would, by name, so that no generated
// type stands in the way of the claim. Returns what came back and the call's completion record.
export async function sendClaiming(
  world: TenancyWorld,
  claim: { claimed: Claimed; via: Via } | undefined,
  requestKey: string,
  localId: string,
): Promise<{ answer: Answer; completion: CompletionRecord }> {
  const backend = required(world.backend, "the backend");
  const client = required(world.client, "the client");
  const call = callOf(world, requestKey, localId);
  const [identifier, args]: [string, Record<string, Value>] =
    claim === undefined
      ? [publicEntry, call]
      : claim.via === "passing a namespace argument to the public entry"
        ? [publicEntry, { ...call, namespace: claim.claimed }]
        : [
            internalEntry,
            {
              ...call,
              namespace: claim.claimed,
              actor: {
                kind: "human",
                id: principalOf(backend, required(world.subject, "the caller")),
                issuer: backend.issuer.issuer,
              },
            },
          ];
  const mark = await backend.admin.logMark();
  const answer = await settle(
    client.mutation(makeFunctionReference<"mutation">(identifier), args),
  );
  return { answer, completion: await completionOf(backend, mark, identifier) };
}
// What Convex answers a claimed namespace on each route: the public entry's args validator refuses the
// field, and an internal function has no public form. Either way no handler ran, so nothing was read.
export function expectRefusedBeforeHandler(
  answer: Answer,
  completion: CompletionRecord,
  via: Via,
) {
  const refusal =
    via === "passing a namespace argument to the public entry"
      ? "ArgumentValidationError: Object contains extra field `namespace`"
      : `Could not find public function for '${internalEntry}'`;
  const error = threw(answer);
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(ConvexError);
  expect(String(error)).toContain(refusal);
  expect(completion.error).toContain(refusal);
  expect(readDocuments(completion)).toBe(0);
}
// The same command sent on a route that works: the public entry without the claim, or the internal
// entry through the fixture's non-UI caller action, the trusted server caller a client may not be.
export async function sendWorkingRoute(
  world: TenancyWorld,
  claimed: Claimed,
  via: Via,
  requestKey: string,
  localId: string,
): Promise<{ response: Response; completion: CompletionRecord }> {
  const backend = required(world.backend, "the backend");
  const client = required(world.client, "the client");
  const call = callOf(world, requestKey, localId);
  const mark = await backend.admin.logMark();
  if (via === "passing a namespace argument to the public entry") {
    const response = await client.mutation(
      api.depotCommands.createDocument,
      call,
    );
    return {
      response,
      completion: await completionOf(backend, mark, publicEntry),
    };
  }
  const response = (await client.action(api.nonUiCaller.send, {
    ...call,
    command: "createDocument",
    namespace: claimed,
    actorKind: "human",
  })) as Response;
  return {
    response,
    completion: await completionOf(backend, mark, internalEntry),
  };
}
export async function receiptsOf(
  world: TenancyWorld,
  tenantId: string,
  requestKey: string,
) {
  const backend = required(world.backend, "the backend");
  return (await backend.admin.readTable("receipts")).filter(
    (receipt) =>
      receipt.tenantId === tenantId && receipt.requestKey === requestKey,
  );
}
// Given a tenant {tenantId} whose caller {principalId} holds a grant for the command
export async function callerHoldsGrant(
  world: TenancyWorld,
  tenantId: string,
  principalId: string,
) {
  const backend = await fixtureBackend();
  await giveGrant(backend, tenantId, principalId);
  Object.assign(world, {
    backend,
    tenantId,
    subject: principalId,
    client: await clientOf(backend, principalId),
  });
}
// And another tenant {otherTenantId} already applied a receipted command with request key {requestKey}
// and local ID {localId}. Its caller is a subject of its own with a grant in that tenant only.
export async function otherTenantApplied(
  world: TenancyWorld,
  otherTenantId: string,
  requestKey: string,
  localId: string,
) {
  const backend = required(world.backend, "the backend");
  const subject = `caller-of-${otherTenantId}`;
  await giveGrant(backend, otherTenantId, subject);
  const client = await clientOf(backend, subject);
  const response = await client.mutation(api.depotCommands.createDocument, {
    tenantId: otherTenantId,
    requestKey,
    input: { documentId: localId, title },
  });
  expect(response).toMatchObject({ kind: "applied", replayed: false });
  world.other = { tenantId: otherTenantId, response };
}
// And the caller's grant is {grant}. A revocation follows a successful run of the very call the When
// step sends, so the When step carries it out.
export async function grantIs(
  world: TenancyWorld,
  grant: "still valid" | "revoked after a successful run",
) {
  world.grant = grant;
  if (grant === "revoked after a successful run") return;
  const backend = required(world.backend, "the backend");
  const subject = required(world.subject, "the caller");
  const tenantId = required(world.tenantId, "the tenant");
  expect(await backend.admin.readTable("grants")).toContainEqual(
    expect.objectContaining(grantArgs(backend, tenantId, subject)),
  );
}
// And a public client claims namespace {claimed} by {via}
export function claims(world: TenancyWorld, claimed: Claimed, via: Via) {
  world.claim = { claimed, via };
}
// When the caller sends the receipted command with request key {sentKey} and local ID {sentLocalId}
export async function sends(
  world: TenancyWorld,
  requestKey: string,
  localId: string,
) {
  const backend = required(world.backend, "the backend");
  world.sent = { requestKey, localId };
  if (world.grant === "revoked after a successful run") {
    const first = await sendClaiming(world, undefined, requestKey, localId);
    world.firstRun = returned(first.answer);
    expect(world.firstRun).toMatchObject({ kind: "applied", replayed: false });
    world.receiptsAfterFirstRun = await backend.admin.readTable("receipts");
    const tenantId = required(world.tenantId, "the tenant");
    const subject = required(world.subject, "the caller");
    expect(
      await backend.admin.run(
        getFunctionName(internal.grants.revoke),
        grantArgs(backend, tenantId, subject),
      ),
    ).toBe(1);
  }
  const { answer, completion } = await sendClaiming(
    world,
    world.claim,
    requestKey,
    localId,
  );
  Object.assign(world, { answer, completion });
}
// Then the answer is {answer}
export function answerIs(
  world: TenancyWorld,
  answer:
    | "applied"
    | "replayed"
    | "forbidden"
    | "conflict"
    | "refused before the handler runs",
) {
  switch (answer) {
    case "applied":
    case "replayed":
      expect(returned(world.answer)).toMatchObject({
        kind: "applied",
        replayed: answer === "replayed",
      });
      return;
    case "conflict":
    case "forbidden": {
      const error = threw(world.answer);
      expect(error).toBeInstanceOf(ConvexError);
      const data = (error as ConvexError<Value>).data;
      expect(data).toMatchObject({
        kind: "rejection",
        code: answer === "conflict" ? "idempotencyConflict" : "forbidden",
        entry: "CreateDocument",
      });
      // A conflict carries nothing of the stored receipt.
      if (answer === "conflict") expect(data).not.toHaveProperty("details");
      return;
    }
    case "refused before the handler runs":
      expectRefusedBeforeHandler(
        required(world.answer, "the answer"),
        required(world.completion, "the completion record"),
        required(world.claim, "the claim").via,
      );
  }
}
// And a stored outcome is disclosed to the caller {disclosed}. A stored outcome is a receipt; it is
// disclosed when what the caller received names its operation ID, other than a receipt the call wrote.
export async function disclosedIs(world: TenancyWorld, disclosed: boolean) {
  const backend = required(world.backend, "the backend");
  const settled = required(world.answer, "the answer");
  const response = "returned" in settled ? settled.returned : undefined;
  const error = "threw" in settled ? settled.threw : undefined;
  const received =
    response !== undefined
      ? JSON.stringify(convexToJson(response))
      : error instanceof ConvexError
        ? JSON.stringify(convexToJson(error.data as Value))
        : String(error);
  const receipts = await backend.admin.readTable("receipts");
  const written = response?.replayed === false ? response.operationId : null;
  const disclosedIds = receipts
    .map((receipt) => receipt.operationId as string)
    .filter((id) => id !== written && received.includes(id));
  if (disclosed) {
    expect(response?.replayed).toBe(true);
    expect(disclosedIds).toEqual([response?.operationId]);
  } else {
    expect(response?.replayed ?? false).toBe(false);
    expect(disclosedIds).toEqual([]);
  }
}
// And the namespace the server assigned is {namespace}: the namespace of the receipt for the key the
// caller sent, in the caller's tenant, or none when no receipt for it exists.
export async function namespaceIs(
  world: TenancyWorld,
  namespace: "public" | "worker" | "agent" | "none",
) {
  const receipts = await receiptsOf(
    world,
    required(world.tenantId, "the tenant"),
    required(world.sent, "the sent call").requestKey,
  );
  if (namespace === "none") expect(receipts).toEqual([]);
  else
    expect(receipts.map((receipt) => receipt.namespace)).toEqual([namespace]);
}

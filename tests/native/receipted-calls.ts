// The steps of the receipted examples of spec:command.idempotency-and-receipts, on the fixture
// composition. The caller under test is a non-UI caller: an ordinary client with a fixture-issuer token
// that calls the fixture action nonUiCaller:send, which runs the command's internal entry. Admin access
// gives the grant, turns the fixture's switches on and off, and reads stored documents and the function
// log; it sends no command.
import { getFunctionName } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import type { IdempotencyAndReceiptsConditions as Conditions } from "../../generated/contracts/command.idempotency-and-receipts.space.js";
import type { Backend } from "../../harness/backend.js";
import type { CompletionRecord } from "../../harness/admin.js";
import { countingFetch, ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import {
  fingerprintOf,
  type CommandResponse,
} from "../../src/command/index.js";
type Row = Record<string, Value>;
type Response = CommandResponse<unknown>;
type SwitchName = "rateLimited" | "capacity" | "failBeforeReceipt";
// A lost answer is a call whose response the transport dropped after the backend answered.
export type Answer =
  { response: Response } | { error: unknown } | { lost: true };
export interface Stored {
  receipts: Row[];
  streams: Row[];
  events: Row[];
}
export interface ReceiptWorld {
  backend?: Backend;
  tenantId?: string;
  namespace?: Conditions["namespace"];
  token?: string;
  commandType?: string;
  requestKey?: string;
  fingerprint?: string;
  admissionSwitch?: SwitchName;
  // The setup call that left the receipt an example starts from, and what was stored after it.
  prior?: { response: Response; stored: Stored };
  answers?: Answer[];
  // What was stored right after the first answer and right after the original outcome committed.
  afterFirst?: Stored;
  afterOriginal?: Stored;
  // The internal entry's completion records of a concurrent pair.
  entryCompletions?: CompletionRecord[];
}
// The business input each fingerprint label of the examples stands for; a receipt stores its digest.
export const businessInputs: Readonly<
  Record<string, { lines: { productId: string; quantity: number }[] }>
> = {
  "f-1": { lines: [{ productId: "p-1", quantity: 5 }] },
  "f-2": { lines: [{ productId: "p-1", quantity: 7 }] },
};
// The fixture commands the examples bind, by command type, as nonUiCaller:send names them.
const commandExports: Readonly<Record<string, string>> = {
  AddStock: "addStock",
};
// The actor kind a caller in each namespace runs as. A worker is a service actor.
const actorKinds = {
  public: "human",
  worker: "service",
  service: "service",
  agent: "agent",
} as const;
const contractVersion = 1;
export async function storedNow(backend: Backend): Promise<Stored> {
  const [receipts, streams, events] = await Promise.all([
    backend.admin.readTable("receipts"),
    backend.admin.readTable("streams", { component: "depot" }),
    backend.admin.readTable("events", { component: "depot" }),
  ]);
  return { receipts, streams, events };
}
function exportOf(world: ReceiptWorld): string {
  const commandType = required(world.commandType, "the command type");
  const name = Object.hasOwn(commandExports, commandType)
    ? commandExports[commandType]
    : undefined;
  if (name === undefined)
    throw new Error(`No fixture command is bound to ${commandType}`);
  return name;
}
function inputOf(fingerprint: string) {
  const input = Object.hasOwn(businessInputs, fingerprint)
    ? businessInputs[fingerprint]
    : undefined;
  if (input === undefined)
    throw new Error(`No business input is bound to fingerprint ${fingerprint}`);
  return input;
}
function keyRows(world: ReceiptWorld, stored: Stored): Row[] {
  return stored.receipts.filter(
    (row) =>
      row.tenantId === world.tenantId &&
      row.namespace === world.namespace &&
      row.commandType === world.commandType &&
      row.requestKey === world.requestKey,
  );
}
async function setSwitch(world: ReceiptWorld, name: SwitchName, on: boolean) {
  await required(world.backend, "the backend").admin.run(
    getFunctionName(internal.switches.set),
    {
      tenantId: required(world.tenantId, "the tenant"),
      commandType: required(world.commandType, "the command type"),
      name,
      on,
    },
  );
}
// One call of the non-UI caller, on a client of its own.
export async function send(
  world: ReceiptWorld,
  options: {
    fingerprint?: string;
    requestKey?: string;
    fetch?: typeof globalThis.fetch;
  } = {},
): Promise<Answer> {
  const backend = required(world.backend, "the backend");
  const namespace = required(world.namespace, "the namespace");
  const client = ordinaryClient(backend.url, {
    token: required(world.token, "the caller's token"),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  try {
    const response = (await client.action(api.nonUiCaller.send, {
      command: exportOf(world),
      tenantId: required(world.tenantId, "the tenant"),
      namespace,
      actorKind: actorKinds[namespace],
      requestKey:
        options.requestKey ?? required(world.requestKey, "the request key"),
      input: inputOf(
        options.fingerprint ?? required(world.fingerprint, "the fingerprint"),
      ),
    })) as Response;
    return { response };
  } catch (error) {
    if (String(error).includes("The response was lost")) return { lost: true };
    return { error };
  }
}
function errorData(answer: Answer): Record<string, Value> | undefined {
  if (!("error" in answer) || !(answer.error instanceof ConvexError))
    return undefined;
  return answer.error.data as Record<string, Value>;
}
export function responseOf(answer: Answer | undefined): Response {
  if (answer === undefined || !("response" in answer))
    throw new Error(`Expected a response, got ${describe(answer)}`);
  return answer.response;
}
export function describe(answer: Answer | undefined): string {
  if (answer === undefined) return "none";
  if ("lost" in answer) return "a lost response";
  if ("response" in answer)
    return answer.response.replayed
      ? "replayed"
      : answer.response.kind === "applied"
        ? "applied"
        : "businessFailure";
  const data = errorData(answer);
  if (data?.kind === "transient") return "transient refusal";
  if (data?.kind === "rejection")
    return data.code === "idempotencyConflict"
      ? "conflict"
      : data.code === "entityExists"
        ? "entity exists"
        : `rejection ${String(data.code)}`;
  return `technical failure: ${String(answer.error)}`;
}
export async function givenCaller(
  world: ReceiptWorld,
  { tenantId, namespace }: Pick<Conditions, "tenantId" | "namespace">,
) {
  const backend = await fixtureBackend();
  const subject = `${namespace}-caller`;
  await backend.admin.run(getFunctionName(internal.grants.grant), {
    tenantId,
    principalKind: actorKinds[namespace],
    principalId: `${backend.issuer.issuer}|${subject}`,
    permission: permissions.stock,
    grantedBy: "native-test",
  });
  Object.assign(world, {
    backend,
    tenantId,
    namespace,
    token: await backend.issuer.token(subject),
  });
}
export function givenCommand(
  world: ReceiptWorld,
  {
    commandType,
    requestKey,
    fingerprint,
  }: Pick<Conditions, "commandType" | "requestKey" | "fingerprint">,
) {
  expect(Object.keys(commandExports)).toContain(commandType);
  inputOf(fingerprint);
  Object.assign(world, { commandType, requestKey, fingerprint });
}
// The other bound input, for a receipt with a different fingerprint.
const otherFingerprint = (fingerprint: string) =>
  fingerprint === "f-1" ? "f-2" : "f-1";
export async function givenPriorReceipt(
  world: ReceiptWorld,
  { priorReceipt }: Pick<Conditions, "priorReceipt">,
) {
  const backend = required(world.backend, "the backend");
  const fingerprint = required(world.fingerprint, "the fingerprint");
  if (priorReceipt === "no receipt") {
    expect(keyRows(world, await storedNow(backend))).toEqual([]);
    return;
  }
  const original =
    priorReceipt === "the same fingerprint"
      ? fingerprint
      : otherFingerprint(fingerprint);
  const answer = await send(world, { fingerprint: original });
  expect(describe(answer)).toBe("applied");
  const stored = await storedNow(backend);
  const [receipt] = keyRows(world, stored);
  // The label names a real digest: the original input's, and not the other input's.
  expect(receipt?.fingerprint).toBe(
    await fingerprintOf(inputOf(original), contractVersion),
  );
  const sent = await fingerprintOf(inputOf(fingerprint), contractVersion);
  expect(receipt?.fingerprint === sent).toBe(original === fingerprint);
  world.prior = { response: responseOf(answer), stored };
}
export async function givenAdmission(
  world: ReceiptWorld,
  { admission }: Pick<Conditions, "admission">,
) {
  const backend = required(world.backend, "the backend");
  if (admission === "admits every call") {
    expect(await backend.admin.readTable("switches")).toEqual([]);
    return;
  }
  world.admissionSwitch =
    admission === "refuses the first call for capacity and then admits"
      ? "capacity"
      : "rateLimited";
  await setSwitch(world, world.admissionSwitch, true);
}
export async function whenSends(
  world: ReceiptWorld,
  { sends }: Pick<Conditions, "sends">,
) {
  const backend = required(world.backend, "the backend");
  switch (sends) {
    case "once":
      world.answers = [await send(world)];
      break;
    case "twice concurrently": {
      const mark = await backend.admin.logMark();
      const pair = await Promise.all([send(world), send(world)]);
      // Which call is answered as the duplicate is not fixed, so the pair is ordered here: the answer
      // that is not a replay first.
      measure(
        "concurrentAnswers",
        pair.map((answer) => describe(answer)),
      );
      world.answers = [...pair].sort(
        (a, b) =>
          Number(describe(a) === "replayed") -
          Number(describe(b) === "replayed"),
      );
      const records = await backend.admin.completionsSince(
        mark,
        (entries) =>
          entries.filter((entry) => entry.identifier === "nonUiCaller:send")
            .length >= 2,
      );
      world.entryCompletions = records.filter(
        (entry) =>
          entry.identifier === `depotCommands:${exportOf(world)}Internal`,
      );
      break;
    }
    case "again after a lost response": {
      const transport = countingFetch({ loseResponses: true });
      const first = await send(world, { fetch: transport.fetch });
      expect(transport.requests()).toBe(1);
      world.afterFirst = world.afterOriginal = await storedNow(backend);
      // A part that fails the call once the executor has made its context call, so a retry that
      // executes cannot pass as a replay.
      await setSwitch(world, "failBeforeReceipt", true);
      world.answers = [first, await send(world)];
      break;
    }
    case "again after the transient refusal": {
      const first = await send(world);
      world.afterFirst = await storedNow(backend);
      await setSwitch(
        world,
        required(world.admissionSwitch, "the refusing switch"),
        false,
      );
      world.answers = [first, await send(world)];
      world.afterOriginal = await storedNow(backend);
      break;
    }
    default:
      throw new Error(`The receipted examples do not send ${sends}`);
  }
}
// A lost first answer is read from what the call stored: the receipt it left for the key.
function firstLabel(world: ReceiptWorld): string {
  const [first] = required(world.answers, "the answers");
  if (first === undefined || !("lost" in first)) return describe(first);
  const [receipt] = keyRows(world, required(world.afterFirst, "the store"));
  return receipt?.outcome === "applied" ? "applied" : "a lost response";
}
export function thenFirst(world: ReceiptWorld, { first }: { first: string }) {
  const [answer] = required(world.answers, "the answers");
  expect(firstLabel(world)).toBe(first);
  if (first === "conflict") {
    const data = required(errorData(required(answer, "the answer")), "data");
    expect(data).toMatchObject({
      kind: "rejection",
      code: "idempotencyConflict",
      commandType: world.commandType,
      details: {
        operationId: required(world.prior, "the original").response.operationId,
      },
    });
  }
  if (first === "transient refusal") {
    const code = required(world.admissionSwitch, "the refusing switch");
    const data = required(errorData(required(answer, "the answer")), "data");
    expect(data).toEqual({
      kind: "transient",
      code,
      message: `${world.commandType} is not admitted now`,
      ...(code === "rateLimited" ? { retryAfterMs: 1000 } : {}),
    });
    // The refusal stored nothing: no receipt, no stream, no event.
    expect(required(world.afterFirst, "the store after it")).toEqual({
      receipts: [],
      streams: [],
      events: [],
    });
  }
}
export async function thenSecond(
  world: ReceiptWorld,
  { second }: { second: string },
) {
  const answers = required(world.answers, "the answers");
  expect(answers.length).toBeLessThanOrEqual(2);
  const answer = answers[1];
  expect(describe(answer)).toBe(second);
  if (second === "applied") expect(responseOf(answer).replayed).toBe(false);
  if (second !== "replayed") return;
  const replay = responseOf(answer);
  // A replay arrived as a return value, so the internal entry's returns validator admitted it with
  // its null result; it carries what the receipt row holds.
  expect(replay.result).toBeNull();
  const stored = await storedNow(required(world.backend, "the backend"));
  const receipt = required(keyRows(world, stored)[0], "the receipt");
  expect({
    operationId: replay.operationId,
    affected: replay.affected,
    versions: replay.versions,
  }).toEqual({
    operationId: receipt.operationId,
    affected: receipt.affected,
    versions: receipt.versions,
  });
  const [first] = answers;
  if (first !== undefined && "response" in first)
    expect(replay).toEqual({ ...first.response, result: null, replayed: true });
  if (world.entryCompletions !== undefined) {
    // Both mutations read the empty key range; the engine refused one commit as an OCC conflict and
    // reran it in the same request, and the rerun completed.
    const completions = world.entryCompletions;
    measure(
      "entryCompletions",
      completions.map((entry) => ({
        requestId: entry.requestId,
        error: entry.error,
        willRetry: (entry as { willRetry?: boolean }).willRetry ?? null,
        occTable:
          (entry as { occInfo?: { tableName?: string } | null }).occInfo
            ?.tableName ?? null,
      })),
    );
    const retried = completions.filter(
      (entry) => (entry as { willRetry?: boolean }).willRetry === true,
    );
    expect(
      retried.length,
      "the two calls did not overlap: no internal-entry commit was retried",
    ).toBe(1);
    const [conflicted] = retried;
    expect((conflicted as { occInfo?: object | null }).occInfo).not.toBeNull();
    const rerun = completions.filter(
      (entry) =>
        entry.requestId === conflicted?.requestId && entry !== conflicted,
    );
    expect(rerun.map((entry) => entry.error)).toEqual([null]);
  }
}
// Distinct operations among the depot's events, the setup call's left out.
export async function thenEffects(
  world: ReceiptWorld,
  { effects }: { effects: number },
) {
  const stored = await storedNow(required(world.backend, "the backend"));
  const prior = world.prior?.response.operationId;
  const operations = new Set(
    stored.events
      .map((event) => event.operationId)
      .filter((operationId) => operationId !== prior),
  );
  measure("depotEvents", stored.events.length);
  expect(operations.size).toBe(effects);
  // Each committed operation is one event set: AddStock on one product appends one event.
  for (const operationId of operations)
    expect(
      stored.events.filter((event) => event.operationId === operationId),
    ).toHaveLength(1);
  // The saved stock agrees with the recorded events: each row holds what its events add up to, at the
  // version of its last event, and a committed effect left at least one row.
  const stock = stored.streams.filter((row) => row.streamType === "stock");
  if (effects > 0) expect(stock.length).toBeGreaterThan(0);
  for (const row of stock) {
    const own = stored.events.filter(
      (event) =>
        event.tenantId === row.tenantId &&
        event.streamType === "stock" &&
        event.streamId === row.streamId,
    );
    const onHand = own.reduce(
      (sum, event) =>
        sum +
        (event.eventType === "claimed" ? -1 : 1) *
          Number((event.payload as { quantity: number }).quantity),
      0,
    );
    expect({ state: row.state, version: row.streamVersion }).toEqual({
      state: { onHand },
      version: own.length,
    });
  }
}
export async function thenReceipts(
  world: ReceiptWorld,
  { receipts }: { receipts: number },
) {
  const stored = await storedNow(required(world.backend, "the backend"));
  expect(keyRows(world, stored)).toHaveLength(receipts);
  expect(stored.receipts).toHaveLength(receipts);
}
// The operation whose outcome the example keeps: the setup call's, or the one applied answer.
function originalOperation(world: ReceiptWorld): string {
  if (world.prior !== undefined) return world.prior.response.operationId;
  const answers = required(world.answers, "the answers");
  const applied = answers.find((answer) => describe(answer) === "applied");
  if (applied !== undefined) return responseOf(applied).operationId;
  const [receipt] = keyRows(world, required(world.afterOriginal, "the store"));
  return String(required(receipt, "the receipt").operationId);
}
export async function thenUnchanged(
  world: ReceiptWorld,
  { unchanged }: { unchanged: boolean },
) {
  const backend = required(world.backend, "the backend");
  const now = await storedNow(backend);
  const operationId = originalOperation(world);
  const snapshot = world.prior?.stored ?? world.afterOriginal;
  const checks = {
    receiptNamesTheOriginal:
      keyRows(world, now).length > 0 &&
      keyRows(world, now).every((row) => row.operationId === operationId),
    streamsAtTheOriginal:
      now.streams.length > 0 &&
      now.streams.every((row) => row.lastOperationId === operationId),
    // Byte for byte, system fields included, against the store right after the original committed.
    sameAsAfterTheOriginal:
      snapshot === undefined ||
      JSON.stringify(now) === JSON.stringify(snapshot),
  };
  measure("unchangedChecks", checks);
  expect(Object.values(checks).every(Boolean), JSON.stringify(checks)).toBe(
    unchanged,
  );
}
// After the example's own steps: a replay with the fixture's fail-if-run part on, and the control
// that shows on the same deployment that the part fails a call that reaches it.
export async function replayWithPartOn(
  world: ReceiptWorld,
  part: SwitchName,
  control: (answer: Answer) => void,
) {
  const backend = required(world.backend, "the backend");
  await setSwitch(world, part, true);
  const before = await storedNow(backend);
  const replay = await send(world);
  expect(describe(replay)).toBe("replayed");
  expect(responseOf(replay).operationId).toBe(originalOperation(world));
  expect(await storedNow(backend)).toEqual(before);
  const fresh = await send(world, { requestKey: "k-control" });
  control(fresh);
  expect(await storedNow(backend)).toEqual(before);
}
export function expectTransient(code: SwitchName) {
  return (answer: Answer) =>
    expect(errorData(answer)).toMatchObject({ kind: "transient", code });
}
export function expectFaultInjected(commandType: string) {
  return (answer: Answer) => {
    expect(describe(answer)).toMatch(/^technical failure/);
    expect(String((answer as { error: unknown }).error)).toContain(
      `Fault injected: ${commandType} failed after its context call returned`,
    );
  };
}

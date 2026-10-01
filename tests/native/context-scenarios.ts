import type { ConvexHttpClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect } from "vitest";
import { internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import type { CompletionRecord, LogMark } from "../../harness/admin.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
// Shared by the native tests of the context component's examples. Every call goes through a fixture
// command's public entry from an ordinary client. Admin access only grants, and reads the depot's
// tables and the function log.
export const tenantId = "t-1";
// What one caller received: the response, or the error the client threw.
export type Answer =
  { kind: "response"; response: Value } | { kind: "error"; error: unknown };
export async function answerOf(call: Promise<Value>): Promise<Answer> {
  return call.then(
    (response) => ({ kind: "response", response }),
    (error: unknown) => ({ kind: "error", error }),
  );
}
// The rejection data a ConvexError carries, or undefined for any other answer.
export function rejectionOf(
  answer: Answer,
): { code: string; details?: Record<string, Value> } | undefined {
  if (answer.kind !== "error" || !(answer.error instanceof ConvexError))
    return undefined;
  const data = answer.error.data as {
    kind?: unknown;
    code?: unknown;
    details?: Record<string, Value>;
  };
  if (data.kind !== "rejection" || typeof data.code !== "string")
    return undefined;
  return data.details === undefined
    ? { code: data.code }
    : { code: data.code, details: data.details };
}
// An outcome as the example's vocabulary names it.
export function outcomeOf(answer: Answer): "applied" | "rejection" | "other" {
  if (
    answer.kind === "response" &&
    (answer.response as { kind?: unknown }).kind === "applied"
  )
    return "applied";
  return rejectionOf(answer) === undefined ? "other" : "rejection";
}
// An ordinary client of a fixture-issuer subject that an operator granted both depot permissions in
// the tenant, with no subject, so it covers every document.
export async function grantedClient(
  backend: Backend,
  subject: string,
): Promise<ConvexHttpClient> {
  const principalId = `${backend.issuer.issuer}|${subject}`;
  for (const permission of [permissions.documents, permissions.stock])
    await backend.admin.run(getFunctionName(internal.grants.grant), {
      tenantId,
      principalKind: "human",
      principalId,
      permission,
      grantedBy: "native-test",
    });
  return ordinaryClient(backend.url, {
    token: await backend.issuer.token(subject),
  });
}
export type StreamRow = {
  streamType: string;
  streamId: string;
  streamVersion: number;
  state: Record<string, Value>;
};
export type EventRow = {
  streamType: string;
  streamId: string;
  streamVersion: number;
  eventType: string;
  payload: Record<string, Value>;
};
export async function depotTables(backend: Backend) {
  return {
    streams: (await backend.admin.readTable("streams", {
      component: "depot",
    })) as unknown as StreamRow[],
    events: (await backend.admin.readTable("events", {
      component: "depot",
    })) as unknown as EventRow[],
  };
}
export async function streamRow(
  backend: Backend,
  streamType: string,
  streamId: string,
): Promise<StreamRow | undefined> {
  const { streams } = await depotTables(backend);
  const rows = streams.filter(
    (row) => row.streamType === streamType && row.streamId === streamId,
  );
  expect(rows.length).toBeLessThanOrEqual(1);
  return rows[0];
}
export async function eventsOf(
  backend: Backend,
  streamType: string,
  streamId: string,
): Promise<EventRow[]> {
  const { events } = await depotTables(backend);
  return events
    .filter((row) => row.streamType === streamType && row.streamId === streamId)
    .sort((a, b) => a.streamVersion - b.streamVersion);
}
// A completion record as the backend writes it. The harness's type leaves out the two fields that
// tell an attempt the engine will rerun after an OCC conflict from a final one.
export type Attempt = CompletionRecord & {
  willRetry?: boolean;
  occInfo?: { tableName?: string; retryCount?: number } | null;
};
export const isRetried = (record: Attempt) => record.willRetry === true;
// The attempts of a parent function since the mark, in time order, once its final attempts number
// calls. The pinned backend writes no record of its own for a component call the parent makes.
export async function attemptsSince(
  backend: Backend,
  mark: LogMark,
  identifier: string,
  calls: number,
): Promise<Attempt[]> {
  const ofParent = (records: readonly CompletionRecord[]) =>
    (records as readonly Attempt[]).filter(
      (record) =>
        record.identifier === identifier && record.componentPath === null,
    );
  const records = await backend.admin.completionsSince(
    mark,
    (all) =>
      ofParent(all).filter((record) => !isRetried(record)).length >= calls,
  );
  return ofParent(records).sort((a, b) => a.timestamp - b.timestamp);
}
// One race of concurrent callers, with the depot's tables just before it and the parent's attempts.
export type Round = {
  key: string;
  before: Awaited<ReturnType<typeof depotTables>>;
  answers: Answer[];
  attempts: Attempt[];
};
// Sends the calls of one round at once, each from its own client, and repeats on a fresh key until
// the function log shows the engine rerunning an attempt after an OCC conflict. Serial execution
// gives the same answers, so a round without a rerun does not show that the retry is invisible.
export async function raceUntilRetried(
  backend: Backend,
  parent: string,
  options: {
    keys: readonly string[];
    prepare: (key: string) => Promise<void>;
    send: (key: string) => Promise<Value>[];
  },
): Promise<Round[]> {
  const rounds: Round[] = [];
  for (const [index, key] of options.keys.entries()) {
    if (index > 0) await options.prepare(key);
    const before = await depotTables(backend);
    const mark = await backend.admin.logMark();
    const calls = options.send(key);
    const answers = await Promise.all(calls.map(answerOf));
    const attempts = await attemptsSince(backend, mark, parent, calls.length);
    rounds.push({ key, before, answers, attempts });
    if (attempts.some(isRetried)) break;
  }
  return rounds;
}
// A round's answers in the order the callers' final attempts completed in the function log: a final
// attempt that failed pairs with an error, one that succeeded with a response.
export function inCommitOrder(round: Round): Answer[] {
  const responses = round.answers.filter(
    (answer) => answer.kind === "response",
  );
  const errors = round.answers.filter((answer) => answer.kind === "error");
  const ordered: Answer[] = [];
  for (const attempt of round.attempts.filter((record) => !isRetried(record))) {
    const answer = (attempt.error === null ? responses : errors).shift();
    if (answer !== undefined) ordered.push(answer);
  }
  return [...ordered, ...responses, ...errors];
}

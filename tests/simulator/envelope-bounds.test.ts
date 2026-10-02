import type { FunctionArgs } from "convex/server";
import { ConvexError, getConvexSize, type Value } from "convex/values";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import {
  app,
  caller,
  create,
  expectEmpty,
  failure,
  issuer,
  rejection,
  stored,
  name,
} from "./command-boundary-support.js";

// spec:command.command-pipeline, step 1 and limitCallText.
test.each([
  { encoding: "ASCII", correlationId: "a".repeat(256) },
  { encoding: "multibyte", correlationId: "é".repeat(128) },
])(
  name("correlationId accepts exactly 256 UTF-8 bytes of $encoding text"),
  async ({ correlationId }) => {
    const t = app();
    const alice = await caller(t);
    expect(
      await alice.mutation(api.depotCommands.createDocument, {
        ...create(),
        correlationId,
      }),
    ).toMatchObject({ kind: "applied", replayed: false });
    expect((await stored(t)).events[0]).toMatchObject({ correlationId });
  },
);
test.each([
  [257, "a".repeat(257)],
  [258, "€".repeat(86)],
  [32768, "c".repeat(32768)],
] as const)(
  name("correlationId rejects %i UTF-8 bytes"),
  async (length, correlationId) => {
    const t = app();
    const alice = await caller(t);
    const data = await rejection(
      alice.mutation(api.depotCommands.createDocument, {
        ...create(),
        correlationId,
      }),
    );
    expect(data).toMatchObject({
      kind: "rejection",
      code: "invalidInput",
      commandType: "CreateDocument",
    });
    expect(data.details).toEqual({
      field: "correlationId",
      length,
      limit: 256,
    });
    await expectEmpty(t);
  },
);
test(
  name("tenantId rejects 258 UTF-8 bytes before authorization"),
  async () => {
    const t = app();
    const alice = await caller(t);
    const data = await rejection(
      alice.mutation(api.depotCommands.createDocument, {
        ...create(),
        tenantId: "é".repeat(129),
      }),
    );
    expect(data).toMatchObject({ code: "invalidInput" });
    expect(data.details).toEqual({
      field: "tenantId",
      length: 258,
      limit: 256,
    });
    await expectEmpty(t);
  },
);
test(name("tenantId at 256 bytes reaches authorization"), async () => {
  const t = app();
  const alice = await caller(t);
  expect(
    await rejection(
      alice.mutation(api.depotCommands.createDocument, {
        ...create(),
        tenantId: "a".repeat(256),
      }),
    ),
  ).toMatchObject({ code: "forbidden" });
  await expectEmpty(t);
});
test(name("requestKey at 256 bytes executes and replays"), async () => {
  const t = app();
  const alice = await caller(t);
  const args = { ...create(), requestKey: "a".repeat(256) };
  const first = await alice.mutation(api.depotCommands.createDocument, args);
  expect(first).toMatchObject({ kind: "applied", replayed: false });
  expect(
    await alice.mutation(api.depotCommands.createDocument, args),
  ).toMatchObject({ replayed: true, operationId: first.operationId });
  expect((await stored(t)).receipts).toHaveLength(1);
});
test(name("requestKey rejects 258 UTF-8 bytes"), async () => {
  const t = app();
  const alice = await caller(t);
  const data = await rejection(
    alice.mutation(api.depotCommands.createDocument, {
      ...create(),
      requestKey: "é".repeat(129),
    }),
  );
  expect(data).toMatchObject({ code: "invalidInput" });
  expect(data.details).toEqual({
    field: "requestKey",
    length: 258,
    limit: 256,
  });
  await expectEmpty(t);
});
type InternalArgs = FunctionArgs<
  typeof internal.depotCommands.createDocumentInternal
>;
const internalArgs = (): InternalArgs => ({
  ...create(),
  namespace: "worker",
  actor: { kind: "human", id: `${issuer}|alice` },
});
const fields: {
  field: string;
  limit: number;
  set: (args: InternalArgs, value: string) => void;
}[] = [
  {
    field: "actor.id",
    limit: 512,
    set: (a, v) => {
      a.actor.id = v;
    },
  },
  {
    field: "actor.issuer",
    limit: 256,
    set: (a, v) => {
      a.actor.issuer = v;
    },
  },
  {
    field: "actor.onBehalfOf.id",
    limit: 512,
    set: (a, v) => {
      a.actor.onBehalfOf = { kind: "reviewer", id: v };
    },
  },
  {
    field: "actor.delegationRef",
    limit: 256,
    set: (a, v) => {
      a.actor.delegationRef = v;
    },
  },
  ...(["tenantId", "contextId", "eventId"] as const).map((field) => ({
    field: `causedBy.${field}`,
    limit: 256,
    set: (a: InternalArgs, v: string) => {
      a.causedBy = {
        kind: "event",
        tenantId: "t-1",
        contextId: "depot",
        eventId: "event",
        [field]: v,
      };
    },
  })),
  {
    field: "causedBy.commandType",
    limit: 256,
    set: (a, v) => {
      a.causedBy = { kind: "command", commandType: v };
    },
  },
  {
    field: "causedBy.migrationName",
    limit: 256,
    set: (a, v) => {
      a.causedBy = { kind: "migration", migrationName: v };
    },
  },
];
test.each(fields)(
  name("$field accepts its exact byte bound"),
  async ({ limit, set }) => {
    const t = app();
    await caller(t);
    const args = internalArgs();
    set(args, "a".repeat(limit));
    // Give the actual actor authority as well, so a successful write proves the bound passed.
    await t.mutation(internal.grants.grant, {
      tenantId: "t-1",
      principalKind: args.actor.kind,
      principalId: args.actor.id,
      permission: "depot.documents",
      grantedBy: "operator",
    });
    expect(
      await t.mutation(internal.depotCommands.createDocumentInternal, args),
    ).toMatchObject({ kind: "applied" });
  },
);
test.each(fields)(
  name("$field rejects one byte above its bound"),
  async ({ field, limit, set }) => {
    const t = app();
    await caller(t);
    const args = internalArgs();
    set(args, "a".repeat(limit + 1));
    const data = await rejection(
      t.mutation(internal.depotCommands.createDocumentInternal, args),
    );
    expect(data).toMatchObject({
      code: "invalidInput",
      commandType: "CreateDocument",
    });
    expect(data.details).toEqual({ field, length: limit + 1, limit });
    await expectEmpty(t);
  },
);
test.each(fields)(
  name("$field rejects multibyte text above its byte bound"),
  async ({ field, limit, set }) => {
    const t = app();
    await caller(t);
    const args = internalArgs();
    set(args, "é".repeat(limit / 2) + "a");
    const data = await rejection(
      t.mutation(internal.depotCommands.createDocumentInternal, args),
    );
    expect(data).toMatchObject({
      code: "invalidInput",
      commandType: "CreateDocument",
    });
    expect(data.details).toEqual({ field, length: limit + 1, limit });
    await expectEmpty(t);
  },
);
// limitCallText as the Spec lists it: each field's path and bound, in the order step 1 checks them.
function specCallText(): { field: string; limit: number }[] {
  const spec = readFileSync(
    join(
      import.meta.dirname,
      "../../design/specs/command/command-pipeline.sdp.md",
    ),
    "utf8",
  );
  const line = spec
    .split("\n")
    .find((text) => text.startsWith("- limitCallText:"));
  if (line === undefined)
    throw new Error("The pipeline Spec has no limitCallText");
  const list = line.slice(0, line.indexOf(";"));
  return Array.from(list.matchAll(/`([A-Za-z.]+)` (\d+)/g), (match) => ({
    field: match[1]!,
    limit: Number(match[2]),
  }));
}
type CauseKind = "command" | "event" | "migration";
// Sets one caller-set text field and leaves the others as they are, so two travel in one call.
// cause names the kind of causedBy the field belongs to: one call carries one kind.
const setters: Record<
  string,
  { cause?: CauseKind; set: (args: InternalArgs, value: string) => void }
> = {
  tenantId: { set: (a, v) => void (a.tenantId = v) },
  requestKey: { set: (a, v) => void (a.requestKey = v) },
  correlationId: { set: (a, v) => void (a.correlationId = v) },
  "actor.id": { set: (a, v) => void (a.actor.id = v) },
  "actor.issuer": { set: (a, v) => void (a.actor.issuer = v) },
  "actor.onBehalfOf.id": {
    set: (a, v) => void (a.actor.onBehalfOf = { kind: "reviewer", id: v }),
  },
  "actor.delegationRef": { set: (a, v) => void (a.actor.delegationRef = v) },
  "causedBy.commandType": {
    cause: "command",
    set: (a, v) => void (a.causedBy = { kind: "command", commandType: v }),
  },
  ...Object.fromEntries(
    (["tenantId", "contextId", "eventId"] as const).map((field) => [
      `causedBy.${field}`,
      {
        cause: "event" as const,
        set: (a: InternalArgs, v: string) => {
          a.causedBy = {
            kind: "event",
            tenantId: "t-1",
            contextId: "depot",
            eventId: "event",
            ...(a.causedBy?.kind === "event" ? a.causedBy : {}),
            [field]: v,
          };
        },
      },
    ]),
  ),
  "causedBy.migrationName": {
    cause: "migration",
    set: (a, v) => void (a.causedBy = { kind: "migration", migrationName: v }),
  },
};
const callText = specCallText();
const setterOf = (field: string) => {
  const setter = setters[field];
  if (setter === undefined) throw new Error(`No setter for ${field}`);
  return setter;
};
// Each neighbouring pair of the list that one call can carry together.
const neighbours = callText
  .slice(1)
  .map((later, index) => ({ earlier: callText[index]!, later }))
  .filter(({ earlier, later }) => {
    const [a, b] = [setterOf(earlier.field).cause, setterOf(later.field).cause];
    return a === undefined || b === undefined || a === b;
  });
test(
  name(
    "limitCallText lists twelve fields, and nine of its neighbouring pairs can travel in one call",
  ),
  () => {
    expect(callText.map(({ field }) => field).sort()).toEqual(
      Object.keys(setters).sort(),
    );
    expect(neighbours).toHaveLength(9);
  },
);
test.each(
  neighbours.map(({ earlier, later }) => ({
    first: earlier.field,
    second: later.field,
    earlier,
    later,
  })),
)(
  name("$first is checked before $second when both are above their bounds"),
  async ({ earlier, later }) => {
    const t = app();
    await caller(t);
    const args = internalArgs();
    for (const { field, limit } of [earlier, later])
      setterOf(field).set(args, "x".repeat(limit + 1));
    const data = await rejection(
      t.mutation(internal.depotCommands.createDocumentInternal, args),
    );
    expect(data).toMatchObject({ code: "invalidInput" });
    expect(data.details).toEqual({
      field: earlier.field,
      length: earlier.limit + 1,
      limit: earlier.limit,
    });
    await expectEmpty(t);
  },
);
test(
  name("the public actor tokenIdentifier is measured in UTF-8 bytes"),
  async () => {
    const t = app();
    const alice = t.withIdentity({
      issuer,
      subject: "alice",
      tokenIdentifier: "é".repeat(257),
    });
    const data = await rejection(
      alice.mutation(api.depotCommands.createDocument, create()),
    );
    expect(data).toMatchObject({ code: "invalidInput" });
    expect(data.details).toEqual({
      field: "actor.id",
      length: 514,
      limit: 512,
    });
    await expectEmpty(t);
  },
);
// spec:context.persistence-adapter, step1 and errorCodeInvalidInput.
test(name("a streamId at 256 bytes commits through the command"), async () => {
  const t = app();
  const alice = await caller(t);
  expect(
    await alice.mutation(
      api.depotCommands.createDocument,
      create("a".repeat(256)),
    ),
  ).toMatchObject({ kind: "applied" });
});
test.each([
  [257, "a".repeat(257)],
  [258, "é".repeat(129)],
] as const)(
  name("the command relays an overlong streamId rejection of %i bytes"),
  async (length, streamId) => {
    const t = app();
    const alice = await caller(t);
    const data = await rejection(
      alice.mutation(api.depotCommands.createDocument, create(streamId)),
    );
    expect(data).toMatchObject({
      kind: "rejection",
      code: "invalidInput",
      commandType: "CreateDocument",
    });
    expect(data.details).toEqual({ field: "streamId", length, limit: 256 });
    await expectEmpty(t);
  },
);
const directArgs = (
  streamId: string,
  correlationId: string,
  operationId = "00000000-0000-4000-8000-000000000000",
) => ({
  tenantId: "t-1",
  actor: { kind: "human" as const, id: "alice" },
  operation: {
    operationId,
    correlationId,
    causedBy: { kind: "command" as const, commandType: "CreateDocument" },
  },
  input: { documents: [{ documentId: streamId, title: "Report" }] },
});
function eventOf(outcome: unknown): Record<string, Value> & { payload: Value } {
  return (
    outcome as {
      streams: { events: (Record<string, Value> & { payload: Value })[] }[];
    }
  ).streams[0]!.events[0]!;
}
// spec:context.journal, limitEnvelopeCheck. Equal length stream IDs preserve the byte count.
test.each([4096, 4097])(
  name("a direct context call enforces an envelope of %i bytes"),
  async (bytes) => {
    const t = app();
    const sample = eventOf(
      await t.mutation(
        internal.depotRelay.createDocuments,
        directArgs("sample", "x"),
      ),
    );
    const measured = getConvexSize(sample) - getConvexSize(sample.payload);
    const args = directArgs("target", "x".repeat(1 + bytes - measured));
    const before = await stored(t);
    if (bytes === 4096) {
      const event = eventOf(
        await t.mutation(internal.depotRelay.createDocuments, args),
      );
      expect(getConvexSize(event) - getConvexSize(event.payload)).toBe(4096);
    } else {
      const error = await failure(
        t.mutation(internal.depotRelay.createDocuments, args),
      );
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ConvexError);
      expect(String(error)).toContain("4097");
      expect(String(error)).toContain("4096");
      expect(String(error)).toContain(sample.eventType);
      expect(await stored(t)).toEqual(before);
    }
  },
);
test(
  name("a direct caller cannot evade the envelope bound through operationId"),
  async () => {
    const t = app();
    const error = await failure(
      t.mutation(
        internal.depotRelay.createDocuments,
        directArgs("target", "x", "o".repeat(5000)),
      ),
    );
    expect(error).not.toBeInstanceOf(ConvexError);
    expect(String(error)).toContain("4096");
    await expectEmpty(t);
  },
);

import { convexTest } from "convex-test";
import { ConvexError, getConvexSize, type Value } from "convex/values";
import { expect, test } from "vitest";
import schema from "../../fixture/convex/depot/schema.js";
import {
  append,
  createJournal,
  type EnvelopeInput,
  type LoadedStream,
} from "../../src/context/index.js";
import { failure, name } from "./command-boundary-support.js";

// spec:context.journal, limitEnvelopeCheck, includes occurredAt and every event type.
test.each(["documentCreated", "baseline"])(
  name("append counts occurredAt in the bound for %s"),
  async (eventType) => {
    const t = convexTest(
      schema,
      import.meta.glob("../../fixture/convex/depot/**/*.ts"),
    );
    const journal = createJournal({
      contextId: "depot",
      history: "rebuildable",
    });
    const write = (streamId: string, correlationId: string) =>
      t.mutation(async (ctx) => {
        const envelope: EnvelopeInput = {
          tenantId: "t-1",
          contextId: "depot",
          streamType: "document",
          streamId,
          actor: { kind: "human", id: "alice" },
          recordedAt: 1,
          operation: {
            operationId: "00000000-0000-4000-8000-000000000000",
            correlationId,
            causedBy: { kind: "command", commandType: "CreateDocument" },
          },
        };
        const loaded: LoadedStream<null> = {
          state: null,
          version: 0,
          exists: false,
          meta: {
            tenantId: "t-1",
            contextId: "depot",
            streamType: "document",
            streamId,
            streamVersion: 0,
            stateSchemaVersion: 1,
          },
        };
        return append(
          ctx,
          journal,
          loaded,
          envelope,
          [{ eventType, eventSchemaVersion: 1, payload: {}, occurredAt: 1 }],
          0,
        );
      });
    const sample = (await write("sample", "x")).envelopes[0]!;
    const measured =
      getConvexSize(sample as Value) - getConvexSize(sample.payload as Value);
    const atBound = (await write("at-cap", "x".repeat(1 + 4096 - measured)))
      .envelopes[0]!;
    expect(
      getConvexSize(atBound as Value) - getConvexSize(atBound.payload as Value),
    ).toBe(4096);
    const before = await t.run((ctx) => ctx.db.query("events").collect());
    const error = await failure(
      write("beyond", "x".repeat(2 + 4096 - measured)),
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ConvexError);
    for (const text of [eventType, "4097", "4096"])
      expect(String(error)).toContain(text);
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toEqual(
      before,
    );
  },
);
// spec:context.journal, limitEnvelopeCheck: every event of an append is measured, not only the first.
test(
  name(
    "append refuses an oversized envelope on its second event and stores neither",
  ),
  async () => {
    const t = convexTest(
      schema,
      import.meta.glob("../../fixture/convex/depot/**/*.ts"),
    );
    const journal = createJournal({
      contextId: "depot",
      history: "rebuildable",
    });
    const write = (
      streamId: string,
      correlationId: string,
      occurredAt: (number | undefined)[],
    ) =>
      t.mutation(async (ctx) => {
        const envelope: EnvelopeInput = {
          tenantId: "t-1",
          contextId: "depot",
          streamType: "document",
          streamId,
          actor: { kind: "human", id: "alice" },
          recordedAt: 1,
          operation: {
            operationId: "00000000-0000-4000-8000-000000000000",
            correlationId,
            causedBy: { kind: "command", commandType: "CreateDocument" },
          },
        };
        const loaded: LoadedStream<null> = {
          state: null,
          version: 0,
          exists: false,
          meta: {
            tenantId: "t-1",
            contextId: "depot",
            streamType: "document",
            streamId,
            streamVersion: 0,
            stateSchemaVersion: 1,
          },
        };
        return append(
          ctx,
          journal,
          loaded,
          envelope,
          occurredAt.map((at) => ({
            eventType: "documentCreated",
            eventSchemaVersion: 1,
            payload: {},
            ...(at === undefined ? {} : { occurredAt: at }),
          })),
          0,
        );
      });
    const sample = (await write("sample", "x", [undefined])).envelopes[0]!;
    const measured =
      getConvexSize(sample as Value) - getConvexSize(sample.payload as Value);
    // Equal length stream IDs keep the count: the first event's envelope is exactly at the bound, and
    // the second carries occurredAt as well, which takes it above.
    const correlationId = "x".repeat(1 + 4096 - measured);
    const before = await t.run((ctx) => ctx.db.query("events").collect());
    const error = await failure(write("target", correlationId, [undefined, 1]));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ConvexError);
    expect(String(error)).toContain("4096");
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toEqual(
      before,
    );
    // The first event alone is at the bound and is stored.
    const [alone] = (await write("other1", correlationId, [undefined]))
      .envelopes;
    expect(
      getConvexSize(alone as Value) - getConvexSize(alone!.payload as Value),
    ).toBe(4096);
  },
);

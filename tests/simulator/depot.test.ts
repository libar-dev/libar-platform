import { convexTest } from "convex-test";
import { ConvexError, getConvexSize, v, type Value } from "convex/values";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { internal } from "../../fixture/convex/_generated/api.js";
import annexSchema from "../../fixture/convex/annex/schema.js";
import { api } from "../../fixture/convex/depot/_generated/api.js";
import depotSchema from "../../fixture/convex/depot/schema.js";
import {
  failIfDecidedMessage,
  faultTitles,
  journal,
} from "../../fixture/convex/depot/streams.js";
import schema from "../../fixture/convex/schema.js";
import {
  append,
  createJournal,
  load,
  planned,
  runOperation,
  type OperationDeclaration,
  type StreamRegistration,
} from "../../src/context/index.js";
import type { DecisionContext, DomainEvent } from "../../src/kernel/index.js";
const { version } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../node_modules/convex-test/package.json"),
    "utf8",
  ),
) as { version: string };
const name = (text: string) => `convex-test ${version}: ${text}`;
// The depot's own functions, run as an app of their own so that the test can read its tables.
function depot() {
  return convexTest(
    depotSchema,
    import.meta.glob("../../fixture/convex/depot/**/*.ts"),
  );
}
type Depot = ReturnType<typeof depot>;
const actor = { kind: "human", id: "user-1" } as const;
const operation = (operationId: string) => ({
  operationId,
  correlationId: "corr-1",
  causedBy: { kind: "command" as const, commandType: "fixture" },
});
function call<I>(input: I, operationId = "op-1") {
  return { tenantId: "t-1", actor, operation: operation(operationId), input };
}
const streams = (t: Depot) => t.run((ctx) => ctx.db.query("streams").collect());
const events = (t: Depot) => t.run((ctx) => ctx.db.query("events").collect());
async function rejected(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("The call did not fail");
    },
    (error: unknown) => error,
  );
}
async function rejection(promise: Promise<unknown>) {
  const error = await rejected(promise);
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<{ code: string; details?: Value }>).data;
}
async function technicalFailure(promise: Promise<unknown>, text: RegExp) {
  const error = await rejected(promise);
  expect(error).not.toBeInstanceOf(ConvexError);
  expect(String(error)).toMatch(text);
}
async function created(t: Depot, documentId = "doc-1", title = "Report") {
  return t.mutation(
    api.operations.createDocuments,
    call({ documents: [{ documentId, title }] }, `create-${documentId}`),
  );
}

describe("the depot's operations", () => {
  test(
    name(
      "a create commits one event and one stream row, and returns the DTO, version and envelope",
    ),
    async () => {
      const t = depot();
      const outcome = await created(t);
      const version = {
        tenantId: "t-1",
        contextId: "depot",
        streamType: "document",
        streamId: "doc-1",
        version: 1,
      };
      expect(outcome).toMatchObject({
        kind: "applied",
        result: { documents: [{ documentId: "doc-1", status: "draft" }] },
        versions: [version],
        streams: [
          {
            dto: {
              documentId: "doc-1",
              status: "draft",
              title: "Report",
              amendments: 0,
              version,
            },
            version,
            appended: 1,
            created: true,
          },
        ],
      });
      const [envelope] = outcome.streams[0]?.events ?? [];
      expect(envelope).toStrictEqual({
        eventId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        tenantId: "t-1",
        contextId: "depot",
        streamType: "document",
        streamId: "doc-1",
        streamVersion: 1,
        eventType: "created",
        eventSchemaVersion: 1,
        operationId: "create-doc-1",
        correlationId: "corr-1",
        causedBy: { kind: "command", commandType: "fixture" },
        actor,
        recordedAt: expect.any(Number),
        occurredAt: envelope?.recordedAt,
        payload: { title: "Report" },
      });
      const stored = await events(t);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject(envelope ?? {});
      expect(await streams(t)).toMatchObject([
        {
          tenantId: "t-1",
          contextId: "depot",
          streamType: "document",
          streamId: "doc-1",
          streamVersion: 1,
          stateSchemaVersion: 1,
          state: { status: "draft", title: "Report", amendments: 0 },
          lastOperationId: "create-doc-1",
          updatedAt: envelope?.recordedAt,
        },
      ]);
    },
  );

  test(
    name(
      "a second create of the same ID is entityExists before decide, and changes nothing",
    ),
    async () => {
      const t = depot();
      await created(t);
      const before = { streams: await streams(t), events: await events(t) };
      expect(await rejection(created(t, "doc-1", "Other"))).toMatchObject({
        code: "entityExists",
        details: { existing: "doc-1", current: 1 },
      });
      // A command whose decide would fail the call is answered the same way.
      expect(
        await rejection(
          t.mutation(
            api.operations.failIfDecided,
            call({ documents: [{ documentId: "doc-1", expectedVersion: 0 }] }),
          ),
        ),
      ).toMatchObject({ code: "entityExists" });
      expect({ streams: await streams(t), events: await events(t) }).toEqual(
        before,
      );
    },
  );

  test(
    name(
      "a named version other than the stream's is staleVersion before decide; the same command at the stream's version reaches decide",
    ),
    async () => {
      const t = depot();
      await created(t);
      await t.mutation(
        api.operations.submitDocuments,
        call({ documents: [{ documentId: "doc-1" }] }),
      );
      await t.mutation(
        api.operations.amendDocuments,
        call({ documents: [{ documentId: "doc-1", title: "Report, v2" }] }),
      );
      const before = { streams: await streams(t), events: await events(t) };
      for (const expectedVersion of [2, 4])
        expect(
          await rejection(
            t.mutation(
              api.operations.amendDocuments,
              call({
                documents: [
                  { documentId: "doc-1", title: "Late", expectedVersion },
                ],
              }),
            ),
          ),
        ).toMatchObject({
          code: "staleVersion",
          details: { expected: expectedVersion, current: 3 },
        });
      expect(
        await rejection(
          t.mutation(
            api.operations.failIfDecided,
            call({ documents: [{ documentId: "doc-1", expectedVersion: 2 }] }),
          ),
        ),
      ).toMatchObject({ code: "staleVersion" });
      await technicalFailure(
        t.mutation(
          api.operations.failIfDecided,
          call({ documents: [{ documentId: "doc-1", expectedVersion: 3 }] }),
        ),
        new RegExp(failIfDecidedMessage),
      );
      expect({ streams: await streams(t), events: await events(t) }).toEqual(
        before,
      );
      const amended = await t.mutation(
        api.operations.amendDocuments,
        call({
          documents: [
            { documentId: "doc-1", title: "Reviewed", expectedVersion: 3 },
          ],
        }),
      );
      expect(amended.versions[0]?.version).toBe(4);
    },
  );

  test(
    name(
      "a rejection from decide is thrown with the context's code and nothing commits",
    ),
    async () => {
      const t = depot();
      await created(t);
      const before = { streams: await streams(t), events: await events(t) };
      expect(
        await rejection(
          t.mutation(
            api.operations.shipDocuments,
            call({ documents: [{ documentId: "doc-1" }] }),
          ),
        ),
      ).toStrictEqual({
        code: "invalidTransition",
        message: "A document cannot ship from draft",
        details: { from: "draft", trigger: "ship" },
      });
      expect({ streams: await streams(t), events: await events(t) }).toEqual(
        before,
      );
    },
  );

  test(
    name(
      "a rejection on a later stream of the call rolls back the streams before it",
    ),
    async () => {
      const t = depot();
      await created(t);
      const before = { streams: await streams(t), events: await events(t) };
      expect(
        await rejection(
          t.mutation(
            api.operations.createDocuments,
            call({
              documents: [
                { documentId: "doc-2", title: "New" },
                { documentId: "doc-1", title: "Again" },
              ],
            }),
          ),
        ),
      ).toMatchObject({ code: "entityExists", details: { existing: "doc-1" } });
      expect({ streams: await streams(t), events: await events(t) }).toEqual(
        before,
      );
    },
  );

  test(
    name(
      "registering a document claims its reference first, and a taken reference creates no document",
    ),
    async () => {
      const t = depot();
      const first = await t.mutation(
        api.operations.registerDocuments,
        call({
          documents: [{ documentId: "doc-1", reference: "R-1", title: "One" }],
        }),
      );
      expect(first).toMatchObject({
        kind: "applied",
        result: { documents: [{ documentId: "doc-1", reference: "R-1" }] },
        versions: [
          { streamType: "reference", streamId: "R-1", version: 1 },
          { streamType: "document", streamId: "doc-1", version: 1 },
        ],
      });
      expect(
        await rejection(
          t.mutation(
            api.operations.registerDocuments,
            call({
              documents: [
                { documentId: "doc-2", reference: "R-1", title: "Two" },
              ],
            }),
          ),
        ),
      ).toMatchObject({
        code: "entityExists",
        details: { existing: "R-1", current: 1 },
      });
      // A free reference for a document that exists: the claim rolls back with the create.
      expect(
        await rejection(
          t.mutation(
            api.operations.registerDocuments,
            call({
              documents: [
                { documentId: "doc-1", reference: "R-2", title: "Three" },
              ],
            }),
          ),
        ),
      ).toMatchObject({ code: "entityExists", details: { existing: "doc-1" } });
      expect(
        (await streams(t)).map(({ streamType, streamId }) => [
          streamType,
          streamId,
        ]),
      ).toEqual([
        ["reference", "R-1"],
        ["document", "doc-1"],
      ]);
    },
  );

  test(
    name(
      "stock lines on one product become one claim, and a claim past what is on hand is insufficientStock",
    ),
    async () => {
      const t = depot();
      await t.mutation(
        api.operations.addStock,
        call({ lines: [{ productId: "p-1", quantity: 1 }] }),
      );
      const claimed = await t.mutation(
        api.operations.claimStock,
        call({ lines: [{ productId: "p-1", quantity: 1 }] }),
      );
      expect(claimed).toMatchObject({
        result: { lines: [{ productId: "p-1", quantity: 1 }] },
        versions: [{ streamId: "p-1", version: 2 }],
        streams: [{ dto: { productId: "p-1", onHand: 0 } }],
      });
      await t.mutation(
        api.operations.addStock,
        call({
          lines: [
            { productId: "p-1", quantity: 2 },
            { productId: "p-1", quantity: 3 },
          ],
        }),
      );
      expect(
        await rejection(
          t.mutation(
            api.operations.claimStock,
            call({
              lines: [
                { productId: "p-1", quantity: 3 },
                { productId: "p-1", quantity: 3 },
              ],
            }),
          ),
        ),
      ).toMatchObject({
        code: "insufficientStock",
        details: { requested: 6, onHand: 5 },
      });
      expect((await events(t)).map((event) => event.payload)).toEqual([
        { quantity: 1 },
        { quantity: 1 },
        { quantity: 5 },
      ]);
    },
  );

  test(
    name(
      "each stock line's quantity is checked before the lines are summed, and each sum again, so no invalid line commits",
    ),
    async () => {
      const t = depot();
      await t.mutation(
        api.operations.addStock,
        call({ lines: [{ productId: "p-1", quantity: 1 }] }),
      );
      const before = { streams: await streams(t), events: await events(t) };
      const refused = [
        { operation: api.operations.addStock, quantities: [-1, 2], bad: -1 },
        {
          operation: api.operations.addStock,
          quantities: [0.5, 0.5],
          bad: 0.5,
        },
        {
          operation: api.operations.addStock,
          quantities: [1.5, 1.5],
          bad: 1.5,
        },
        { operation: api.operations.claimStock, quantities: [6, -5], bad: -5 },
        {
          operation: api.operations.addStock,
          quantities: [Number.MAX_SAFE_INTEGER, 1],
          bad: Number.MAX_SAFE_INTEGER + 1,
        },
      ];
      for (const { operation, quantities, bad } of refused)
        expect(
          await rejection(
            t.mutation(
              operation,
              call({
                lines: quantities.map((quantity) => ({
                  productId: "p-1",
                  quantity,
                })),
              }),
            ),
          ),
        ).toMatchObject({
          code: "invalidQuantity",
          details: { quantity: bad },
        });
      expect({ streams: await streams(t), events: await events(t) }).toEqual(
        before,
      );
    },
  );

  test(
    name(
      "an addition that would take the count on hand past the largest safe whole number is stockLimitExceeded",
    ),
    async () => {
      const t = depot();
      const add = (quantity: number) =>
        t.mutation(
          api.operations.addStock,
          call({ lines: [{ productId: "p-1", quantity }] }),
        );
      await add(Number.MAX_SAFE_INTEGER - 1);
      await add(1);
      const before = { streams: await streams(t), events: await events(t) };
      expect(await rejection(add(1))).toMatchObject({
        code: "stockLimitExceeded",
        details: { quantity: 1, onHand: Number.MAX_SAFE_INTEGER },
      });
      expect({ streams: await streams(t), events: await events(t) }).toEqual(
        before,
      );
    },
  );

  test(
    name(
      "items on one document become one command on its stream, and two items that differ refuse the call as invalidInput",
    ),
    async () => {
      const t = depot();
      await created(t);
      const amend = (titles: string[]) =>
        t.mutation(
          api.operations.amendDocuments,
          call({
            documents: titles.map((title) => ({ documentId: "doc-1", title })),
          }),
        );
      expect(await amend(["Report, v2", "Report, v2"])).toMatchObject({
        versions: [{ streamId: "doc-1", version: 2 }],
        streams: [{ appended: 1 }],
      });
      const before = { streams: await streams(t), events: await events(t) };
      expect(await rejection(amend(["One", "Two"]))).toMatchObject({
        code: "invalidInput",
        details: { documentId: "doc-1" },
      });
      expect(
        await rejection(
          t.mutation(
            api.operations.submitDocuments,
            call({
              documents: [
                { documentId: "doc-1" },
                { documentId: "doc-1", expectedVersion: 2 },
              ],
            }),
          ),
        ),
      ).toMatchObject({ code: "invalidInput" });
      expect({ streams: await streams(t), events: await events(t) }).toEqual(
        before,
      );
      expect(
        await t.mutation(
          api.operations.submitDocuments,
          call({
            documents: [{ documentId: "doc-1" }, { documentId: "doc-1" }],
          }),
        ),
      ).toMatchObject({
        result: { documents: [{ documentId: "doc-1", status: "submitted" }] },
        versions: [{ streamId: "doc-1", version: 3 }],
      });
    },
  );

  test(
    name(
      "placing orders creates the documents and then claims the stock in one call, and a second create of an order is entityExists",
    ),
    async () => {
      const t = depot();
      await t.mutation(
        api.operations.addStock,
        call({ lines: [{ productId: "p-1", quantity: 1 }] }),
      );
      const order = {
        documents: [{ documentId: "order-1", title: "Order" }],
        lines: [{ productId: "p-1", quantity: 1 }],
      };
      expect(
        await t.mutation(api.operations.placeOrders, call(order)),
      ).toMatchObject({
        kind: "applied",
        result: {
          documents: [{ documentId: "order-1", status: "draft" }],
          lines: [{ productId: "p-1", quantity: 1 }],
        },
        versions: [
          { streamType: "document", streamId: "order-1", version: 1 },
          { streamType: "stock", streamId: "p-1", version: 2 },
        ],
      });
      const before = { streams: await streams(t), events: await events(t) };
      expect(
        await rejection(t.mutation(api.operations.placeOrders, call(order))),
      ).toMatchObject({
        code: "entityExists",
        details: { existing: "order-1" },
      });
      expect({ streams: await streams(t), events: await events(t) }).toEqual(
        before,
      );
    },
  );

  test(
    name(
      "a list above the operation's maxStreams is operationTooLarge before any write",
    ),
    async () => {
      const t = depot();
      const documents = Array.from({ length: 101 }, (_, index) => ({
        documentId: `doc-${index}`,
        title: "Many",
      }));
      expect(
        await rejection(
          t.mutation(api.operations.createDocuments, call({ documents })),
        ),
      ).toMatchObject({
        code: "operationTooLarge",
        details: { count: 101, max: 100 },
      });
      expect(await streams(t)).toEqual([]);
    },
  );

  test(
    name(
      "a fault after the journal append and a fault after the state write each fail the call as a technical failure and leave nothing",
    ),
    async () => {
      const t = depot();
      await created(t);
      const before = { streams: await streams(t), events: await events(t) };
      for (const title of Object.values(faultTitles))
        await technicalFailure(
          t.mutation(
            api.operations.amendDocuments,
            call({ documents: [{ documentId: "doc-1", title }] }),
          ),
          new RegExp(`Fault injected: ${title}`),
        );
      expect({ streams: await streams(t), events: await events(t) }).toEqual(
        before,
      );
    },
  );

  test(
    name(
      "a payload above 16,384 bytes and a row above its budget are technical failures",
    ),
    async () => {
      const t = depot();
      await created(t);
      await technicalFailure(
        t.mutation(
          api.operations.amendDocuments,
          call({
            documents: [{ documentId: "doc-1", title: "x".repeat(16400) }],
          }),
        ),
        /amended payload of \d+ bytes exceeds the 16384 byte bound/,
      );
      await technicalFailure(
        t.mutation(
          api.operations.amendDocuments,
          call({
            documents: [{ documentId: "doc-1", title: "x".repeat(16300) }],
          }),
        ),
        /would be saved at \d+ bytes, above its budget of 16384/,
      );
      expect((await streams(t))[0]?.streamVersion).toBe(1);
    },
  );

  test(
    name("a malformed input fails the operation's validator before any read"),
    async () => {
      const t = depot();
      await technicalFailure(
        t.mutation(
          api.operations.createDocuments,
          call({ documents: [{ documentId: "doc-1" }] }) as never,
        ),
        /ArgumentValidationError|Validator error/,
      );
    },
  );
});

describe("the adapter's guards", () => {
  type Counter = { total: number; deleted: boolean };
  type Add = {
    amounts: number[];
    kind?: "applied" | "businessFailure";
    deleted?: boolean;
    payload?: Value;
    schemaVersion?: number;
    occurredAt?: number;
  };
  type Added = DomainEvent<"added", Value>;
  function counter(
    overrides: Partial<StreamRegistration<Counter, Add, Added, number>> = {},
  ): StreamRegistration<Counter, Add, Added, number> {
    return {
      decider: {
        streamType: "counter",
        initial: () => ({ total: 0, deleted: false }),
        decide: (_state, command) => ({
          kind: command.kind ?? "applied",
          events: command.amounts.map((amount) => ({
            eventType: "added",
            eventSchemaVersion: command.schemaVersion ?? 1,
            payload: command.payload ?? { amount },
            ...(command.occurredAt === undefined
              ? {}
              : { occurredAt: command.occurredAt }),
          })),
          result: command.amounts.length,
        }),
        evolve: (state, event) => ({
          total:
            state.total + ((event.payload as { amount?: number }).amount ?? 0),
          deleted: (event.payload as { deleted?: boolean }).deleted ?? false,
        }),
        invariants: [
          { name: "totalAtMost1000", holds: (state) => state.total <= 1000 },
        ],
      },
      mapping: {
        kind: "single",
        budgetBytes: 4096,
        isDeleted: (state) => state.deleted,
      },
      stateSchemaVersion: 1,
      eventValidators: {
        added: v.object({
          amount: v.optional(v.number()),
          deleted: v.optional(v.boolean()),
        }),
      },
      dto: v.object({ total: v.number() }),
      toDto: (state) => ({ total: state.total }),
      ...overrides,
    };
  }
  function declaration(
    registration: StreamRegistration<Counter, Add, Added, number>,
    plan: (input: Add[]) => ReturnType<typeof planned>[],
    maxStreams = 256,
  ): OperationDeclaration<Add[], number[]> {
    return {
      name: "count",
      streams: [registration],
      input: {},
      returns: v.array(v.number()),
      plan,
      combine: (results) => results.map((result) => result.result as number),
      maxStreams,
    };
  }
  const args = (input: Add[]) => ({
    tenantId: "t-1",
    actor,
    operation: operation("op-guard"),
    input,
  });
  function run(
    t: Depot,
    registration: StreamRegistration<Counter, Add, Added, number>,
    input: Add[],
    plan = (commands: Add[]) =>
      commands.map((command, index) =>
        planned(registration, `c-${index}`, command),
      ),
  ) {
    return t.run((ctx) =>
      runOperation(ctx, journal, declaration(registration, plan), args(input)),
    );
  }

  test(
    name(
      "decide receives the call's actor, its facts or an empty record, and one now for every stream",
    ),
    async () => {
      const t = depot();
      const seen: DecisionContext[] = [];
      const base = counter();
      const registration = counter({
        decider: {
          ...base.decider,
          decide: (state, command, context) => {
            seen.push(context);
            return base.decider.decide(state, command, context);
          },
        },
      });
      const decl = declaration(registration, (input) =>
        input.map((command, index) =>
          planned(registration, `c-${index}`, command),
        ),
      );
      await t.run((ctx) =>
        runOperation(ctx, journal, decl, {
          ...args([{ amounts: [1] }, { amounts: [2] }]),
          facts: { price: 3 },
        }),
      );
      await t.run((ctx) =>
        runOperation(ctx, journal, decl, args([{ amounts: [1] }])),
      );
      expect(seen.map(({ actor, facts }) => ({ actor, facts }))).toEqual([
        { actor, facts: { price: 3 } },
        { actor, facts: { price: 3 } },
        { actor, facts: {} },
      ]);
      expect(seen[0]?.now).toBeTypeOf("number");
      expect(seen[1]?.now).toBe(seen[0]?.now);
    },
  );

  test(
    name(
      "the call is a business failure when any stream's result is, and applied otherwise",
    ),
    async () => {
      const t = depot();
      const registration = counter();
      expect(
        await run(t, registration, [
          { amounts: [1] },
          { amounts: [2], kind: "businessFailure" },
        ]),
      ).toMatchObject({ kind: "businessFailure", result: [1, 1] });
      expect(await run(t, registration, [{ amounts: [1, 2] }])).toMatchObject({
        kind: "applied",
        result: [2],
        versions: [{ streamId: "c-0", version: 3 }],
        streams: [{ appended: 2, created: false }],
      });
    },
  );

  test(
    name(
      "decide with no event, a payload its validator refuses, an event type with no validator and a broken invariant are technical failures",
    ),
    async () => {
      const t = depot();
      const registration = counter();
      await technicalFailure(
        run(t, registration, [{ amounts: [] }]),
        /returned applied with no event/,
      );
      await technicalFailure(
        run(t, registration, [{ amounts: [1], payload: { amount: "one" } }]),
        /payload does not match its validator/,
      );
      await technicalFailure(
        run(t, counter({ eventValidators: {} }), [{ amounts: [1] }]),
        /has no validator for added/,
      );
      await technicalFailure(
        run(t, registration, [{ amounts: [1001] }]),
        /breaks totalAtMost1000 after the fold/,
      );
      expect(await events(t)).toEqual([]);
    },
  );

  test(
    name(
      "a planned registration the operation does not declare is a technical failure",
    ),
    async () => {
      const t = depot();
      const declared = counter();
      const other = counter();
      await technicalFailure(
        t.run((ctx) =>
          runOperation(
            ctx,
            journal,
            declaration(declared, () => [
              planned(other, "c-0", { amounts: [1] }),
            ]),
            args([]),
          ),
        ),
        /does not declare/,
      );
      await technicalFailure(run(t, declared, []), /planned no stream command/);
    },
  );

  test(
    name(
      "plans whose stream budgets sum above 8 MiB are operationTooLarge with the byte details",
    ),
    async () => {
      const t = depot();
      const registration = counter({
        mapping: {
          kind: "single",
          budgetBytes: 262144,
          isDeleted: () => false,
        },
      });
      const input = Array.from({ length: 33 }, () => ({ amounts: [1] }));
      expect(await rejection(run(t, registration, input))).toMatchObject({
        code: "operationTooLarge",
        details: { bytes: 33 * 262144, maxBytes: 8388608 },
      });
    },
  );

  test(
    name(
      "a plan at the admitted bound of 8 MiB of stream budgets commits when its saved rows and events are small",
    ),
    async () => {
      const t = depot();
      const registration = counter({
        mapping: {
          kind: "single",
          budgetBytes: 262144,
          isDeleted: () => false,
        },
      });
      expect(
        await run(
          t,
          registration,
          Array.from({ length: 32 }, () => ({ amounts: [1] })),
        ),
      ).toMatchObject({ kind: "applied" });
      expect(await streams(t)).toHaveLength(32);
      expect(await events(t)).toHaveLength(32);
    },
  );

  test(
    name(
      "a call that writes more than 800 documents, or more than 8 MiB measured over its saved rows and appended events, is a technical failure",
    ),
    async () => {
      const t = depot();
      await technicalFailure(
        run(t, counter(), [{ amounts: Array.from({ length: 800 }, () => 0) }]),
        /wrote 801 documents/,
      );
      // 32 streams at 256 KiB are admitted. Each saves a row of about 250,000 bytes and appends an
      // event of about 16,000, which takes the measured write past 8 MiB.
      type Filled = { text: string };
      type Fill = { rowChars: number; eventChars: number };
      type FillEvent = DomainEvent<
        "filled",
        { rowChars: number; text: string }
      >;
      const filler: StreamRegistration<Filled, Fill, FillEvent, null> = {
        decider: {
          streamType: "filler",
          initial: () => ({ text: "" }),
          decide: (_state, { rowChars, eventChars }) => ({
            kind: "applied",
            events: [
              {
                eventType: "filled",
                eventSchemaVersion: 1,
                payload: { rowChars, text: "e".repeat(eventChars) },
              },
            ],
            result: null,
          }),
          evolve: (_state, event) => ({
            text: "r".repeat(event.payload.rowChars),
          }),
        },
        mapping: {
          kind: "single",
          budgetBytes: 262144,
          isDeleted: () => false,
        },
        stateSchemaVersion: 1,
        eventValidators: {
          filled: v.object({ rowChars: v.number(), text: v.string() }),
        },
        dto: v.object({}),
        toDto: () => ({}),
      };
      const fill: OperationDeclaration<Fill[], number> = {
        name: "fill",
        streams: [filler],
        input: {},
        returns: v.number(),
        plan: (input) =>
          input.map((command, index) => planned(filler, `f-${index}`, command)),
        combine: (results) => results.length,
        maxStreams: 256,
      };
      await technicalFailure(
        t.run((ctx) =>
          runOperation(ctx, journal, fill, {
            ...args([]),
            input: Array.from({ length: 32 }, () => ({
              rowChars: 250000,
              eventChars: 16000,
            })),
          }),
        ),
        /wrote 64 documents and \d+ bytes/,
      );
      expect(await events(t)).toEqual([]);
    },
  );

  test(
    name(
      "load carries the stream row's document ID when the row exists, and step 9 replaces the row by it with no second read",
    ),
    async () => {
      const t = depot();
      const registration = counter();
      expect(
        await t.run((ctx) => load(ctx, journal, registration, "t-1", "c-0")),
      ).not.toHaveProperty("rowId");
      await run(t, registration, [{ amounts: [1] }]);
      const [before] = await streams(t);
      expect(
        (await t.run((ctx) => load(ctx, journal, registration, "t-1", "c-0")))
          .rowId,
      ).toBe(before?._id);
      const tables = await t.run(async (ctx) => {
        const query = vi.spyOn(ctx.db, "query");
        await runOperation(
          ctx,
          journal,
          declaration(registration, (input) =>
            input.map((command) => planned(registration, "c-0", command)),
          ),
          args([{ amounts: [1] }]),
        );
        return query.mock.calls.map(([table]) => table);
      });
      expect(tables).toEqual(["streams", "events"]);
      const [after] = await streams(t);
      expect(after).toMatchObject({ _id: before?._id, streamVersion: 2 });
    },
  );

  test(
    name(
      "deletedAt is set when isDeleted becomes true, kept while it stays true and cleared when it turns false",
    ),
    async () => {
      const t = depot();
      const registration = counter();
      const one = (deleted: boolean) => [
        { amounts: [1], payload: { amount: 1, deleted } },
      ];
      await run(t, registration, one(true));
      const [first] = await streams(t);
      expect(first?.deletedAt).toBeTypeOf("number");
      expect(first?.deletedAt).toBe(first?.updatedAt);
      const later = vi
        .spyOn(Date, "now")
        .mockReturnValue((first?.updatedAt ?? 0) + 1000);
      await run(t, registration, one(true));
      later.mockRestore();
      const [second] = await streams(t);
      expect(second?.updatedAt).toBe((first?.updatedAt ?? 0) + 1000);
      expect(second?.deletedAt).toBe(first?.deletedAt);
      await run(t, registration, one(false));
      expect((await streams(t))[0]).not.toHaveProperty("deletedAt");
    },
  );

  test(
    name(
      "a row saved under another state schema version, and an event above the row's version, are technical failures",
    ),
    async () => {
      const t = depot();
      const registration = counter();
      await run(t, registration, [{ amounts: [1] }]);
      const [row] = await streams(t);
      expect(row).toBeDefined();
      for (const stateSchemaVersion of [0, 2]) {
        await t.run(async (ctx) => {
          if (row !== undefined)
            await ctx.db.patch(row._id, { stateSchemaVersion });
        });
        await technicalFailure(
          run(t, registration, [{ amounts: [1] }]),
          stateSchemaVersion === 0
            ? /saved under state schema version 0, older than this code's 1, and this adapter migrates no row/
            : /saved under state schema version 2, newer than this code's 1/,
        );
      }
      await t.run(async (ctx) => {
        if (row !== undefined)
          await ctx.db.patch(row._id, { stateSchemaVersion: 1 });
        const [event] = await ctx.db.query("events").collect();
        if (event !== undefined) {
          const { _id, _creationTime, ...copy } = event;
          void _id;
          void _creationTime;
          await ctx.db.insert("events", { ...copy, streamVersion: 2 });
        }
      });
      await technicalFailure(
        run(t, registration, [{ amounts: [1] }]),
        /holds version 2 above the expected 1: its row and its events disagree/,
      );
    },
  );

  test(
    name(
      "every event of one call carries one recordedAt, and the journal's contextId",
    ),
    async () => {
      const t = depot();
      const other = createJournal({
        contextId: "elsewhere",
        history: "rebuildable",
      });
      const registration = counter();
      const outcome = await t.run((ctx) =>
        runOperation(
          ctx,
          other,
          declaration(registration, (input) =>
            input.map((command, index) =>
              planned(registration, `c-${index}`, command),
            ),
          ),
          args([{ amounts: [1, 2] }, { amounts: [3] }]),
        ),
      );
      const stamps = outcome.streams.flatMap((stream) =>
        stream.events.map((event) => [event.contextId, event.recordedAt]),
      );
      expect(new Set(stamps.map(([, at]) => at)).size).toBe(1);
      expect(stamps.map(([contextId]) => contextId)).toEqual([
        "elsewhere",
        "elsewhere",
        "elsewhere",
      ]);
    },
  );

  test(
    name(
      "every event gets an event ID of its own, across one call and the next, and its ID finds that one event",
    ),
    async () => {
      const t = depot();
      const registration = counter();
      await run(t, registration, [{ amounts: [1, 2] }]);
      await run(t, registration, [{ amounts: [3] }]);
      const stored = await events(t);
      expect(stored).toHaveLength(3);
      expect(new Set(stored.map((event) => event.eventId)).size).toBe(3);
      for (const { eventId, streamVersion } of stored)
        expect(
          (
            await t.run((ctx) =>
              ctx.db
                .query("events")
                .withIndex("by_event_id", (q) =>
                  q.eq("tenantId", "t-1").eq("eventId", eventId),
                )
                .collect(),
            )
          ).map((event) => event.streamVersion),
        ).toEqual([streamVersion]);
    },
  );

  test(
    name(
      "an envelope carries the event's own schema version and occurredAt, and no occurredAt when the event has none",
    ),
    async () => {
      const t = depot();
      const outcome = await run(t, counter(), [
        { amounts: [1], schemaVersion: 3, occurredAt: 12345 },
        { amounts: [2], schemaVersion: 7 },
      ]);
      const envelopes = outcome.streams.flatMap((stream) => stream.events);
      expect(
        envelopes.map((event) => [event.eventSchemaVersion, event.occurredAt]),
      ).toEqual([
        [3, 12345],
        [7, undefined],
      ]);
      expect(envelopes[0]?.recordedAt).not.toBe(12345);
      expect(envelopes[1]).not.toHaveProperty("occurredAt");
      const stored = await events(t);
      expect(
        stored.map((event) => [event.eventSchemaVersion, event.occurredAt]),
      ).toEqual([
        [3, 12345],
        [7, undefined],
      ]);
      expect(stored[1]).not.toHaveProperty("occurredAt");
    },
  );

  test(
    name(
      "an event validator's ID field takes only an ID of its table, so a payload with any other string is a technical failure",
    ),
    async () => {
      const t = depot();
      await run(t, counter(), [{ amounts: [1] }]);
      const [row] = await streams(t);
      const linked = counter({
        eventValidators: {
          added: v.object({ ref: v.id("streams") }),
        },
      });
      await technicalFailure(
        run(t, linked, [{ amounts: [1], payload: { ref: "not-an-id" } }]),
        /payload does not match its validator/,
      );
      expect(await events(t)).toHaveLength(1);
      expect(
        await run(t, linked, [
          { amounts: [1], payload: { ref: row?._id ?? "" } },
        ]),
      ).toMatchObject({ kind: "applied" });
    },
  );

  test(
    name(
      "a stream row whose version has no event in the journal is a technical failure before any append",
    ),
    async () => {
      const t = depot();
      const registration = counter();
      await run(t, registration, [{ amounts: [5] }]);
      await run(t, registration, [{ amounts: [2] }]);
      await t.run(async (ctx) => {
        const tail = await ctx.db
          .query("events")
          .withIndex("by_stream", (q) =>
            q
              .eq("tenantId", "t-1")
              .eq("streamType", "counter")
              .eq("streamId", "c-0")
              .eq("streamVersion", 2),
          )
          .unique();
        if (tail !== null) await ctx.db.delete(tail._id);
      });
      await technicalFailure(
        run(t, registration, [{ amounts: [1] }]),
        /is at version 2 and its journal holds no event at that version: its row and its events disagree/,
      );
      expect((await events(t)).map((event) => event.streamVersion)).toEqual([
        1,
      ]);
      expect((await streams(t))[0]).toMatchObject({
        streamVersion: 2,
        state: { total: 7 },
      });
    },
  );

  test(
    name(
      "an append whose envelope names another context, tenant, stream type or stream ID than the one loaded throws before any read or insert",
    ),
    async () => {
      const t = depot();
      const registration = counter();
      const event = { eventType: "added", eventSchemaVersion: 1, payload: {} };
      const envelope = {
        tenantId: "t-1",
        contextId: journal.contextId,
        streamType: "counter",
        streamId: "c-0",
        operation: operation("op-append"),
        actor,
        recordedAt: 1,
      };
      for (const other of [
        { contextId: "elsewhere" },
        { tenantId: "t-2" },
        { streamType: "other" },
        { streamId: "c-1" },
      ]) {
        const touched = await t.run(async (ctx) => {
          const loaded = await load(ctx, journal, registration, "t-1", "c-0");
          const query = vi.spyOn(ctx.db, "query");
          const insert = vi.spyOn(ctx.db, "insert");
          const error = await append(
            ctx,
            journal,
            loaded,
            { ...envelope, ...other },
            [event],
            0,
          ).then(
            () => undefined,
            (thrown: unknown) => thrown,
          );
          return {
            error: String(error),
            convexError: error instanceof ConvexError,
            reads: query.mock.calls.length,
            inserts: insert.mock.calls.length,
          };
        });
        expect(touched).toMatchObject({
          error: expect.stringMatching(
            /names a stream other than the one loaded/,
          ),
          convexError: false,
          reads: 0,
          inserts: 0,
        });
      }
      expect(await events(t)).toEqual([]);
    },
  );

  test(
    name(
      "a stream row's baselineVersion is loaded and kept when a command saves the row",
    ),
    async () => {
      const t = depot();
      const registration = counter();
      await run(t, registration, [{ amounts: [1] }]);
      const [row] = await streams(t);
      await t.run(async (ctx) => {
        if (row !== undefined)
          await ctx.db.patch(row._id, { baselineVersion: 1 });
      });
      expect(
        (await t.run((ctx) => load(ctx, journal, registration, "t-1", "c-0")))
          .meta.baselineVersion,
      ).toBe(1);
      await run(t, registration, [{ amounts: [1] }]);
      expect((await streams(t))[0]).toMatchObject({
        streamVersion: 2,
        baselineVersion: 1,
      });
    },
  );

  test(
    name(
      "a plan of 256 streams commits and one of 257 is operationTooLarge, whatever maxStreams the operation declares",
    ),
    async () => {
      const t = depot();
      const registration = counter();
      const wide = (count: number) =>
        t.run((ctx) =>
          runOperation(
            ctx,
            journal,
            declaration(
              registration,
              (input) =>
                input.map((command, index) =>
                  planned(registration, `c-${index}`, command),
                ),
              300,
            ),
            args(Array.from({ length: count }, () => ({ amounts: [1] }))),
          ),
        );
      expect(await rejection(wide(257))).toMatchObject({
        code: "operationTooLarge",
        details: { count: 257, max: 256 },
      });
      expect(await streams(t)).toEqual([]);
      expect(await wide(256)).toMatchObject({ kind: "applied" });
      expect(await streams(t)).toHaveLength(256);
    },
  );

  test(
    name(
      "a payload of exactly 16,384 bytes is appended and one of 16,385 is a technical failure",
    ),
    async () => {
      const t = depot();
      const open = counter({ eventValidators: { added: v.any() } });
      const payload = (bytes: number) => {
        const text = "x".repeat(bytes - getConvexSize({ text: "" }));
        expect(getConvexSize({ text })).toBe(bytes);
        return { text };
      };
      expect(
        await run(t, open, [{ amounts: [0], payload: payload(16384) }]),
      ).toMatchObject({ kind: "applied" });
      await technicalFailure(
        run(t, open, [{ amounts: [0], payload: payload(16385) }]),
        /payload of 16385 bytes exceeds the 16384 byte bound/,
      );
      expect(await events(t)).toHaveLength(1);
    },
  );

  test(
    name(
      "a stream row of exactly its budget is saved and one byte over is a technical failure",
    ),
    async () => {
      const t = depot();
      await run(t, counter(), [{ amounts: [1] }]);
      const [row] = await streams(t);
      if (row === undefined) throw new Error("No stream row");
      const { _id, _creationTime, ...saved } = row;
      void _id;
      void _creationTime;
      // The counter's row has the same size at every version: its fields are numbers and fixed strings.
      const bytes = getConvexSize(saved);
      const budgeted = (budgetBytes: number) =>
        counter({
          mapping: { kind: "single", budgetBytes, isDeleted: () => false },
        });
      expect(await run(t, budgeted(bytes), [{ amounts: [1] }])).toMatchObject({
        versions: [{ version: 2 }],
      });
      await technicalFailure(
        run(t, budgeted(bytes - 1), [{ amounts: [1] }]),
        new RegExp(
          `would be saved at ${bytes} bytes, above its budget of ${bytes - 1}`,
        ),
      );
      expect((await streams(t))[0]?.streamVersion).toBe(2);
    },
  );
});

test(
  name(
    "the parent's internal relay calls the mounted depot through the component API",
  ),
  async () => {
    const t = convexTest(
      schema,
      import.meta.glob("../../fixture/convex/**/*.ts"),
    );
    t.registerComponent(
      "annex",
      annexSchema,
      import.meta.glob("../../fixture/convex/annex/**/*.ts"),
    );
    t.registerComponent(
      "depot",
      depotSchema,
      import.meta.glob("../../fixture/convex/depot/**/*.ts"),
    );
    const input = { documents: [{ documentId: "doc-1", title: "Report" }] };
    expect(
      await t.mutation(internal.depotRelay.createDocuments, call(input)),
    ).toMatchObject({
      kind: "applied",
      versions: [{ contextId: "depot", streamId: "doc-1", version: 1 }],
    });
    const again = await rejected(
      t.mutation(internal.depotRelay.createDocuments, call(input)),
    );
    expect(again).toBeInstanceOf(ConvexError);
    expect((again as ConvexError<{ code: string }>).data.code).toBe(
      "entityExists",
    );
  },
);

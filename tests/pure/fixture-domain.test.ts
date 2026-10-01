import { expect, test } from "vitest";
import {
  checkInvariants,
  fold,
  type DecideResult,
  type DecisionContext,
  type Decider,
  type DomainEvent,
} from "../../src/kernel/index.js";
import {
  documentDecider,
  stockDecider,
  type DocumentCommand,
  type DocumentState,
  type StockCommand,
  type StockState,
} from "../../fixture/domain/index.js";
const context: DecisionContext = {
  now: Date.UTC(2026, 9, 1, 12),
  actor: { kind: "user", id: "fixture-user" },
  facts: {},
};
// The state a sequence of commands leaves, each decided against the state before it.
function after<S, C, E extends DomainEvent, R>(
  decider: Decider<S, C, E, R>,
  commands: readonly C[],
): S {
  let state = decider.initial();
  for (const command of commands) {
    const decision = decider.decide(state, command, context);
    if (decision.kind === "rejection")
      throw new Error(`Rejected: ${decision.rejection.code}`);
    state = fold(decider.evolve, state, decision.events);
  }
  return state;
}
function rejection<E extends DomainEvent, R>(decision: DecideResult<E, R>) {
  if (decision.kind !== "rejection")
    throw new Error(`Expected a rejection, got ${decision.kind}`);
  return decision.rejection;
}
const create: DocumentCommand = { commandType: "create", title: "Report" };
const draft = (): DocumentState => after(documentDecider, [create]);
const submitted = (): DocumentState =>
  after(documentDecider, [create, { commandType: "submit" }]);
const shipped = (): DocumentState =>
  after(documentDecider, [
    create,
    { commandType: "submit" },
    { commandType: "ship" },
  ]);

test("pure: a document is created as a draft with one created event", () => {
  expect(
    documentDecider.decide(documentDecider.initial(), create, context),
  ).toStrictEqual({
    kind: "applied",
    events: [
      {
        eventType: "created",
        eventSchemaVersion: 1,
        payload: { title: "Report" },
        occurredAt: context.now,
      },
    ],
    result: { status: "draft" },
  });
  expect(draft()).toStrictEqual({
    status: "draft",
    title: "Report",
    amendments: 0,
  });
});

test("pure: a document moves from draft to submitted to shipped, and is amended while submitted", () => {
  const state = after(documentDecider, [
    create,
    { commandType: "submit" },
    { commandType: "amend", title: "Report, revised" },
    { commandType: "ship" },
  ]);
  expect(state).toStrictEqual({
    status: "shipped",
    title: "Report, revised",
    amendments: 1,
  });
  expect(checkInvariants(documentDecider.invariants ?? [], state)).toEqual([]);
});

test("pure: shipping a draft is rejected as invalidTransition", () => {
  expect(
    rejection(
      documentDecider.decide(draft(), { commandType: "ship" }, context),
    ),
  ).toStrictEqual({
    code: "invalidTransition",
    message: "A document cannot ship from draft",
    details: { from: "draft", trigger: "ship" },
  });
});

test("pure: every command the table has no entry for is rejected as invalidTransition", () => {
  const cases: [DocumentState, DocumentCommand][] = [
    [documentDecider.initial(), { commandType: "submit" }],
    [documentDecider.initial(), { commandType: "amend", title: "x" }],
    [draft(), create],
    [submitted(), { commandType: "submit" }],
    [shipped(), { commandType: "amend", title: "Late" }],
    [shipped(), { commandType: "ship" }],
  ];
  for (const [state, command] of cases)
    expect(
      rejection(documentDecider.decide(state, command, context)).code,
    ).toBe("invalidTransition");
});

test("pure: a create or an amend with a blank title is rejected as titleRequired", () => {
  expect(
    rejection(
      documentDecider.decide(
        documentDecider.initial(),
        { commandType: "create", title: " " },
        context,
      ),
    ).code,
  ).toBe("titleRequired");
  expect(
    rejection(
      documentDecider.decide(
        submitted(),
        { commandType: "amend", title: "" },
        context,
      ),
    ).code,
  ).toBe("titleRequired");
});

test("pure: the document invariant fails for a created document without a title", () => {
  const invariants = documentDecider.invariants ?? [];
  expect(checkInvariants(invariants, documentDecider.initial())).toEqual([]);
  expect(
    checkInvariants(invariants, { status: "draft", title: "", amendments: 0 }),
  ).toEqual(["aCreatedDocumentHasATitle"]);
});

test("pure: stock that was added can be claimed down to zero with a claimed event", () => {
  const state = after(stockDecider, [{ commandType: "addStock", quantity: 1 }]);
  const decision = stockDecider.decide(
    state,
    { commandType: "claim", quantity: 1 },
    context,
  );
  expect(decision).toStrictEqual({
    kind: "applied",
    events: [
      {
        eventType: "claimed",
        eventSchemaVersion: 1,
        payload: { quantity: 1 },
        occurredAt: context.now,
      },
    ],
    result: { quantity: 1 },
  });
  if (decision.kind === "rejection") throw new Error("unreachable");
  expect(fold(stockDecider.evolve, state, decision.events)).toStrictEqual({
    onHand: 0,
  });
});

test("pure: a claim of more than is on hand is rejected as insufficientStock", () => {
  const state = after(stockDecider, [{ commandType: "addStock", quantity: 2 }]);
  expect(
    rejection(
      stockDecider.decide(
        state,
        { commandType: "claim", quantity: 3 },
        context,
      ),
    ),
  ).toStrictEqual({
    code: "insufficientStock",
    message: "Cannot claim 3 when 2 are on hand",
    details: { requested: 3, onHand: 2 },
  });
  expect(
    rejection(
      stockDecider.decide(
        stockDecider.initial(),
        { commandType: "claim", quantity: 1 },
        context,
      ),
    ).code,
  ).toBe("insufficientStock");
});

test("pure: a quantity that is not a positive whole number is rejected as invalidQuantity", () => {
  const state: StockState = { onHand: 10 };
  for (const quantity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
    for (const commandType of ["addStock", "claim"] as const) {
      const command: StockCommand = { commandType, quantity };
      expect(rejection(stockDecider.decide(state, command, context)).code).toBe(
        "invalidQuantity",
      );
    }
});

test("pure: the stock invariant fails for a negative or fractional count", () => {
  const invariants = stockDecider.invariants ?? [];
  expect(checkInvariants(invariants, { onHand: 0 })).toEqual([]);
  expect(checkInvariants(invariants, { onHand: -1 })).toEqual([
    "onHandIsAWholeNumberNotBelowZero",
  ]);
  expect(checkInvariants(invariants, { onHand: 0.5 })).toEqual([
    "onHandIsAWholeNumberNotBelowZero",
  ]);
});

import { vi } from "vitest";
import {
  fold,
  type DecisionContext,
  type Decider,
  type DomainEvent,
} from "../../src/kernel/index.js";
import {
  documentDecider,
  stockDecider,
  type DocumentCommand,
  type DocumentEvent,
  type DocumentResult,
  type DocumentState,
  type StockCommand,
  type StockEvent,
  type StockResult,
  type StockState,
} from "../../fixture/domain/index.js";
// A decider and a sequence of commands that are valid in order from its initial state.
export interface KernelFixture<S, C, E extends DomainEvent, R> {
  decider: Decider<S, C, E, R>;
  valid: readonly C[];
}
export interface DecisionInput<C> {
  command: C;
  context: DecisionContext;
}
export const documentFixture: KernelFixture<
  DocumentState,
  DocumentCommand,
  DocumentEvent,
  DocumentResult
> = {
  decider: documentDecider,
  valid: [
    { commandType: "create", title: "Quarterly report" },
    { commandType: "submit" },
    { commandType: "ship" },
  ],
};
export const stockFixture: KernelFixture<
  StockState,
  StockCommand,
  StockEvent,
  StockResult
> = {
  decider: stockDecider,
  valid: [
    { commandType: "addStock", quantity: 5 },
    { commandType: "claim", quantity: 2 },
    { commandType: "addStock", quantity: 1 },
  ],
};
export function decisionInputs<S, C, E extends DomainEvent, R>(
  fixture: KernelFixture<S, C, E, R>,
  count: number,
): DecisionInput<C>[] {
  if (count > fixture.valid.length)
    throw new Error(
      `The ${fixture.decider.streamType} fixture has ${fixture.valid.length} valid commands, not ${count}`,
    );
  return fixture.valid.slice(0, count).map((command, index) => ({
    command,
    context: {
      now: Date.UTC(2026, 9, 1, 12, 0, index),
      actor: { kind: "user", id: "fixture-user" },
      facts: {},
    },
  }));
}
// Decides each command against the state folded from the earlier commands' events, never against a replay.
export function runIncrementally<S, C, E extends DomainEvent, R>(
  decider: Decider<S, C, E, R>,
  state: S,
  inputs: readonly DecisionInput<C>[],
): { state: S; events: E[] } {
  const events: E[] = [];
  for (const { command, context } of inputs) {
    const decision = decider.decide(state, command, context);
    if (decision.kind === "rejection")
      throw new Error(
        `A valid ${decider.streamType} command was rejected: ${decision.rejection.code}`,
      );
    if (decision.events.length === 0)
      throw new Error(`A ${decider.streamType} decision recorded no event`);
    state = fold(decider.evolve, state, decision.events);
    events.push(...decision.events);
  }
  return { state, events };
}
export function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`No ${name} yet`);
  return value;
}
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
// Runs synchronous domain code with every ambient surface a pure module could reach watched.
// The network, the scheduler, the environment, the clock and randomness are globals here.
// A database and auth exist only on a Convex ctx, which no decider receives and the kernel cannot import.
export function observeIo<T>(run: () => T): { value: T; calls: string[] } {
  const calls: string[] = [];
  const spies = {
    fetch: vi.spyOn(globalThis, "fetch"),
    setTimeout: vi.spyOn(globalThis, "setTimeout"),
    setInterval: vi.spyOn(globalThis, "setInterval"),
    setImmediate: vi.spyOn(globalThis, "setImmediate"),
    queueMicrotask: vi.spyOn(globalThis, "queueMicrotask"),
    "Date.now": vi.spyOn(Date, "now"),
    "performance.now": vi.spyOn(performance, "now"),
    "Math.random": vi.spyOn(Math, "random"),
    "crypto.randomUUID": vi.spyOn(crypto, "randomUUID"),
    "crypto.getRandomValues": vi.spyOn(crypto, "getRandomValues"),
  };
  const env = process.env;
  const OriginalDate = globalThis.Date;
  const watch = (name: string) => calls.push(name);
  process.env = new Proxy(env, {
    get(target, key) {
      watch("process.env");
      return Reflect.get(target, key);
    },
    has(target, key) {
      watch("process.env");
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      watch("process.env");
      return Reflect.ownKeys(target);
    },
  });
  globalThis.Date = new Proxy(OriginalDate, {
    construct(target, args, newTarget) {
      watch("new Date");
      return Reflect.construct(target, args, newTarget) as object;
    },
    apply(target, self, args) {
      watch("Date");
      return Reflect.apply(target, self, args) as unknown;
    },
  });
  let value: T;
  try {
    value = run();
  } finally {
    process.env = env;
    globalThis.Date = OriginalDate;
    for (const [name, spy] of Object.entries(spies)) {
      for (let call = 0; call < spy.mock.calls.length; call++) calls.push(name);
      spy.mockRestore();
    }
  }
  return { value, calls };
}

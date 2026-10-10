import { v } from "convex/values";
import { internalQueryGeneric } from "convex/server";
import {
  defineOperation,
  planned,
  type StreamRegistration,
} from "../../src/context/index.js";
import type { DomainEvent } from "../../src/kernel/index.js";
import { journal } from "../../fixture/convex/depot/streams.js";

// A context registered only by these tests. Each amount appends one event on the same stream.
const counter: StreamRegistration<
  number,
  number[],
  DomainEvent<"added", { amount: number }>,
  null
> = {
  decider: {
    streamType: "counter",
    initial: () => 0,
    decide: (_state, amounts) => ({
      kind: "applied",
      result: null,
      events: amounts.map((amount) => ({
        eventType: "added",
        eventSchemaVersion: 1,
        payload: { amount },
      })),
    }),
    evolve: (state, event) => state + event.payload.amount,
    invariants: [],
  },
  mapping: { kind: "single", budgetBytes: 4096, isDeleted: () => false },
  stateSchemaVersion: 1,
  eventValidators: { added: v.object({ amount: v.number() }) },
  dto: v.number(),
  toDto: (state) => state,
};
export const add = defineOperation<{ amounts: number[] }, null>(journal, {
  name: "add",
  streams: [counter],
  input: { amounts: v.array(v.number()) },
  returns: v.null(),
  plan: ({ amounts }) => [planned(counter, "counter", amounts)],
  combine: () => null,
  maxStreams: 1,
});
export const stored = internalQueryGeneric({
  args: {},
  handler: async (ctx) => ({
    streams: await ctx.db.query("streams").collect(),
    events: await ctx.db.query("events").collect(),
  }),
});

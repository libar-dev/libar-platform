import { expectTypeOf, test } from "vitest";
import type { FunctionReference } from "convex/server";
import {
  api,
  components,
  internal,
} from "../../fixture/convex/_generated/api.js";
test("compiled: the generated API exposes the fixture's public functions and keeps its internal and component functions out of the public API", () => {
  expectTypeOf(api.identity.caller).toExtend<
    FunctionReference<"query", "public">
  >();
  expectTypeOf(api.failures.catching).toExtend<
    FunctionReference<"mutation", "public">
  >();
  expectTypeOf(internal.notes.addInternal).toExtend<
    FunctionReference<"mutation", "internal">
  >();
  expectTypeOf(components.annex.notes.add).toExtend<
    FunctionReference<"mutation", "internal">
  >();
  expectTypeOf<"throwAfterWrite">().not.toExtend<keyof typeof api.failures>();
  expectTypeOf<"notes">().not.toExtend<keyof typeof api>();
  expectTypeOf<"annex">().not.toExtend<keyof typeof api>();
});

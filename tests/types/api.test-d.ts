import { expectTypeOf, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import type { FunctionReference } from "convex/server";
test("compiled: generated API exposes public fixture functions and excludes internal functions", () => {
  expectTypeOf(api.inspection.identity).toExtend<
    FunctionReference<"query", "public">
  >();
  expectTypeOf(api.inspection.catchFailure).toExtend<
    FunctionReference<"mutation", "public">
  >();
  expectTypeOf(internal.inspection.writeInternal).toExtend<
    FunctionReference<"mutation", "internal">
  >();
  expectTypeOf<"writeInternal">().not.toExtend<keyof typeof api.inspection>();
  expectTypeOf<"failInternal">().not.toExtend<keyof typeof api.inspection>();
});

import { ConvexError, convexToJson } from "convex/values";
import { expect } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import type { Caught } from "../../fixture/convex/failures.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
export interface ThrownWorld {
  backend?: Backend;
  boundary?: "nested" | "annex";
  data?: ReturnType<typeof thrownData>;
  caught?: Caught;
  error?: unknown;
  childRows?: number;
  parentRows?: number;
}
export function thrownData(code: string) {
  return {
    code,
    number: 17.25,
    boolean: true,
    nil: null,
    array: ["one", 2, false, null],
    nested: { label: "nested", count: 3 },
    int64: 9007199254740993n,
  };
}
export async function prepare(
  world: ThrownWorld,
  code: string,
  boundary: "nested" | "annex",
) {
  Object.assign(world, {
    backend: await fixtureBackend(),
    boundary,
    data: thrownData(code),
  });
}
export function parents(world: ThrownWorld) {
  expect(required(world.boundary, "the boundary")).toMatch(/^(nested|annex)$/);
  expect(api.failures.catching).toBeDefined();
  expect(api.failures.passing).toBeDefined();
}
export async function callParents(world: ThrownWorld) {
  const backend = required(world.backend, "the backend");
  const client = ordinaryClient(backend.url);
  const args = {
    boundary: required(world.boundary, "the boundary"),
    kind: "convexError" as const,
    data: required(world.data, "the thrown data"),
  };
  world.caught = await client.mutation(api.failures.catching, args);
  measure("catchingParent", {
    isConvexError: world.caught.isConvexError,
    data: convexToJson(world.caught.data as ReturnType<typeof thrownData>),
  });
  world.childRows = (
    await backend.admin.readTable(
      "throwerWrites",
      args.boundary === "annex" ? { component: "annex" } : {},
    )
  ).length;
  world.parentRows = (await backend.admin.readTable("parentWrites")).length;
  measure("rowsAfterCatching", {
    child: world.childRows,
    parent: world.parentRows,
  });
  world.error = await failureOf(client.mutation(api.failures.passing, args));
  measure("passingParent", {
    isConvexError: world.error instanceof ConvexError,
    data:
      world.error instanceof ConvexError
        ? convexToJson(world.error.data)
        : null,
    text: String(world.error),
  });
}
export const failureOf = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => undefined,
    (error: unknown) => error,
  );
export function assertCaught(world: ThrownWorld) {
  const caught = required(world.caught, "the catching parent's answer");
  expect(caught.isConvexError, caught.message).toBe(true);
  expect(caught.data, caught.message).toEqual(required(world.data, "the data"));
}
export function assertPassed(world: ThrownWorld) {
  expect(world.error, String(world.error)).toBeInstanceOf(ConvexError);
  expect(
    (world.error as ConvexError<ReturnType<typeof thrownData>>).data,
    String(world.error),
  ).toEqual(required(world.data, "the data"));
}
export async function assertRows(
  world: ThrownWorld,
  childRows: number,
  parentRows: number,
) {
  expect(world.childRows).toBe(childRows);
  expect(world.parentRows).toBe(parentRows);
  const client = ordinaryClient(required(world.backend, "the backend").url);
  const args = {
    boundary: required(world.boundary, "the boundary"),
    kind: "plainError" as const,
    data: null,
  };
  const caught = await client.mutation(api.failures.catching, args);
  measure("ordinaryErrorAtParent", {
    property: caught.addedProperty,
    message: caught.message,
  });
  const error = await failureOf(client.mutation(api.failures.passing, args));
  measure("ordinaryErrorAtClient", {
    property:
      (error as { addedProperty?: string } | undefined)?.addedProperty ?? null,
    message: String(error),
  });
  expect(caught.isConvexError, caught.message).toBe(false);
  expect(caught.message).toContain("plain failure");
  expect(error, String(error)).toBeInstanceOf(Error);
}

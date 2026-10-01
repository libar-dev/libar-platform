import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import type { PaginationOptions } from "convex/server";
import type { Validator, Value } from "convex/values";
import { expect, test } from "vitest";
import {
  boundedPage,
  defineGet,
  defineList,
  limitListBytes,
  limitListPage,
  limitReturnBytesPerCall,
} from "../../src/context/index.js";
import {
  documentStream,
  journal,
  stockStream,
} from "../../fixture/convex/depot/streams.js";
// Binds the context queries under src/context/ to their Spec; the library carries no Protocol import.
const anchor = codeAnchor({
  id: codeAnchorId("impl:context.queries"),
  label: "defineGet, defineList and boundedPage in src/context",
  satisfies: ref("spec:context.queries"),
});
void anchor;
// What Convex reads of a registered function and of a validator, which their types keep internal.
type Exported = { exportArgs(): string; exportReturns(): string };
const exported = (fn: unknown) => fn as Exported;
const jsonOf = (validator: Validator<Value, "required", string>) =>
  (validator as unknown as { json: unknown }).json;
const kib = 1024;
const mib = 1024 * kib;

test("pure: a list page holds at most half of 8 MiB in whole stream budgets, and never fewer than one or more than 100 items", () => {
  expect(limitListBytes).toBe(8 * mib);
  expect(limitListPage(256 * kib)).toBe(16);
  expect(limitListPage(512 * kib)).toBe(8);
  expect(limitListPage(40 * kib)).toBe(100);
  expect(limitListPage(41 * kib)).toBe(99);
  expect(limitListPage(16 * kib)).toBe(100);
  expect(limitListPage(16 * mib)).toBe(1);
  // At the row cap of twice the items, a page reads at most limitListBytes of whole budgets.
  for (const budget of [41 * kib, 100 * kib, 256 * kib, 300 * kib, 512 * kib])
    expect(2 * limitListPage(budget) * budget).toBeLessThanOrEqual(
      limitListBytes,
    );
});

test("pure: boundedPage caps the items, sets a row cap of twice the item cap and the byte cap, and relays nothing else", () => {
  const limit = { items: 16, bytes: 8 * mib };
  expect(
    boundedPage(
      {
        cursor: "c-1",
        numItems: 50,
        endCursor: "c-2",
        maximumRowsRead: 5000,
        maximumBytesRead: 64 * mib,
        id: 7,
      } as PaginationOptions,
      limit,
    ),
  ).toStrictEqual({
    cursor: "c-1",
    numItems: 16,
    endCursor: "c-2",
    maximumRowsRead: 32,
    maximumBytesRead: 8 * mib,
  });
  expect(boundedPage({ cursor: null, numItems: 10 }, limit)).toStrictEqual({
    cursor: null,
    numItems: 10,
    maximumRowsRead: 32,
    maximumBytesRead: 8 * mib,
  });
  expect(
    boundedPage({ cursor: null, numItems: 3, endCursor: null }, limit),
  ).not.toHaveProperty("endCursor");
});

test("pure: boundedPage floors a fractional page size and asks for one item when the size is below one or not a number", () => {
  const limit = { items: 16, bytes: 8 * mib };
  const items = (numItems: number) =>
    boundedPage({ cursor: null, numItems }, limit).numItems;
  expect(items(9.9)).toBe(9);
  expect(items(1)).toBe(1);
  expect(items(0)).toBe(1);
  expect(items(-4)).toBe(1);
  expect(items(Number.NaN)).toBe(1);
  expect(items(Number.POSITIVE_INFINITY)).toBe(16);
});

test("pure: get takes tenantId and streamId only and returns the registration's DTO or null", () => {
  const get = defineGet(journal, documentStream);
  expect(get.isQuery && get.isPublic).toBe(true);
  const args = JSON.parse(exported(get).exportArgs()) as {
    type: string;
    value: Record<string, { fieldType: { type: string } }>;
  };
  expect(args.type).toBe("object");
  expect(Object.keys(args.value).sort()).toEqual(["streamId", "tenantId"]);
  const returns = JSON.parse(exported(get).exportReturns()) as {
    type: string;
    value: { type: string }[];
  };
  expect(returns.type).toBe("union");
  expect(returns.value.map((member) => member.type)).toEqual([
    "object",
    "null",
  ]);
  expect(returns.value[0]).toEqual(jsonOf(documentStream.dto));
});

test("pure: list takes tenantId and paginationOpts only and returns the shared page shape over the registration's DTO", () => {
  const list = defineList(journal, stockStream);
  const args = JSON.parse(exported(list).exportArgs()) as {
    value: Record<string, unknown>;
  };
  expect(Object.keys(args.value).sort()).toEqual([
    "paginationOpts",
    "tenantId",
  ]);
  const returns = JSON.parse(exported(list).exportReturns()) as {
    type: string;
    value: Record<
      string,
      { optional: boolean; fieldType: { type: string; value?: unknown } }
    >;
  };
  expect(returns.type).toBe("object");
  expect(
    Object.fromEntries(
      Object.entries(returns.value).map(([field, { optional }]) => [
        field,
        optional,
      ]),
    ),
  ).toStrictEqual({
    page: false,
    isDone: false,
    continueCursor: false,
    splitCursor: true,
    pageStatus: true,
  });
  expect(returns.value.page?.fieldType).toEqual({
    type: "array",
    value: jsonOf(stockStream.dto),
  });
});

test("pure: an operation returns at most 8 MiB, half of the 16 MiB return ceiling", () => {
  expect(limitReturnBytesPerCall).toBe(8 * mib);
});

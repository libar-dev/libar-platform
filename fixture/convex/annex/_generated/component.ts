/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    bytePage: {
      bounded: FunctionReference<
        "query",
        "internal",
        { budgetBytes: number },
        any,
        Name
      >;
      read: FunctionReference<
        "query",
        "internal",
        { maximumBytesRead: number },
        any,
        Name
      >;
      seed: FunctionReference<
        "mutation",
        "internal",
        { budgetBytes: number; count: number; first: number },
        null,
        Name
      >;
    };
    callBudget: {
      empty: FunctionReference<
        "mutation",
        "internal",
        { index: number },
        number,
        Name
      >;
      write: FunctionReference<
        "mutation",
        "internal",
        { index: number },
        number,
        Name
      >;
    };
    failures: {
      throwAfterWrite: FunctionReference<
        "mutation",
        "internal",
        { data: any; kind: "convexError" | "plainError" },
        null,
        Name
      >;
    };
    identity: {
      caller: FunctionReference<"query", "internal", {}, any, Name>;
    };
    limits: {
      insertBlobs: FunctionReference<
        "mutation",
        "internal",
        { count: number; group: string; size: number },
        null,
        Name
      >;
      readBlobs: FunctionReference<
        "query",
        "internal",
        { count: number; group: string },
        any,
        Name
      >;
    };
    list: {
      builtinPage: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any,
        Name
      >;
      first: FunctionReference<"query", "internal", {}, any, Name>;
      insert: FunctionReference<
        "mutation",
        "internal",
        { rows: Array<{ label: string; position: number }> },
        null,
        Name
      >;
      page: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any,
        Name
      >;
      relabel: FunctionReference<
        "mutation",
        "internal",
        { id: string; label: string },
        null,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        null,
        Name
      >;
    };
    notes: {
      add: FunctionReference<"mutation", "internal", {}, null, Name>;
    };
    readCost: {
      readOne: FunctionReference<
        "query",
        "internal",
        { cacheBuster: number; id: string },
        any,
        Name
      >;
      seed: FunctionReference<"mutation", "internal", {}, string, Name>;
    };
    scheduledRows: {
      schedule: FunctionReference<"mutation", "internal", {}, string, Name>;
    };
    timestamps: {
      read: FunctionReference<"query", "internal", {}, any, Name>;
      write: FunctionReference<
        "mutation",
        "internal",
        { label: string },
        { numericError: string; unresolved: boolean },
        Name
      >;
    };
  };

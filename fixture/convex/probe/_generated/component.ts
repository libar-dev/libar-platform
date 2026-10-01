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
    inspection: {
      fail: FunctionReference<"mutation", "internal", {}, null, Name>;
      identity: FunctionReference<"query", "internal", {}, any, Name>;
      write: FunctionReference<"mutation", "internal", {}, null, Name>;
    };
    probe2: {
      fail: FunctionReference<
        "mutation",
        "internal",
        { data: any; ordinary: boolean },
        null,
        Name
      >;
    };
    probe3: {
      read: FunctionReference<
        "query",
        "internal",
        { id: string; nonce: number },
        any,
        Name
      >;
      seed: FunctionReference<"mutation", "internal", {}, string, Name>;
    };
    probe4: {
      read: FunctionReference<
        "query",
        "internal",
        { count: number; group: string },
        any,
        Name
      >;
      seed: FunctionReference<
        "mutation",
        "internal",
        { count: number; group: string; size: number },
        null,
        Name
      >;
      writtenCount: FunctionReference<"query", "internal", {}, number, Name>;
    };
    probe5: {
      change: FunctionReference<
        "mutation",
        "internal",
        { id: string; value: string },
        null,
        Name
      >;
      first: FunctionReference<"query", "internal", {}, any, Name>;
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
      remove: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        null,
        Name
      >;
      write: FunctionReference<
        "mutation",
        "internal",
        { rows: Array<{ position: number; value: string }> },
        null,
        Name
      >;
    };
  };

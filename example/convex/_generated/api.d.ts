/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as gate from "../gate.js";
import type * as grants from "../grants.js";
import type * as orderQueries from "../orderQueries.js";
import type * as orderSummary from "../orderSummary.js";
import type * as ordering from "../ordering.js";
import type * as readModels from "../readModels.js";
import type * as rebuild from "../rebuild.js";
import type * as receipts from "../receipts.js";
import type * as receiving from "../receiving.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  gate: typeof gate;
  grants: typeof grants;
  orderQueries: typeof orderQueries;
  orderSummary: typeof orderSummary;
  ordering: typeof ordering;
  readModels: typeof readModels;
  rebuild: typeof rebuild;
  receipts: typeof receipts;
  receiving: typeof receiving;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  orders: import("../orders/_generated/component.js").ComponentApi<"orders">;
  inventory: import("../inventory/_generated/component.js").ComponentApi<"inventory">;
};

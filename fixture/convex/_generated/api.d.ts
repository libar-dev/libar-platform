/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as inspection from "../inspection.js";
import type * as probe1 from "../probe1.js";
import type * as probe2 from "../probe2.js";
import type * as probe3 from "../probe3.js";
import type * as probe4 from "../probe4.js";
import type * as probe5 from "../probe5.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  inspection: typeof inspection;
  probe1: typeof probe1;
  probe2: typeof probe2;
  probe3: typeof probe3;
  probe4: typeof probe4;
  probe5: typeof probe5;
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
  probe: import("../probe/_generated/component.js").ComponentApi<"probe">;
};

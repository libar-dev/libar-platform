/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as depotCommands from "../depotCommands.js";
import type * as depotQueries from "../depotQueries.js";
import type * as depotRelay from "../depotRelay.js";
import type * as documentTitles from "../documentTitles.js";
import type * as failures from "../failures.js";
import type * as filing from "../filing.js";
import type * as gate from "../gate.js";
import type * as grants from "../grants.js";
import type * as identity from "../identity.js";
import type * as limits from "../limits.js";
import type * as list from "../list.js";
import type * as markers from "../markers.js";
import type * as nonUiCaller from "../nonUiCaller.js";
import type * as notes from "../notes.js";
import type * as orders from "../orders.js";
import type * as parentList from "../parentList.js";
import type * as readCost from "../readCost.js";
import type * as readModels from "../readModels.js";
import type * as rejectionCommands from "../rejectionCommands.js";
import type * as summaries from "../summaries.js";
import type * as summarizedTwice from "../summarizedTwice.js";
import type * as switches from "../switches.js";
import type * as usage from "../usage.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  depotCommands: typeof depotCommands;
  depotQueries: typeof depotQueries;
  depotRelay: typeof depotRelay;
  documentTitles: typeof documentTitles;
  failures: typeof failures;
  filing: typeof filing;
  gate: typeof gate;
  grants: typeof grants;
  identity: typeof identity;
  limits: typeof limits;
  list: typeof list;
  markers: typeof markers;
  nonUiCaller: typeof nonUiCaller;
  notes: typeof notes;
  orders: typeof orders;
  parentList: typeof parentList;
  readCost: typeof readCost;
  readModels: typeof readModels;
  rejectionCommands: typeof rejectionCommands;
  summaries: typeof summaries;
  summarizedTwice: typeof summarizedTwice;
  switches: typeof switches;
  usage: typeof usage;
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
  annex: import("../annex/_generated/component.js").ComponentApi<"annex">;
  depot: import("../depot/_generated/component.js").ComponentApi<"depot">;
  yard: import("../yard/_generated/component.js").ComponentApi<"yard">;
};

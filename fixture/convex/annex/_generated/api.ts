/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bytePage from "../bytePage.js";
import type * as callBudget from "../callBudget.js";
import type * as failures from "../failures.js";
import type * as identity from "../identity.js";
import type * as limits from "../limits.js";
import type * as list from "../list.js";
import type * as notes from "../notes.js";
import type * as readCost from "../readCost.js";
import type * as scheduledRows from "../scheduledRows.js";
import type * as timestamps from "../timestamps.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  bytePage: typeof bytePage;
  callBudget: typeof callBudget;
  failures: typeof failures;
  identity: typeof identity;
  limits: typeof limits;
  list: typeof list;
  notes: typeof notes;
  readCost: typeof readCost;
  scheduledRows: typeof scheduledRows;
  timestamps: typeof timestamps;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};

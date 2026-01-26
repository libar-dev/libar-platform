/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as contract from "../contract.js";
import type * as domain_commands from "../domain/commands.js";
import type * as domain_customer from "../domain/customer.js";
import type * as domain_deciders_addOrderItem from "../domain/deciders/addOrderItem.js";
import type * as domain_deciders_cancelOrder from "../domain/deciders/cancelOrder.js";
import type * as domain_deciders_confirmOrder from "../domain/deciders/confirmOrder.js";
import type * as domain_deciders_createOrder from "../domain/deciders/createOrder.js";
import type * as domain_deciders_index from "../domain/deciders/index.js";
import type * as domain_deciders_removeOrderItem from "../domain/deciders/removeOrderItem.js";
import type * as domain_deciders_submitOrder from "../domain/deciders/submitOrder.js";
import type * as domain_deciders_types from "../domain/deciders/types.js";
import type * as domain_events from "../domain/events.js";
import type * as domain_invariants from "../domain/invariants.js";
import type * as domain_order from "../domain/order.js";
import type * as domain_orderFSM from "../domain/orderFSM.js";
import type * as domain_upcasting from "../domain/upcasting.js";
import type * as handlers__helpers from "../handlers/_helpers.js";
import type * as handlers_commands from "../handlers/commands.js";
import type * as handlers_testing from "../handlers/testing.js";
import type * as repository from "../repository.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  contract: typeof contract;
  "domain/commands": typeof domain_commands;
  "domain/customer": typeof domain_customer;
  "domain/deciders/addOrderItem": typeof domain_deciders_addOrderItem;
  "domain/deciders/cancelOrder": typeof domain_deciders_cancelOrder;
  "domain/deciders/confirmOrder": typeof domain_deciders_confirmOrder;
  "domain/deciders/createOrder": typeof domain_deciders_createOrder;
  "domain/deciders/index": typeof domain_deciders_index;
  "domain/deciders/removeOrderItem": typeof domain_deciders_removeOrderItem;
  "domain/deciders/submitOrder": typeof domain_deciders_submitOrder;
  "domain/deciders/types": typeof domain_deciders_types;
  "domain/events": typeof domain_events;
  "domain/invariants": typeof domain_invariants;
  "domain/order": typeof domain_order;
  "domain/orderFSM": typeof domain_orderFSM;
  "domain/upcasting": typeof domain_upcasting;
  "handlers/_helpers": typeof handlers__helpers;
  "handlers/commands": typeof handlers_commands;
  "handlers/testing": typeof handlers_testing;
  repository: typeof repository;
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

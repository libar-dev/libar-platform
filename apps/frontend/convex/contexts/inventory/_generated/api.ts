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
import type * as domain_deciders_addStock from "../domain/deciders/addStock.js";
import type * as domain_deciders_confirmReservation from "../domain/deciders/confirmReservation.js";
import type * as domain_deciders_createProduct from "../domain/deciders/createProduct.js";
import type * as domain_deciders_expireReservation from "../domain/deciders/expireReservation.js";
import type * as domain_deciders_index from "../domain/deciders/index.js";
import type * as domain_deciders_releaseReservation from "../domain/deciders/releaseReservation.js";
import type * as domain_deciders_reserveMultipleDCB from "../domain/deciders/reserveMultipleDCB.js";
import type * as domain_deciders_reserveStock from "../domain/deciders/reserveStock.js";
import type * as domain_deciders_types from "../domain/deciders/types.js";
import type * as domain_events from "../domain/events.js";
import type * as domain_invariants from "../domain/invariants.js";
import type * as domain_inventory from "../domain/inventory.js";
import type * as domain_reservation from "../domain/reservation.js";
import type * as domain_reservationFSM from "../domain/reservationFSM.js";
import type * as handlers__helpers from "../handlers/_helpers.js";
import type * as handlers_commands from "../handlers/commands.js";
import type * as handlers_internal from "../handlers/internal.js";
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
  "domain/deciders/addStock": typeof domain_deciders_addStock;
  "domain/deciders/confirmReservation": typeof domain_deciders_confirmReservation;
  "domain/deciders/createProduct": typeof domain_deciders_createProduct;
  "domain/deciders/expireReservation": typeof domain_deciders_expireReservation;
  "domain/deciders/index": typeof domain_deciders_index;
  "domain/deciders/releaseReservation": typeof domain_deciders_releaseReservation;
  "domain/deciders/reserveMultipleDCB": typeof domain_deciders_reserveMultipleDCB;
  "domain/deciders/reserveStock": typeof domain_deciders_reserveStock;
  "domain/deciders/types": typeof domain_deciders_types;
  "domain/events": typeof domain_events;
  "domain/invariants": typeof domain_invariants;
  "domain/inventory": typeof domain_inventory;
  "domain/reservation": typeof domain_reservation;
  "domain/reservationFSM": typeof domain_reservationFSM;
  "handlers/_helpers": typeof handlers__helpers;
  "handlers/commands": typeof handlers_commands;
  "handlers/internal": typeof handlers_internal;
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

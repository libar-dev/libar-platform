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
    handlers: {
      commands: {
        handleAddStock: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            productId: string;
            quantity: number;
            reason?: string;
          },
          any,
          Name
        >;
        handleConfirmReservation: FunctionReference<
          "mutation",
          "internal",
          { commandId: string; correlationId: string; reservationId: string },
          any,
          Name
        >;
        handleCreateProduct: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            productId: string;
            productName: string;
            sku: string;
            unitPrice: number;
          },
          any,
          Name
        >;
        handleExpireReservation: FunctionReference<
          "mutation",
          "internal",
          { commandId: string; correlationId: string; reservationId: string },
          any,
          Name
        >;
        handleReleaseReservation: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            reason: string;
            reservationId: string;
          },
          any,
          Name
        >;
        handleReserveStock: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            items: Array<{ productId: string; quantity: number }>;
            orderId: string;
          },
          any,
          Name
        >;
        handleReserveStockDCB: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            items: Array<{ productId: string; quantity: number }>;
            orderId: string;
            tenantId: string;
          },
          any,
          Name
        >;
      };
      internal: {
        findExpiredReservations: FunctionReference<
          "mutation",
          "internal",
          {},
          any,
          Name
        >;
      };
      testing: {
        createTestProduct: FunctionReference<
          "mutation",
          "internal",
          {
            availableQuantity?: number;
            productId: string;
            productName: string;
            reservedQuantity?: number;
            sku: string;
            unitPrice?: number;
            version?: number;
          },
          any,
          Name
        >;
        createTestReservation: FunctionReference<
          "mutation",
          "internal",
          {
            expiresAt?: number;
            items: Array<{ productId: string; quantity: number }>;
            orderId: string;
            reservationId: string;
            status?: "pending" | "confirmed" | "released" | "expired";
            version?: number;
          },
          any,
          Name
        >;
        getTestProduct: FunctionReference<
          "query",
          "internal",
          { productId: string },
          any,
          Name
        >;
        getTestReservation: FunctionReference<
          "query",
          "internal",
          { reservationId: string },
          any,
          Name
        >;
        getTestReservationByOrderId: FunctionReference<
          "query",
          "internal",
          { orderId: string },
          any,
          Name
        >;
      };
    };
  };

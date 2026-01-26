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
        handleAddOrderItem: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            item: {
              productId: string;
              productName: string;
              quantity: number;
              unitPrice: number;
            };
            orderId: string;
          },
          any,
          Name
        >;
        handleCancelOrder: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            orderId: string;
            reason: string;
          },
          any,
          Name
        >;
        handleConfirmOrder: FunctionReference<
          "mutation",
          "internal",
          { commandId: string; correlationId: string; orderId: string },
          any,
          Name
        >;
        handleCreateOrder: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            customerId: string;
            orderId: string;
          },
          any,
          Name
        >;
        handleRemoveOrderItem: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            orderId: string;
            productId: string;
          },
          any,
          Name
        >;
        handleSubmitOrder: FunctionReference<
          "mutation",
          "internal",
          { commandId: string; correlationId: string; orderId: string },
          any,
          Name
        >;
      };
      testing: {
        createTestOrder: FunctionReference<
          "mutation",
          "internal",
          {
            customerId: string;
            items?: Array<{
              productId: string;
              productName: string;
              quantity: number;
              unitPrice: number;
            }>;
            orderId: string;
            status?: "draft" | "submitted" | "confirmed" | "cancelled";
          },
          any,
          Name
        >;
        getTestOrder: FunctionReference<
          "query",
          "internal",
          { orderId: string },
          any,
          Name
        >;
      };
    };
  };

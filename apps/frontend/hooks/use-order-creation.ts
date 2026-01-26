"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { getOrchestratorErrorReason } from "@/types";
import type { CartItem, CommandOrchestratorResult } from "@/types";
import { isOrchestratorResultSuccess, type MutationState } from "./use-mutation-with-feedback";

// =============================================================================
// Mutation References (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 "Type instantiation is excessively
// deep" errors that occur when accessing paths like `api.orders.*`.
// =============================================================================

const createOrderMutation = makeFunctionReference<"mutation">(
  "orders:createOrder"
) as FunctionReference<
  "mutation",
  "public",
  { orderId: string; customerId: string; correlationId?: string },
  CommandOrchestratorResult
>;

const addOrderItemMutation = makeFunctionReference<"mutation">(
  "orders:addOrderItem"
) as FunctionReference<
  "mutation",
  "public",
  {
    orderId: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    correlationId?: string;
  },
  CommandOrchestratorResult
>;

const submitOrderMutation = makeFunctionReference<"mutation">(
  "orders:submitOrder"
) as FunctionReference<
  "mutation",
  "public",
  { orderId: string; correlationId?: string },
  CommandOrchestratorResult
>;

/**
 * Arguments for creating an order.
 */
export interface CreateOrderArgs {
  customerId: string;
  items: CartItem[];
}

/**
 * Result from successful order creation.
 */
export interface OrderCreationResult {
  orderId: string;
}

/**
 * Return type for useOrderCreation hook.
 */
export interface UseOrderCreation {
  /** Execute the order creation flow */
  execute: (args: CreateOrderArgs) => Promise<OrderCreationResult | undefined>;
  /** Current state of the mutation */
  state: MutationState;
  /** Error message if the mutation failed */
  error: string | null;
  /** Reset the state back to idle */
  reset: () => void;
}

/**
 * Generate a unique order ID using crypto.randomUUID().
 */
function generateOrderId(): string {
  return crypto.randomUUID();
}

/**
 * Hook for multi-step order creation flow.
 *
 * Encapsulates the 3-step mutation sequence:
 * 1. createOrder - Create draft order with UUID
 * 2. addOrderItem - Add each cart item (sequential)
 * 3. submitOrder - Submit for processing (triggers saga)
 *
 * Follows the useMutationWithFeedback pattern for consistent state management.
 *
 * @example
 * ```tsx
 * const { execute, state, error, reset } = useOrderCreation();
 *
 * const handleSubmit = async (items: CartItem[]) => {
 *   const result = await execute({ customerId: "customer_123", items });
 *   if (result) {
 *     navigate({ to: "/orders/$orderId", params: { orderId: result.orderId } });
 *   }
 * };
 *
 * return (
 *   <div>
 *     <button disabled={state === "pending"}>
 *       {state === "pending" ? "Creating..." : "Create Order"}
 *     </button>
 *     {error && <p>{error}</p>}
 *   </div>
 * );
 * ```
 */
export function useOrderCreation(): UseOrderCreation {
  const [state, setState] = useState<MutationState>("idle");
  const [error, setError] = useState<string | null>(null);

  const createOrder = useMutation(createOrderMutation);
  const addOrderItem = useMutation(addOrderItemMutation);
  const submitOrder = useMutation(submitOrderMutation);

  const execute = useCallback(
    async (args: CreateOrderArgs): Promise<OrderCreationResult | undefined> => {
      const { customerId, items } = args;

      if (items.length === 0) {
        setError("Cannot create order with no items");
        setState("error");
        return undefined;
      }

      setState("pending");
      setError(null);

      const orderId = generateOrderId();

      try {
        // Step 1: Create the order
        const createResult = await createOrder({ orderId, customerId });

        if (!isOrchestratorResultSuccess(createResult)) {
          throw new Error(getOrchestratorErrorReason(createResult) || "Failed to create order");
        }

        // Step 2: Add each item to the order
        for (const item of items) {
          const addResult = await addOrderItem({
            orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          });

          if (!isOrchestratorResultSuccess(addResult)) {
            throw new Error(
              getOrchestratorErrorReason(addResult) || `Failed to add item: ${item.productName}`
            );
          }
        }

        // Step 3: Submit the order (triggers saga for reservation)
        const submitResult = await submitOrder({ orderId });

        if (!isOrchestratorResultSuccess(submitResult)) {
          throw new Error(getOrchestratorErrorReason(submitResult) || "Failed to submit order");
        }

        setState("success");
        return { orderId };
      } catch (err) {
        setState("error");
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create order. Please try again.";
        setError(errorMessage);
        console.error("Failed to create order:", err);
        return undefined;
      }
    },
    [createOrder, addOrderItem, submitOrder]
  );

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
  }, []);

  return {
    execute,
    state,
    error,
    reset,
  };
}

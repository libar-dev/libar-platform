/**
 * Frontend-specific types for the order management system
 */

// Re-export Convex types for convenience
export type { Doc, Id } from "@convex/_generated/dataModel";

// Re-export CommandOrchestrator result types
export type {
  CommandOrchestratorSuccess,
  CommandOrchestratorDuplicate,
  CommandOrchestratorRejected,
  CommandOrchestratorFailed,
  CommandOrchestratorResult,
} from "./orchestrator";
export { getOrchestratorErrorReason } from "./orchestrator";

// Re-export stock utilities
export type { StockLevel } from "@/lib/stock-utils";

/**
 * Order status type representing the lifecycle of an order
 */
export type OrderStatus = "draft" | "submitted" | "confirmed" | "cancelled";

/**
 * Cart item representing a product in the shopping cart
 */
export interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

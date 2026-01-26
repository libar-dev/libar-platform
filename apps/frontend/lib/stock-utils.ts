/**
 * Stock level type for inventory status
 */
export type StockLevel = "in-stock" | "low" | "out";

/**
 * Stock threshold constants
 */
export const STOCK_THRESHOLDS = {
  LOW: 10,
  OUT: 0,
} as const;

/**
 * Determines the stock level based on available quantity
 */
export function getStockLevel(availableQuantity: number): StockLevel {
  if (availableQuantity <= STOCK_THRESHOLDS.OUT) {
    return "out";
  }
  if (availableQuantity <= STOCK_THRESHOLDS.LOW) {
    return "low";
  }
  return "in-stock";
}

/**
 * Badge variant type matching the Badge component variants
 */
export type BadgeVariant = "default" | "secondary" | "destructive";

/**
 * Maps stock level to Badge component variant
 * - in-stock: default (green/primary)
 * - low: secondary (yellow/warning)
 * - out: destructive (red/error)
 */
export function getStockBadgeVariant(level: StockLevel): BadgeVariant {
  switch (level) {
    case "in-stock":
      return "default";
    case "low":
      return "secondary";
    case "out":
      return "destructive";
  }
}

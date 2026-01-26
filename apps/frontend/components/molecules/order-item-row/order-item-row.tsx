"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import type { CartItem } from "@/types";

/**
 * Props for the OrderItemRow component
 */
export interface OrderItemRowProps {
  /** Cart item data to display */
  item: CartItem;
  /** Callback when quantity changes */
  onQuantityChange?: (quantity: number) => void;
  /** Callback when item is removed */
  onRemove?: () => void;
  /** Whether the row is read-only (order detail view) */
  readOnly?: boolean;
}

/**
 * X icon for remove button
 */
function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/**
 * OrderItemRow displays a single line item in a cart or order.
 * Supports both editable (cart) and read-only (order detail) modes.
 *
 * @example
 * ```tsx
 * // Editable cart mode
 * <OrderItemRow
 *   item={{
 *     productId: "prod-001",
 *     productName: "Ergonomic Keyboard",
 *     quantity: 2,
 *     unitPrice: 89.99,
 *   }}
 *   onQuantityChange={(qty) => updateCart(item.productId, qty)}
 *   onRemove={() => removeFromCart(item.productId)}
 * />
 *
 * // Read-only order detail mode
 * <OrderItemRow item={item} readOnly />
 * ```
 */
export function OrderItemRow({
  item,
  onQuantityChange,
  onRemove,
  readOnly = false,
}: OrderItemRowProps) {
  const lineTotal = item.quantity * item.unitPrice;

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1 && onQuantityChange) {
      onQuantityChange(value);
    }
  };

  return (
    <div
      data-testid={`order-item-row-${item.productId}`}
      className="flex items-center gap-4 border-b border-border py-3 last:border-b-0"
    >
      {/* Product info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate" data-testid="item-name">
          {item.productName}
        </div>
        <div className="text-sm text-muted-foreground" data-testid="item-unit-price">
          {formatCurrency(item.unitPrice)} each
        </div>
      </div>

      {/* Quantity */}
      <div className="flex items-center gap-2">
        {readOnly ? (
          <span className="text-sm font-medium w-12 text-center" data-testid="item-quantity">
            ×{item.quantity}
          </span>
        ) : (
          <Input
            type="number"
            min={1}
            value={item.quantity}
            onChange={handleQuantityChange}
            className="w-16 text-center"
            data-testid="item-quantity-input"
            aria-label={`Quantity for ${item.productName}`}
          />
        )}
      </div>

      {/* Line total */}
      <div className="w-24 text-right font-medium" data-testid="item-line-total">
        {formatCurrency(lineTotal)}
      </div>

      {/* Remove button (only in edit mode) */}
      {!readOnly && onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          data-testid="item-remove-button"
          aria-label={`Remove ${item.productName}`}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}

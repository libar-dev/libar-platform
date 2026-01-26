"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStockLevel, getStockBadgeVariant } from "@/lib/stock-utils";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * Product data required for the ProductCard component
 */
export interface ProductCardProduct {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
  availableQuantity: number;
  reservedQuantity: number;
}

/**
 * Props for the ProductCard component
 */
export interface ProductCardProps {
  /** Product data to display */
  product: ProductCardProduct;
  /** Callback when the card is selected */
  onSelect?: (productId: string) => void;
  /** Whether this card is currently selected */
  selected?: boolean;
}

/**
 * Displays stock level as human-readable text
 */
function getStockLevelText(availableQuantity: number): string {
  const level = getStockLevel(availableQuantity);
  switch (level) {
    case "in-stock":
      return `${availableQuantity} in stock`;
    case "low":
      return `Only ${availableQuantity} left`;
    case "out":
      return "Out of stock";
  }
}

/**
 * ProductCard displays a product with its stock status.
 * Used in product catalogs and order creation flows.
 *
 * @example
 * ```tsx
 * <ProductCard
 *   product={{
 *     productId: "prod-001",
 *     productName: "Ergonomic Keyboard",
 *     sku: "KB-ERG-001",
 *     unitPrice: 129.99,
 *     availableQuantity: 150,
 *     reservedQuantity: 10,
 *   }}
 *   onSelect={(id) => console.log("Selected:", id)}
 *   selected={false}
 * />
 * ```
 */
export function ProductCard({ product, onSelect, selected }: ProductCardProps) {
  const stockLevel = getStockLevel(product.availableQuantity);
  const badgeVariant = getStockBadgeVariant(stockLevel);
  const stockText = getStockLevelText(product.availableQuantity);

  const handleClick = () => {
    if (onSelect) {
      onSelect(product.productId);
    }
  };

  const isInteractive = !!onSelect;

  return (
    <Card
      size="sm"
      data-testid={`product-card-${product.productId}`}
      className={cn(
        isInteractive && "cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/50",
        selected && "ring-2 ring-primary"
      )}
      onClick={isInteractive ? handleClick : undefined}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle data-testid="product-name">{product.productName}</CardTitle>
          <Badge variant="outline" data-testid="product-sku">
            {product.sku}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-foreground" data-testid="product-price">
            {formatCurrency(product.unitPrice)}
          </span>
          <Badge variant={badgeVariant} data-testid="stock-badge">
            {stockText}
          </Badge>
        </div>
        {product.reservedQuantity > 0 && (
          <span className="text-xs text-muted-foreground" data-testid="reserved-qty">
            {product.reservedQuantity} reserved
          </span>
        )}
      </CardContent>
    </Card>
  );
}

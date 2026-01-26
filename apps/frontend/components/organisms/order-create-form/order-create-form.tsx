"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ProductCard, type ProductCardProduct } from "@/components/molecules/product-card";
import { OrderItemRow } from "@/components/molecules/order-item-row";
import { formatCurrency } from "@/lib/formatters";
import type { CartItem } from "@/types";

/**
 * Props for the OrderCreateForm component
 */
export interface OrderCreateFormProps {
  /** Available products to add to order */
  products: ProductCardProduct[];
  /** Callback when order is submitted */
  onSubmit: (items: CartItem[]) => Promise<void>;
  /** Callback when form is cancelled */
  onCancel?: () => void;
  /** Whether the form is currently submitting */
  isSubmitting?: boolean;
}

/**
 * OrderCreateForm allows creating new orders by selecting products and quantities.
 * Combines product catalog browsing with cart management.
 *
 * @example
 * ```tsx
 * const { products } = useProducts();
 * const createOrder = useMutation(api.orders.createOrder);
 *
 * <OrderCreateForm
 *   products={products}
 *   onSubmit={async (items) => {
 *     const orderId = generateOrderId();
 *     await createOrder({ orderId, customerId: DEMO_CUSTOMER_ID });
 *     for (const item of items) {
 *       await addOrderItem({ orderId, ...item });
 *     }
 *     await submitOrder({ orderId });
 *   }}
 *   onCancel={() => router.back()}
 * />
 * ```
 */
export function OrderCreateForm({
  products,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: OrderCreateFormProps) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Calculate cart totals
  const { totalAmount, itemCount } = useMemo(() => {
    const total = cartItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    return { totalAmount: total, itemCount: count };
  }, [cartItems]);

  // Products in cart (for highlighting)
  const cartProductIds = useMemo(
    () => new Set(cartItems.map((item) => item.productId)),
    [cartItems]
  );

  // Add product to cart
  const handleProductSelect = (productId: string) => {
    const product = products.find((p) => p.productId === productId);
    if (!product) return;

    // Check if already in cart
    const existingItem = cartItems.find((item) => item.productId === productId);
    if (existingItem) {
      // Increment quantity
      setCartItems((prev) =>
        prev.map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      // Add new item with real product price
      const newItem: CartItem = {
        productId: product.productId,
        productName: product.productName,
        quantity: 1,
        unitPrice: product.unitPrice,
      };
      setCartItems((prev) => [...prev, newItem]);
    }
  };

  // Update item quantity
  const handleQuantityChange = (productId: string, quantity: number) => {
    setCartItems((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, quantity } : item))
    );
  };

  // Remove item from cart
  const handleRemoveItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  // Submit order
  const handleSubmit = async () => {
    if (cartItems.length === 0) return;
    await onSubmit(cartItems);
  };

  // Filter to only show in-stock products
  const availableProducts = products.filter((p) => p.availableQuantity > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Product Catalog */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Products</span>
            <Badge variant="secondary">{availableProducts.length} available</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {availableProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No products available</p>
              <p className="text-sm mt-1">Products will appear here once created and stocked.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2" data-testid="product-catalog">
              {availableProducts.map((product) => (
                <ProductCard
                  key={product.productId}
                  product={product}
                  onSelect={handleProductSelect}
                  selected={cartProductIds.has(product.productId)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Cart</span>
            {itemCount > 0 && (
              <Badge variant="default">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cartItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="empty-cart">
              <p>Your cart is empty</p>
              <p className="text-sm mt-1">Click on products to add them to your order.</p>
            </div>
          ) : (
            <div data-testid="cart-items">
              {cartItems.map((item) => (
                <OrderItemRow
                  key={item.productId}
                  item={item}
                  onQuantityChange={(qty) => handleQuantityChange(item.productId, qty)}
                  onRemove={() => handleRemoveItem(item.productId)}
                />
              ))}
              <Separator className="my-4" />
              <div className="flex items-center justify-between font-medium">
                <span>Total</span>
                <span data-testid="cart-total">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="gap-2 justify-end">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
              data-testid="order-cancel-button"
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || cartItems.length === 0}
            data-testid="order-submit-button"
          >
            {isSubmitting ? "Creating Order..." : "Create Order"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

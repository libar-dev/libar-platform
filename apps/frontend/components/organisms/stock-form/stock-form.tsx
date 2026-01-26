"use client";

import { useState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError, FieldGroup, FieldDescription } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/**
 * Product data for the stock form
 */
export interface StockFormProduct {
  productId: string;
  productName: string;
  availableQuantity: number;
}

/**
 * Data for adding stock to a product
 */
export interface AddStockData {
  productId: string;
  quantity: number;
  reason?: string;
}

/**
 * Props for the StockForm component
 */
export interface StockFormProps {
  /** List of products to choose from */
  products: StockFormProduct[];
  /** Callback when form is submitted */
  onSubmit: (data: AddStockData) => Promise<void>;
  /** Default product to select */
  defaultProductId?: string;
  /** Whether the form is currently submitting */
  isSubmitting?: boolean;
  /** Success message to display after successful submission */
  successMessage?: string;
}

/**
 * StockForm allows adding stock to existing products.
 * Includes product selection and quantity input.
 *
 * @example
 * ```tsx
 * const addStock = useMutation(api.inventory.addStock);
 * const { products } = useProducts();
 *
 * <StockForm
 *   products={products}
 *   onSubmit={async (data) => {
 *     await addStock(data);
 *   }}
 *   successMessage={successMessage}
 * />
 * ```
 */
export function StockForm({
  products,
  onSubmit,
  defaultProductId,
  isSubmitting = false,
  successMessage,
}: StockFormProps) {
  const formId = useId();
  // Use key prop pattern instead of useEffect to reset state when defaultProductId changes
  const [selectedProductId, setSelectedProductId] = useState(defaultProductId ?? "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedProduct = products.find((p) => p.productId === selectedProductId);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!selectedProductId) {
      newErrors.productId = "Please select a product";
    }

    const qty = parseInt(quantity, 10);
    if (!quantity.trim()) {
      newErrors.quantity = "Quantity is required";
    } else if (isNaN(qty) || qty < 1) {
      newErrors.quantity = "Quantity must be at least 1";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    await onSubmit({
      productId: selectedProductId,
      quantity: parseInt(quantity, 10),
      reason: reason.trim() || undefined,
    });

    // Reset form after successful submission
    setQuantity("");
    setReason("");
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6" noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.productId}>
          <FieldLabel htmlFor={`${formId}-product`}>Product</FieldLabel>
          <Select
            value={selectedProductId || undefined}
            onValueChange={(value) => setSelectedProductId(value ?? "")}
            disabled={isSubmitting}
          >
            <SelectTrigger
              id={`${formId}-product`}
              className="w-full"
              data-testid="stock-product-select"
              aria-invalid={!!errors.productId}
            >
              <SelectValue>
                {selectedProductId
                  ? products.find((p) => p.productId === selectedProductId)?.productName
                  : "Select a product"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {products.length === 0 ? (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No products available
                </div>
              ) : (
                products.map((product) => (
                  <SelectItem key={product.productId} value={product.productId}>
                    <span className="flex items-center gap-2">
                      {product.productName}
                      <Badge variant="outline" className="text-xs">
                        {product.availableQuantity} in stock
                      </Badge>
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {errors.productId && <FieldError>{errors.productId}</FieldError>}
        </Field>

        {selectedProduct && (
          <div className="text-sm text-muted-foreground px-1">
            Current stock: <strong>{selectedProduct.availableQuantity}</strong> units
          </div>
        )}

        <Field data-invalid={!!errors.quantity}>
          <FieldLabel htmlFor={`${formId}-quantity`}>Quantity to Add</FieldLabel>
          <Input
            id={`${formId}-quantity`}
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g., 100"
            aria-invalid={!!errors.quantity}
            data-testid="stock-quantity-input"
            disabled={isSubmitting}
          />
          {errors.quantity && <FieldError>{errors.quantity}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor={`${formId}-reason`}>Reason (Optional)</FieldLabel>
          <Textarea
            id={`${formId}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Restocking from supplier shipment"
            className="min-h-[80px]"
            data-testid="stock-reason-input"
            disabled={isSubmitting}
          />
          <FieldDescription>Optional note for tracking stock changes</FieldDescription>
        </Field>

        {successMessage && (
          <div
            className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-200"
            data-testid="stock-success-message"
          >
            {successMessage}
          </div>
        )}
      </FieldGroup>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting} data-testid="stock-form-submit">
          {isSubmitting ? "Adding..." : "Add Stock"}
        </Button>
      </div>
    </form>
  );
}

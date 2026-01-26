"use client";

import { useState, useId, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError, FieldGroup, FieldDescription } from "@/components/ui/field";
import { useMounted } from "@/hooks/use-mounted";

/**
 * Data for creating a new product
 */
export interface CreateProductData {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
}

/**
 * Props for the ProductForm component
 */
export interface ProductFormProps {
  /** Callback when form is submitted */
  onSubmit: (data: CreateProductData) => Promise<void>;
  /** Callback when form is cancelled */
  onCancel?: () => void;
  /** Whether the form is currently submitting */
  isSubmitting?: boolean;
  /** Validation errors by field name */
  errors?: Record<string, string>;
}

/**
 * Generates a unique product ID
 */
function generateProductId(): string {
  return `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * ProductForm allows creating new products.
 * Includes auto-generated product ID and validation.
 *
 * @example
 * ```tsx
 * const createProduct = useMutation(api.inventory.createProduct);
 *
 * <ProductForm
 *   onSubmit={async (data) => {
 *     await createProduct(data);
 *   }}
 *   onCancel={() => router.back()}
 *   isSubmitting={false}
 * />
 * ```
 */
export function ProductForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
  errors = {},
}: ProductFormProps) {
  const formId = useId();
  const mounted = useMounted();

  // Defer product ID generation to client-only to prevent SSR hydration mismatch
  // Date.now() and Math.random() generate different values on server vs client
  const [productId, setProductId] = useState<string>("");
  useEffect(() => {
    if (mounted && !productId) {
      setProductId(generateProductId());
    }
  }, [mounted, productId]);

  const [productName, setProductName] = useState("");
  const [sku, setSku] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const allErrors = { ...localErrors, ...errors };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!productId) {
      newErrors.productId = "Product ID is still generating. Please wait.";
    }

    if (!productName.trim()) {
      newErrors.productName = "Product name is required";
    }

    if (!sku.trim()) {
      newErrors.sku = "SKU is required";
    } else if (!/^[A-Z0-9-]+$/i.test(sku)) {
      newErrors.sku = "SKU should contain only letters, numbers, and hyphens";
    }

    const priceValue = parseFloat(unitPrice);
    if (!unitPrice.trim()) {
      newErrors.unitPrice = "Unit price is required";
    } else if (isNaN(priceValue) || priceValue <= 0) {
      newErrors.unitPrice = "Unit price must be a positive number";
    } else if (priceValue > 99999.99) {
      newErrors.unitPrice = "Unit price cannot exceed $99,999.99";
    }

    setLocalErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    await onSubmit({
      productId,
      productName: productName.trim(),
      sku: sku.trim().toUpperCase(),
      unitPrice: parseFloat(unitPrice),
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6" noValidate>
      <FieldGroup>
        <Field data-invalid={!!allErrors.productId}>
          <FieldLabel htmlFor={`${formId}-productId`}>Product ID</FieldLabel>
          <Input
            id={`${formId}-productId`}
            value={productId || "Generating..."}
            readOnly
            className="font-mono bg-muted"
            data-testid="product-id-input"
          />
          <FieldDescription>Auto-generated unique identifier</FieldDescription>
          {allErrors.productId && <FieldError>{allErrors.productId}</FieldError>}
        </Field>

        <Field data-invalid={!!allErrors.productName}>
          <FieldLabel htmlFor={`${formId}-productName`}>Product Name</FieldLabel>
          <Input
            id={`${formId}-productName`}
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="e.g., Ergonomic Keyboard"
            aria-invalid={!!allErrors.productName}
            data-testid="product-name-input"
            disabled={isSubmitting}
          />
          {allErrors.productName && <FieldError>{allErrors.productName}</FieldError>}
        </Field>

        <Field data-invalid={!!allErrors.sku}>
          <FieldLabel htmlFor={`${formId}-sku`}>SKU</FieldLabel>
          <Input
            id={`${formId}-sku`}
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g., KB-ERG-001"
            aria-invalid={!!allErrors.sku}
            data-testid="product-sku-input"
            disabled={isSubmitting}
          />
          <FieldDescription>Stock Keeping Unit (letters, numbers, hyphens)</FieldDescription>
          {allErrors.sku && <FieldError>{allErrors.sku}</FieldError>}
        </Field>

        <Field data-invalid={!!allErrors.unitPrice}>
          <FieldLabel htmlFor={`${formId}-unitPrice`}>Unit Price ($)</FieldLabel>
          <Input
            id={`${formId}-unitPrice`}
            type="number"
            step="0.01"
            min="0.01"
            max="99999.99"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="e.g., 49.99"
            aria-invalid={!!allErrors.unitPrice}
            data-testid="product-price-input"
            disabled={isSubmitting}
          />
          <FieldDescription>Price per unit in dollars</FieldDescription>
          {allErrors.unitPrice && <FieldError>{allErrors.unitPrice}</FieldError>}
        </Field>
      </FieldGroup>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            data-testid="product-form-cancel"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={isSubmitting || !productId}
          data-testid="product-form-submit"
        >
          {isSubmitting ? "Creating..." : "Create Product"}
        </Button>
      </div>
    </form>
  );
}

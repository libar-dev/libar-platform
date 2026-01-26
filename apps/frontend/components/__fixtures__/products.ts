/**
 * Mock product data fixtures for Ladle stories.
 * Matches the productCatalog projection schema.
 */

/**
 * Mock ID type for Convex documents.
 * In production, this would come from Convex generated types.
 */
type MockId<TableName extends string> = string & { __tableName: TableName };

/**
 * Product catalog projection type (matches schema.ts)
 */
export interface ProductCatalogItem {
  _id: MockId<"productCatalog">;
  _creationTime: number;
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
  availableQuantity: number;
  reservedQuantity: number;
  totalQuantity: number;
  createdAt: number;
  updatedAt: number;
}

const now = Date.now();
const dayMs = 86400000;

/**
 * Individual mock products with different stock scenarios.
 */
export const mockProducts = {
  inStock: {
    _id: "product_001" as MockId<"productCatalog">,
    _creationTime: now - dayMs * 30,
    productId: "prod-001",
    productName: "Ergonomic Keyboard",
    sku: "KB-ERG-001",
    unitPrice: 129.99,
    availableQuantity: 150,
    reservedQuantity: 10,
    totalQuantity: 160,
    createdAt: now - dayMs * 30,
    updatedAt: now,
  },
  lowStock: {
    _id: "product_002" as MockId<"productCatalog">,
    _creationTime: now - dayMs * 45,
    productId: "prod-002",
    productName: "Wireless Mouse",
    sku: "MS-WL-002",
    unitPrice: 49.99,
    availableQuantity: 5,
    reservedQuantity: 3,
    totalQuantity: 8,
    createdAt: now - dayMs * 45,
    updatedAt: now - dayMs * 2,
  },
  outOfStock: {
    _id: "product_003" as MockId<"productCatalog">,
    _creationTime: now - dayMs * 60,
    productId: "prod-003",
    productName: "USB-C Hub",
    sku: "HB-USB-003",
    unitPrice: 79.99,
    availableQuantity: 0,
    reservedQuantity: 0,
    totalQuantity: 0,
    createdAt: now - dayMs * 60,
    updatedAt: now - dayMs * 5,
  },
  highDemand: {
    _id: "product_004" as MockId<"productCatalog">,
    _creationTime: now - dayMs * 20,
    productId: "prod-004",
    productName: "4K Monitor",
    sku: "MN-4K-004",
    unitPrice: 399.99,
    availableQuantity: 25,
    reservedQuantity: 75,
    totalQuantity: 100,
    createdAt: now - dayMs * 20,
    updatedAt: now - 3600000, // 1 hour ago
  },
  newArrival: {
    _id: "product_005" as MockId<"productCatalog">,
    _creationTime: now - dayMs * 2,
    productId: "prod-005",
    productName: "Mechanical Keyboard Pro",
    sku: "KB-MEC-005",
    unitPrice: 179.99,
    availableQuantity: 500,
    reservedQuantity: 0,
    totalQuantity: 500,
    createdAt: now - dayMs * 2,
    updatedAt: now - dayMs * 2,
  },
  almostSoldOut: {
    _id: "product_006" as MockId<"productCatalog">,
    _creationTime: now - dayMs * 90,
    productId: "prod-006",
    productName: "Standing Desk Mat",
    sku: "DK-MAT-006",
    unitPrice: 59.99,
    availableQuantity: 2,
    reservedQuantity: 8,
    totalQuantity: 10,
    createdAt: now - dayMs * 90,
    updatedAt: now - 7200000, // 2 hours ago
  },
} as const satisfies Record<string, ProductCatalogItem>;

/**
 * Array of all mock products for list views.
 */
export const productList: ProductCatalogItem[] = Object.values(mockProducts);

/**
 * Extended product list for pagination testing.
 */
export const extendedProductList: ProductCatalogItem[] = [
  ...productList,
  {
    _id: "product_007" as MockId<"productCatalog">,
    _creationTime: now - dayMs * 15,
    productId: "prod-007",
    productName: "Webcam HD",
    sku: "WC-HD-007",
    unitPrice: 89.99,
    availableQuantity: 45,
    reservedQuantity: 5,
    totalQuantity: 50,
    createdAt: now - dayMs * 15,
    updatedAt: now - dayMs * 3,
  },
  {
    _id: "product_008" as MockId<"productCatalog">,
    _creationTime: now - dayMs * 10,
    productId: "prod-008",
    productName: "Noise-Cancelling Headphones",
    sku: "HP-NC-008",
    unitPrice: 249.99,
    availableQuantity: 30,
    reservedQuantity: 20,
    totalQuantity: 50,
    createdAt: now - dayMs * 10,
    updatedAt: now - dayMs,
  },
  {
    _id: "product_009" as MockId<"productCatalog">,
    _creationTime: now - dayMs * 5,
    productId: "prod-009",
    productName: "Laptop Stand",
    sku: "LS-ALU-009",
    unitPrice: 69.99,
    availableQuantity: 80,
    reservedQuantity: 10,
    totalQuantity: 90,
    createdAt: now - dayMs * 5,
    updatedAt: now - dayMs,
  },
  {
    _id: "product_010" as MockId<"productCatalog">,
    _creationTime: now - dayMs * 3,
    productId: "prod-010",
    productName: "Cable Management Kit",
    sku: "CM-KIT-010",
    unitPrice: 29.99,
    availableQuantity: 200,
    reservedQuantity: 0,
    totalQuantity: 200,
    createdAt: now - dayMs * 3,
    updatedAt: now - dayMs * 3,
  },
];

/**
 * Stock level thresholds for UI display logic.
 */
export const stockThresholds = {
  lowStockWarning: 10,
  criticalStock: 5,
  outOfStock: 0,
} as const;

/**
 * Helper to determine stock status for UI.
 */
export function getStockStatus(
  availableQuantity: number
): "in-stock" | "low-stock" | "out-of-stock" {
  if (availableQuantity === 0) return "out-of-stock";
  if (availableQuantity <= stockThresholds.lowStockWarning) return "low-stock";
  return "in-stock";
}

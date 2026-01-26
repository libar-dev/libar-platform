/**
 * Unit tests for Inventory domain functions.
 *
 * These are pure unit tests that don't require Convex or mocking.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateTotalQuantity,
  createInitialInventoryCMS,
  upcastInventoryCMS,
  CURRENT_INVENTORY_CMS_VERSION,
  type InventoryCMS,
} from "../../../../convex/contexts/inventory/domain/inventory.js";

describe("calculateTotalQuantity", () => {
  it("returns sum of available and reserved", () => {
    const inventory: InventoryCMS = {
      productId: "prod_1",
      productName: "Test",
      sku: "SKU-001",
      availableQuantity: 100,
      reservedQuantity: 25,
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(calculateTotalQuantity(inventory)).toBe(125);
  });

  it("returns only available when reserved is zero", () => {
    const inventory: InventoryCMS = {
      productId: "prod_1",
      productName: "Test",
      sku: "SKU-001",
      availableQuantity: 50,
      reservedQuantity: 0,
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(calculateTotalQuantity(inventory)).toBe(50);
  });

  it("returns only reserved when available is zero", () => {
    const inventory: InventoryCMS = {
      productId: "prod_1",
      productName: "Test",
      sku: "SKU-001",
      availableQuantity: 0,
      reservedQuantity: 30,
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(calculateTotalQuantity(inventory)).toBe(30);
  });

  it("returns zero when both are zero", () => {
    const inventory: InventoryCMS = {
      productId: "prod_1",
      productName: "Test",
      sku: "SKU-001",
      availableQuantity: 0,
      reservedQuantity: 0,
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(calculateTotalQuantity(inventory)).toBe(0);
  });
});

describe("createInitialInventoryCMS", () => {
  let beforeTimestamp: number;

  beforeEach(() => {
    beforeTimestamp = Date.now();
  });

  it("creates CMS with correct productId, productName, sku, and unitPrice", () => {
    const cms = createInitialInventoryCMS("prod_123", "Test Widget", "SKU-TEST-001", 29.99);

    expect(cms.productId).toBe("prod_123");
    expect(cms.productName).toBe("Test Widget");
    expect(cms.sku).toBe("SKU-TEST-001");
    expect(cms.unitPrice).toBe(29.99);
  });

  it("initializes availableQuantity to 0", () => {
    const cms = createInitialInventoryCMS("prod_123", "Test", "SKU-001", 10.0);
    expect(cms.availableQuantity).toBe(0);
  });

  it("initializes reservedQuantity to 0", () => {
    const cms = createInitialInventoryCMS("prod_123", "Test", "SKU-001", 10.0);
    expect(cms.reservedQuantity).toBe(0);
  });

  it("initializes version to 0", () => {
    const cms = createInitialInventoryCMS("prod_123", "Test", "SKU-001", 10.0);
    expect(cms.version).toBe(0);
  });

  it("initializes with current state version", () => {
    const cms = createInitialInventoryCMS("prod_123", "Test", "SKU-001", 10.0);
    expect(cms.stateVersion).toBe(CURRENT_INVENTORY_CMS_VERSION);
  });

  it("sets createdAt and updatedAt to current timestamp", () => {
    const cms = createInitialInventoryCMS("prod_123", "Test", "SKU-001", 10.0);
    const afterTimestamp = Date.now();

    expect(cms.createdAt).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(cms.createdAt).toBeLessThanOrEqual(afterTimestamp);
    expect(cms.updatedAt).toBe(cms.createdAt);
  });
});

describe("upcastInventoryCMS", () => {
  it("returns unchanged CMS when already at current version", () => {
    const originalCMS: InventoryCMS = {
      productId: "prod_123",
      productName: "Test Product",
      sku: "SKU-001",
      availableQuantity: 100,
      reservedQuantity: 10,
      version: 5,
      stateVersion: CURRENT_INVENTORY_CMS_VERSION,
      createdAt: 1000,
      updatedAt: 2000,
    };

    const result = upcastInventoryCMS(originalCMS);

    expect(result).toEqual(originalCMS);
    expect(result.stateVersion).toBe(CURRENT_INVENTORY_CMS_VERSION);
  });

  it("upgrades CMS with missing stateVersion to current version", () => {
    const oldCMS = {
      productId: "prod_123",
      productName: "Test Product",
      sku: "SKU-001",
      availableQuantity: 50,
      reservedQuantity: 5,
      version: 3,
      // stateVersion missing (version 0)
      createdAt: 1000,
      updatedAt: 2000,
    };

    const result = upcastInventoryCMS(oldCMS);

    expect(result.stateVersion).toBe(CURRENT_INVENTORY_CMS_VERSION);
    expect(result.productId).toBe("prod_123");
    expect(result.availableQuantity).toBe(50);
  });

  it("upgrades CMS with stateVersion 0 to current version", () => {
    const oldCMS = {
      productId: "prod_123",
      productName: "Test Product",
      sku: "SKU-001",
      availableQuantity: 75,
      reservedQuantity: 15,
      version: 4,
      stateVersion: 0,
      createdAt: 1000,
      updatedAt: 2000,
    };

    const result = upcastInventoryCMS(oldCMS);

    expect(result.stateVersion).toBe(CURRENT_INVENTORY_CMS_VERSION);
    // Verify all other fields preserved
    expect(result.productId).toBe("prod_123");
    expect(result.availableQuantity).toBe(75);
    expect(result.reservedQuantity).toBe(15);
  });

  it("throws error for future versions", () => {
    const futureCMS = {
      productId: "prod_123",
      productName: "Test Product",
      sku: "SKU-001",
      availableQuantity: 50,
      reservedQuantity: 5,
      version: 3,
      stateVersion: CURRENT_INVENTORY_CMS_VERSION + 10, // Future version
      createdAt: 1000,
      updatedAt: 2000,
    };

    expect(() => upcastInventoryCMS(futureCMS)).toThrow();
    expect(() => upcastInventoryCMS(futureCMS)).toThrow(/newer than supported version/);
  });

  it("preserves all fields during upcast", () => {
    const oldCMS = {
      productId: "prod_abc",
      productName: "Widget Deluxe",
      sku: "SKU-DELUXE-001",
      availableQuantity: 200,
      reservedQuantity: 50,
      version: 10,
      stateVersion: 0,
      createdAt: 5000,
      updatedAt: 6000,
    };

    const result = upcastInventoryCMS(oldCMS);

    expect(result.productId).toBe("prod_abc");
    expect(result.productName).toBe("Widget Deluxe");
    expect(result.sku).toBe("SKU-DELUXE-001");
    expect(result.availableQuantity).toBe(200);
    expect(result.reservedQuantity).toBe(50);
    expect(result.version).toBe(10);
    expect(result.createdAt).toBe(5000);
    expect(result.updatedAt).toBe(6000);
  });
});

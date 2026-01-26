/**
 * Unit tests for ProjectionRegistry.
 *
 * Tests the projection registry CRUD operations and lookup capabilities.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createProjectionRegistry } from "../../../src/projections/registry";
import { defineProjection } from "@libar-dev/platform-bc";

describe("ProjectionRegistry", () => {
  // Test projection definitions
  const orderSummary = defineProjection({
    projectionName: "orderSummary",
    description: "Order summary view",
    targetTable: "orderSummaries",
    partitionKeyField: "orderId",
    eventSubscriptions: ["OrderCreated", "OrderSubmitted"] as const,
    context: "orders",
    type: "primary",
    category: "view",
  });

  const productCatalog = defineProjection({
    projectionName: "productCatalog",
    description: "Product catalog view",
    targetTable: "productCatalog",
    partitionKeyField: "productId",
    eventSubscriptions: ["ProductCreated", "StockAdded"] as const,
    context: "inventory",
    type: "primary",
    category: "view",
    secondaryTables: ["stockAvailability"],
  });

  const orderWithInventory = defineProjection({
    projectionName: "orderWithInventory",
    description: "Cross-context order view",
    targetTable: "orderWithInventoryStatus",
    partitionKeyField: "orderId",
    eventSubscriptions: ["OrderCreated", "OrderSubmitted", "StockReserved"] as const,
    context: "cross-context",
    type: "cross-context",
    category: "integration",
    sources: ["orders", "inventory"],
  });

  // Additional projections for category testing
  const orderExistence = defineProjection({
    projectionName: "orderExistence",
    description: "Order existence check for validation",
    targetTable: "orderExistence",
    partitionKeyField: "orderId",
    eventSubscriptions: ["OrderCreated", "OrderCancelled"] as const,
    context: "orders",
    type: "primary",
    category: "logic",
  });

  const dailySales = defineProjection({
    projectionName: "dailySales",
    description: "Daily sales aggregation",
    targetTable: "dailySalesReports",
    partitionKeyField: "date",
    eventSubscriptions: ["OrderConfirmed"] as const,
    context: "analytics",
    type: "secondary",
    category: "reporting",
  });

  describe("register", () => {
    it("registers a projection definition", () => {
      const registry = createProjectionRegistry();

      registry.register(orderSummary);

      expect(registry.has("orderSummary")).toBe(true);
      expect(registry.size).toBe(1);
    });

    it("registers multiple projections", () => {
      const registry = createProjectionRegistry();

      registry.register(orderSummary);
      registry.register(productCatalog);
      registry.register(orderWithInventory);

      expect(registry.size).toBe(3);
    });

    it("throws when registering duplicate projection name", () => {
      const registry = createProjectionRegistry();
      registry.register(orderSummary);

      expect(() => registry.register(orderSummary)).toThrow(
        'Projection "orderSummary" is already registered'
      );
    });
  });

  describe("get", () => {
    let registry: ReturnType<typeof createProjectionRegistry>;

    beforeEach(() => {
      registry = createProjectionRegistry();
      registry.register(orderSummary);
      registry.register(productCatalog);
    });

    it("returns projection by name", () => {
      const projection = registry.get("orderSummary");

      expect(projection).toBeDefined();
      expect(projection?.projectionName).toBe("orderSummary");
      expect(projection?.targetTable).toBe("orderSummaries");
    });

    it("returns undefined for unknown projection", () => {
      const projection = registry.get("unknownProjection");

      expect(projection).toBeUndefined();
    });
  });

  describe("has", () => {
    it("returns true for registered projection", () => {
      const registry = createProjectionRegistry();
      registry.register(orderSummary);

      expect(registry.has("orderSummary")).toBe(true);
    });

    it("returns false for unregistered projection", () => {
      const registry = createProjectionRegistry();

      expect(registry.has("unknownProjection")).toBe(false);
    });
  });

  describe("list", () => {
    it("returns empty array for empty registry", () => {
      const registry = createProjectionRegistry();

      expect(registry.list()).toEqual([]);
    });

    it("returns all registered projections", () => {
      const registry = createProjectionRegistry();
      registry.register(orderSummary);
      registry.register(productCatalog);

      const all = registry.list();

      expect(all).toHaveLength(2);
      expect(all.map((p) => p.projectionName)).toContain("orderSummary");
      expect(all.map((p) => p.projectionName)).toContain("productCatalog");
    });
  });

  describe("size", () => {
    it("returns 0 for empty registry", () => {
      const registry = createProjectionRegistry();

      expect(registry.size).toBe(0);
    });

    it("returns correct count after registrations", () => {
      const registry = createProjectionRegistry();
      registry.register(orderSummary);
      registry.register(productCatalog);

      expect(registry.size).toBe(2);
    });
  });

  describe("getByEventType", () => {
    let registry: ReturnType<typeof createProjectionRegistry>;

    beforeEach(() => {
      registry = createProjectionRegistry();
      registry.register(orderSummary);
      registry.register(productCatalog);
      registry.register(orderWithInventory);
    });

    it("returns projections that subscribe to event type", () => {
      const projections = registry.getByEventType("OrderCreated");

      expect(projections).toHaveLength(2);
      expect(projections.map((p) => p.projectionName)).toContain("orderSummary");
      expect(projections.map((p) => p.projectionName)).toContain("orderWithInventory");
    });

    it("returns single projection for context-specific event", () => {
      const projections = registry.getByEventType("ProductCreated");

      expect(projections).toHaveLength(1);
      expect(projections[0].projectionName).toBe("productCatalog");
    });

    it("returns empty array for unknown event type", () => {
      const projections = registry.getByEventType("UnknownEvent");

      expect(projections).toEqual([]);
    });
  });

  describe("getAllEventTypes", () => {
    it("returns empty array for empty registry", () => {
      const registry = createProjectionRegistry();

      expect(registry.getAllEventTypes()).toEqual([]);
    });

    it("returns unique sorted event types", () => {
      const registry = createProjectionRegistry();
      registry.register(orderSummary);
      registry.register(productCatalog);
      registry.register(orderWithInventory);

      const eventTypes = registry.getAllEventTypes();

      // Should be sorted
      const sorted = [...eventTypes].sort();
      expect(eventTypes).toEqual(sorted);

      // Should be unique
      expect(new Set(eventTypes).size).toBe(eventTypes.length);

      // Should include all event types
      expect(eventTypes).toContain("OrderCreated");
      expect(eventTypes).toContain("ProductCreated");
      expect(eventTypes).toContain("StockReserved");
    });
  });

  describe("getByContext", () => {
    let registry: ReturnType<typeof createProjectionRegistry>;

    beforeEach(() => {
      registry = createProjectionRegistry();
      registry.register(orderSummary);
      registry.register(productCatalog);
      registry.register(orderWithInventory);
    });

    it("filters by orders context", () => {
      const projections = registry.getByContext("orders");

      expect(projections).toHaveLength(1);
      expect(projections[0].projectionName).toBe("orderSummary");
    });

    it("filters by inventory context", () => {
      const projections = registry.getByContext("inventory");

      expect(projections).toHaveLength(1);
      expect(projections[0].projectionName).toBe("productCatalog");
    });

    it("filters by cross-context", () => {
      const projections = registry.getByContext("cross-context");

      expect(projections).toHaveLength(1);
      expect(projections[0].projectionName).toBe("orderWithInventory");
    });

    it("returns empty array for unknown context", () => {
      const projections = registry.getByContext("unknown");

      expect(projections).toEqual([]);
    });
  });

  describe("getRebuildOrder", () => {
    it("returns empty array for empty registry", () => {
      const registry = createProjectionRegistry();

      expect(registry.getRebuildOrder()).toEqual([]);
    });

    it("returns primary projections before cross-context", () => {
      const registry = createProjectionRegistry();
      // Register in reverse order to ensure sorting works
      registry.register(orderWithInventory);
      registry.register(orderSummary);
      registry.register(productCatalog);

      const order = registry.getRebuildOrder();
      const names = order.map((p) => p.projectionName);

      // Primary projections should come before cross-context
      const orderWithInventoryIndex = names.indexOf("orderWithInventory");
      const orderSummaryIndex = names.indexOf("orderSummary");
      const productCatalogIndex = names.indexOf("productCatalog");

      expect(orderWithInventoryIndex).toBeGreaterThan(orderSummaryIndex);
      expect(orderWithInventoryIndex).toBeGreaterThan(productCatalogIndex);
    });

    it("includes all projections", () => {
      const registry = createProjectionRegistry();
      registry.register(orderSummary);
      registry.register(productCatalog);
      registry.register(orderWithInventory);

      const order = registry.getRebuildOrder();

      expect(order).toHaveLength(3);
    });
  });

  describe("getByCategory", () => {
    let registry: ReturnType<typeof createProjectionRegistry>;

    beforeEach(() => {
      registry = createProjectionRegistry();
      registry.register(orderSummary); // view
      registry.register(productCatalog); // view
      registry.register(orderWithInventory); // integration
      registry.register(orderExistence); // logic
      registry.register(dailySales); // reporting
    });

    it("returns all view projections", () => {
      const projections = registry.getByCategory("view");

      expect(projections).toHaveLength(2);
      expect(projections.map((p) => p.projectionName)).toContain("orderSummary");
      expect(projections.map((p) => p.projectionName)).toContain("productCatalog");
    });

    it("returns all logic projections", () => {
      const projections = registry.getByCategory("logic");

      expect(projections).toHaveLength(1);
      expect(projections[0].projectionName).toBe("orderExistence");
    });

    it("returns all reporting projections", () => {
      const projections = registry.getByCategory("reporting");

      expect(projections).toHaveLength(1);
      expect(projections[0].projectionName).toBe("dailySales");
    });

    it("returns all integration projections", () => {
      const projections = registry.getByCategory("integration");

      expect(projections).toHaveLength(1);
      expect(projections[0].projectionName).toBe("orderWithInventory");
    });

    it("returns empty array for category with no projections", () => {
      const registry = createProjectionRegistry();
      // Register only view projections
      registry.register(orderSummary);

      const projections = registry.getByCategory("logic");

      expect(projections).toEqual([]);
    });

    it("all returned projections have the requested category", () => {
      const projections = registry.getByCategory("view");

      for (const projection of projections) {
        expect(projection.category).toBe("view");
      }
    });

    it("returns projections regardless of registration order", () => {
      // Create fresh registry to test registration order independence
      const freshRegistry = createProjectionRegistry();

      // Register in non-category-grouped order
      freshRegistry.register(orderExistence); // logic
      freshRegistry.register(orderSummary); // view
      freshRegistry.register(dailySales); // reporting
      freshRegistry.register(productCatalog); // view
      freshRegistry.register(orderWithInventory); // integration

      // View projections should be found regardless of registration order
      const viewProjections = freshRegistry.getByCategory("view");
      expect(viewProjections).toHaveLength(2);
      expect(viewProjections.map((p) => p.projectionName).sort()).toEqual([
        "orderSummary",
        "productCatalog",
      ]);
    });

    it("uses indexed lookup for efficiency", () => {
      // This test verifies that the index is correctly maintained
      // by checking that categories registered at different times are found
      const freshRegistry = createProjectionRegistry();

      // Register first view projection
      freshRegistry.register(orderSummary);
      expect(freshRegistry.getByCategory("view")).toHaveLength(1);

      // Register non-view projection
      freshRegistry.register(orderExistence);
      expect(freshRegistry.getByCategory("view")).toHaveLength(1);
      expect(freshRegistry.getByCategory("logic")).toHaveLength(1);

      // Register second view projection
      freshRegistry.register(productCatalog);
      expect(freshRegistry.getByCategory("view")).toHaveLength(2);
    });
  });
});

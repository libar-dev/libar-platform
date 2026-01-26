/**
 * Unit tests for Query Factory functions.
 *
 * Tests the query descriptor factories for read model queries.
 */
import { describe, it, expect } from "vitest";
import {
  createReadModelQuery,
  createPaginatedQuery,
  createQueryRegistry,
  getPaginationOptions,
  type ReadModelQueryDescriptor,
  type PaginatedQueryDescriptor,
} from "../../../src/queries/factory";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../../src/queries/pagination";

describe("Query Factory", () => {
  describe("createReadModelQuery", () => {
    it("creates a single result query descriptor", () => {
      const descriptor = createReadModelQuery<{ id: string; name: string }>(
        {
          queryName: "getOrderById",
          description: "Gets a single order by its ID",
          sourceProjection: "orderSummary",
          targetTable: "orderSummaries",
        },
        "single"
      );

      expect(descriptor.resultType).toBe("single");
      expect(descriptor.config.queryName).toBe("getOrderById");
      expect(descriptor.config.description).toBe("Gets a single order by its ID");
      expect(descriptor.config.sourceProjection).toBe("orderSummary");
      expect(descriptor.config.targetTable).toBe("orderSummaries");
    });

    it("creates a list result query descriptor", () => {
      const descriptor = createReadModelQuery<{ id: string }[]>(
        {
          queryName: "getOrdersByCustomer",
          description: "Gets all orders for a customer",
          sourceProjection: "orderSummary",
          targetTable: "orderSummaries",
        },
        "list"
      );

      expect(descriptor.resultType).toBe("list");
      expect(descriptor.config.queryName).toBe("getOrdersByCustomer");
    });

    it("creates a count result query descriptor", () => {
      const descriptor = createReadModelQuery<number>(
        {
          queryName: "countPendingOrders",
          description: "Counts pending orders",
          sourceProjection: "orderSummary",
          targetTable: "orderSummaries",
        },
        "count"
      );

      expect(descriptor.resultType).toBe("count");
      expect(descriptor.config.queryName).toBe("countPendingOrders");
    });
  });

  describe("createPaginatedQuery", () => {
    it("creates a paginated query descriptor with defaults", () => {
      const descriptor = createPaginatedQuery<{ id: string }>({
        queryName: "listOrders",
        description: "Lists orders with pagination",
        sourceProjection: "orderSummary",
        targetTable: "orderSummaries",
        paginationIndex: "by_customer",
      });

      expect(descriptor.resultType).toBe("paginated");
      expect(descriptor.config.queryName).toBe("listOrders");
      expect(descriptor.config.paginationIndex).toBe("by_customer");
      expect(descriptor.defaults.pageSize).toBe(DEFAULT_PAGE_SIZE);
      expect(descriptor.defaults.maxPageSize).toBe(MAX_PAGE_SIZE);
    });

    it("creates a paginated query descriptor with custom page sizes", () => {
      const descriptor = createPaginatedQuery<{ id: string }>({
        queryName: "listProducts",
        description: "Lists products with custom pagination",
        sourceProjection: "productCatalog",
        targetTable: "productCatalog",
        paginationIndex: "by_category",
        defaultPageSize: 50,
        maxPageSize: 200,
      });

      expect(descriptor.defaults.pageSize).toBe(50);
      expect(descriptor.defaults.maxPageSize).toBe(200);
      expect(descriptor.config.defaultPageSize).toBe(50);
      expect(descriptor.config.maxPageSize).toBe(200);
    });

    it("applies defaults to config when not provided", () => {
      const descriptor = createPaginatedQuery<{ id: string }>({
        queryName: "listItems",
        description: "Lists items",
        sourceProjection: "itemList",
        targetTable: "items",
        paginationIndex: "by_created",
      });

      // Config should have defaults applied
      expect(descriptor.config.defaultPageSize).toBe(DEFAULT_PAGE_SIZE);
      expect(descriptor.config.maxPageSize).toBe(MAX_PAGE_SIZE);
    });
  });

  describe("createQueryRegistry", () => {
    it("creates a query registry with context and projection", () => {
      const registry = createQueryRegistry("orders", "orderSummary", {});

      expect(registry.context).toBe("orders");
      expect(registry.sourceProjection).toBe("orderSummary");
      expect(registry.queries).toEqual({});
    });

    it("creates a registry with multiple queries", () => {
      const getById = createReadModelQuery<{ id: string }>(
        {
          queryName: "getById",
          description: "Get by ID",
          sourceProjection: "orderSummary",
          targetTable: "orderSummaries",
        },
        "single"
      );

      const list = createPaginatedQuery<{ id: string }>({
        queryName: "list",
        description: "List orders",
        sourceProjection: "orderSummary",
        targetTable: "orderSummaries",
        paginationIndex: "by_created",
      });

      const registry = createQueryRegistry("orders", "orderSummary", {
        getById,
        list,
      });

      expect(Object.keys(registry.queries)).toHaveLength(2);
      expect(registry.queries.getById.resultType).toBe("single");
      expect(registry.queries.list.resultType).toBe("paginated");
    });

    it("provides type-safe access to query descriptors", () => {
      const getById = createReadModelQuery<{ id: string; name: string }>(
        {
          queryName: "getById",
          description: "Get by ID",
          sourceProjection: "orderSummary",
          targetTable: "orderSummaries",
        },
        "single"
      );

      const registry = createQueryRegistry("orders", "orderSummary", { getById });

      // Type-safe access
      const descriptor = registry.queries.getById;
      expect(descriptor.config.queryName).toBe("getById");
    });
  });

  describe("getPaginationOptions", () => {
    const paginatedQuery = createPaginatedQuery<{ id: string }>({
      queryName: "listItems",
      description: "Lists items",
      sourceProjection: "itemList",
      targetTable: "items",
      paginationIndex: "by_created",
      defaultPageSize: 25,
      maxPageSize: 100,
    });

    it("returns defaults when no options provided", () => {
      const options = getPaginationOptions(paginatedQuery, undefined);

      expect(options.pageSize).toBe(25);
      expect(options.cursor).toBeUndefined();
    });

    it("uses provided page size within limits", () => {
      const options = getPaginationOptions(paginatedQuery, { pageSize: 50 });

      expect(options.pageSize).toBe(50);
    });

    it("caps page size at max", () => {
      const options = getPaginationOptions(paginatedQuery, { pageSize: 500 });

      expect(options.pageSize).toBe(100);
    });

    it("enforces minimum page size of 1", () => {
      const options = getPaginationOptions(paginatedQuery, { pageSize: 0 });

      expect(options.pageSize).toBe(1);
    });

    it("handles negative page size", () => {
      const options = getPaginationOptions(paginatedQuery, { pageSize: -10 });

      expect(options.pageSize).toBe(1);
    });

    it("passes through cursor", () => {
      const options = getPaginationOptions(paginatedQuery, {
        pageSize: 20,
        cursor: "abc123",
      });

      expect(options.cursor).toBe("abc123");
    });

    it("returns undefined cursor when not provided", () => {
      const options = getPaginationOptions(paginatedQuery, { pageSize: 20 });

      expect(options.cursor).toBeUndefined();
    });
  });

  describe("Type Safety", () => {
    it("preserves result type in descriptor", () => {
      interface Order {
        id: string;
        status: string;
        total: number;
      }

      const descriptor: ReadModelQueryDescriptor<Order> = createReadModelQuery<Order>(
        {
          queryName: "getOrder",
          description: "Get order",
          sourceProjection: "orderSummary",
          targetTable: "orders",
        },
        "single"
      );

      // TypeScript should infer the correct type
      expect(descriptor.resultType).toBe("single");
    });

    it("preserves item type in paginated descriptor", () => {
      interface Product {
        id: string;
        name: string;
        price: number;
      }

      const descriptor: PaginatedQueryDescriptor<Product> = createPaginatedQuery<Product>({
        queryName: "listProducts",
        description: "List products",
        sourceProjection: "productCatalog",
        targetTable: "products",
        paginationIndex: "by_category",
      });

      expect(descriptor.resultType).toBe("paginated");
    });
  });
});

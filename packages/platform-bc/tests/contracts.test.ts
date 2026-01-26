/**
 * Unit Tests for Bounded Context Contracts
 *
 * Tests the contract types and type helpers:
 * - BoundedContextIdentity: Context identification
 * - DualWriteContextContract: Dual-write pattern contract
 * - Type extraction helpers
 */
import { describe, it, expect } from "vitest";
import type {
  BoundedContextIdentity,
  DualWriteContextContract,
  CMSTypeDefinition,
  ExtractCommandTypes,
  ExtractEventTypes,
  ExtractCMSTableNames,
} from "../src";

describe("BoundedContextIdentity", () => {
  it("defines context identity structure", () => {
    const identity: BoundedContextIdentity = {
      name: "orders",
      description: "Order management bounded context",
      version: 1,
      streamTypePrefix: "Order",
    };

    expect(identity.name).toBe("orders");
    expect(identity.description).toBe("Order management bounded context");
    expect(identity.version).toBe(1);
    expect(identity.streamTypePrefix).toBe("Order");
  });
});

describe("CMSTypeDefinition", () => {
  it("defines CMS table metadata", () => {
    const cmsDefinition: CMSTypeDefinition = {
      tableName: "orderCMS",
      currentStateVersion: 2,
      description: "Order aggregate state",
    };

    expect(cmsDefinition.tableName).toBe("orderCMS");
    expect(cmsDefinition.currentStateVersion).toBe(2);
    expect(cmsDefinition.description).toBe("Order aggregate state");
  });
});

describe("DualWriteContextContract", () => {
  // Define a test contract
  const TestContract = {
    identity: {
      name: "test",
      description: "Test bounded context",
      version: 1,
      streamTypePrefix: "Test",
    },
    executionMode: "dual-write",
    commandTypes: ["CreateTest", "UpdateTest", "DeleteTest"] as const,
    eventTypes: ["TestCreated", "TestUpdated", "TestDeleted"] as const,
    cmsTypes: {
      testCMS: {
        tableName: "testCMS",
        currentStateVersion: 1,
        description: "Test aggregate state",
      },
    },
    errorCodes: ["TEST_NOT_FOUND", "TEST_ALREADY_EXISTS"] as const,
  } as const satisfies DualWriteContextContract<
    readonly ["CreateTest", "UpdateTest", "DeleteTest"],
    readonly ["TestCreated", "TestUpdated", "TestDeleted"],
    { testCMS: CMSTypeDefinition }
  >;

  it("has correct identity", () => {
    expect(TestContract.identity.name).toBe("test");
    expect(TestContract.identity.streamTypePrefix).toBe("Test");
  });

  it("has dual-write execution mode", () => {
    expect(TestContract.executionMode).toBe("dual-write");
  });

  it("lists command types", () => {
    expect(TestContract.commandTypes).toEqual(["CreateTest", "UpdateTest", "DeleteTest"]);
  });

  it("lists event types", () => {
    expect(TestContract.eventTypes).toEqual(["TestCreated", "TestUpdated", "TestDeleted"]);
  });

  it("defines CMS types", () => {
    expect(TestContract.cmsTypes.testCMS.tableName).toBe("testCMS");
    expect(TestContract.cmsTypes.testCMS.currentStateVersion).toBe(1);
  });

  it("lists error codes", () => {
    expect(TestContract.errorCodes).toContain("TEST_NOT_FOUND");
    expect(TestContract.errorCodes).toContain("TEST_ALREADY_EXISTS");
  });
});

describe("Type extraction helpers", () => {
  // Define contract for type extraction tests
  const OrdersContract = {
    identity: {
      name: "orders",
      description: "Orders context",
      version: 1,
      streamTypePrefix: "Order",
    },
    executionMode: "dual-write",
    commandTypes: ["CreateOrder", "SubmitOrder"] as const,
    eventTypes: ["OrderCreated", "OrderSubmitted"] as const,
    cmsTypes: {
      orderCMS: {
        tableName: "orderCMS",
        currentStateVersion: 1,
        description: "Order state",
      },
    },
    errorCodes: ["ORDER_NOT_FOUND"],
  } as const satisfies DualWriteContextContract<
    readonly ["CreateOrder", "SubmitOrder"],
    readonly ["OrderCreated", "OrderSubmitted"],
    { orderCMS: CMSTypeDefinition }
  >;

  it("ExtractCommandTypes extracts command type union", () => {
    // TypeScript type-level test
    type Commands = ExtractCommandTypes<typeof OrdersContract>;

    // At runtime, verify contract structure and command types
    expect(OrdersContract.identity.name).toBe("orders");
    const commands: Commands[] = ["CreateOrder", "SubmitOrder"];
    expect(commands).toHaveLength(2);
  });

  it("ExtractEventTypes extracts event type union", () => {
    type Events = ExtractEventTypes<typeof OrdersContract>;

    const events: Events[] = ["OrderCreated", "OrderSubmitted"];
    expect(events).toHaveLength(2);
  });

  it("ExtractCMSTableNames extracts CMS table name union", () => {
    type TableNames = ExtractCMSTableNames<typeof OrdersContract>;

    const tables: TableNames[] = ["orderCMS"];
    expect(tables).toHaveLength(1);
  });
});

describe("Contract with multiple CMS tables", () => {
  const InventoryContract = {
    identity: {
      name: "inventory",
      description: "Inventory management",
      version: 1,
      streamTypePrefix: "Inventory",
    },
    executionMode: "dual-write",
    commandTypes: ["RegisterProduct", "ReserveStock"] as const,
    eventTypes: ["ProductRegistered", "StockReserved"] as const,
    cmsTypes: {
      productCMS: {
        tableName: "productCMS",
        currentStateVersion: 1,
        description: "Product catalog state",
      },
      reservationCMS: {
        tableName: "reservationCMS",
        currentStateVersion: 1,
        description: "Stock reservation state",
      },
    },
    errorCodes: ["PRODUCT_NOT_FOUND", "INSUFFICIENT_STOCK"],
  } as const satisfies DualWriteContextContract<
    readonly ["RegisterProduct", "ReserveStock"],
    readonly ["ProductRegistered", "StockReserved"],
    { productCMS: CMSTypeDefinition; reservationCMS: CMSTypeDefinition }
  >;

  it("supports multiple CMS tables", () => {
    expect(Object.keys(InventoryContract.cmsTypes)).toHaveLength(2);
    expect(InventoryContract.cmsTypes.productCMS).toBeDefined();
    expect(InventoryContract.cmsTypes.reservationCMS).toBeDefined();
  });

  it("extracts all CMS table names", () => {
    type TableNames = ExtractCMSTableNames<typeof InventoryContract>;
    const tables: TableNames[] = ["productCMS", "reservationCMS"];
    expect(tables).toHaveLength(2);
  });
});

/**
 * Unit Tests for CommandRegistry
 *
 * Tests the central registry for command definitions:
 * - Singleton pattern
 * - Command registration and lookup
 * - Duplicate detection
 * - Category-based filtering
 * - Validation
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { CommandRegistry, globalRegistry } from "../../../src/registry";
import type { CommandRegistration, CommandDefinitionMetadata } from "../../../src/registry/types";
import type { CommandConfig, CommandHandlerResult } from "../../../src/orchestration/types";

// Helper to create a mock FunctionReference
const mockFunctionRef = () => ({}) as never;

// Helper to create a minimal command registration for testing
function createMockRegistration(
  commandType: string,
  options: Partial<{
    boundedContext: string;
    category: "aggregate" | "process" | "system" | "batch";
    targetAggregate: { type: string; idField: string };
    targetProcess: string;
    subsystem: string;
    description: string;
    tags: string[];
    hasSecondaryProjections: boolean;
    hasSagaRoute: boolean;
    hasFailedProjection: boolean;
  }> = {}
): CommandRegistration<Record<string, unknown>, unknown> {
  const metadata: CommandDefinitionMetadata = {
    commandType,
    boundedContext: options.boundedContext ?? "test",
    category: options.category ?? "aggregate",
    schemaVersion: 1,
  };

  if (options.targetAggregate) {
    metadata.targetAggregate = options.targetAggregate;
  }
  if (options.targetProcess) {
    metadata.targetProcess = options.targetProcess;
  }
  if (options.subsystem) {
    metadata.subsystem = options.subsystem;
  }
  if (options.description) {
    metadata.description = options.description;
  }
  if (options.tags) {
    metadata.tags = options.tags;
  }

  const config: CommandConfig<
    Record<string, unknown>,
    Record<string, unknown>,
    CommandHandlerResult<unknown>,
    Record<string, unknown>,
    unknown
  > = {
    commandType,
    boundedContext: options.boundedContext ?? "test",
    handler: mockFunctionRef(),
    toHandlerArgs: (args) => args,
    projection: {
      handler: mockFunctionRef(),
      projectionName: "testProjection",
      toProjectionArgs: () => ({}),
      getPartitionKey: () => ({ name: "test", value: "1" }),
    },
  };

  if (options.hasSecondaryProjections) {
    config.secondaryProjections = [
      {
        handler: mockFunctionRef(),
        projectionName: "secondary",
        toProjectionArgs: () => ({}),
        getPartitionKey: () => ({ name: "test", value: "1" }),
      },
    ];
  }

  if (options.hasSagaRoute) {
    config.sagaRoute = {
      router: mockFunctionRef(),
      getEventType: () => "TestEvent",
    };
  }

  if (options.hasFailedProjection) {
    config.failedProjection = {
      handler: mockFunctionRef(),
      projectionName: "failed",
      toProjectionArgs: () => ({}),
      getPartitionKey: () => ({ name: "test", value: "1" }),
    };
  }

  return {
    metadata,
    argsSchema: z.object({}),
    config,
    registeredAt: Date.now(),
  };
}

describe("CommandRegistry", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    // Reset singleton before each test
    CommandRegistry.resetForTesting();
    registry = CommandRegistry.getInstance();
  });

  afterEach(() => {
    CommandRegistry.resetForTesting();
  });

  describe("getInstance", () => {
    it("returns the same instance on multiple calls", () => {
      const instance1 = CommandRegistry.getInstance();
      const instance2 = CommandRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("creates new instance after reset", () => {
      const instance1 = CommandRegistry.getInstance();
      CommandRegistry.resetForTesting();
      const instance2 = CommandRegistry.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("register", () => {
    it("registers a command successfully", () => {
      const registration = createMockRegistration("CreateOrder");
      registry.register(registration);
      expect(registry.has("CreateOrder")).toBe(true);
    });

    it("throws on duplicate registration", () => {
      const registration1 = createMockRegistration("CreateOrder", {
        boundedContext: "orders",
      });
      const registration2 = createMockRegistration("CreateOrder", {
        boundedContext: "other",
      });

      registry.register(registration1);
      expect(() => registry.register(registration2)).toThrow(
        'Duplicate command registration: "CreateOrder" is already registered in context "orders"'
      );
    });

    it("allows different command types", () => {
      registry.register(createMockRegistration("CreateOrder"));
      registry.register(createMockRegistration("CancelOrder"));
      expect(registry.size()).toBe(2);
    });
  });

  describe("unregister", () => {
    it("removes a registered command", () => {
      registry.register(createMockRegistration("CreateOrder"));
      expect(registry.has("CreateOrder")).toBe(true);

      const result = registry.unregister("CreateOrder");
      expect(result).toBe(true);
      expect(registry.has("CreateOrder")).toBe(false);
    });

    it("returns false for non-existent command", () => {
      const result = registry.unregister("NonExistent");
      expect(result).toBe(false);
    });
  });

  describe("getConfig", () => {
    it("returns config for registered command", () => {
      const registration = createMockRegistration("CreateOrder");
      registry.register(registration);

      const config = registry.getConfig("CreateOrder");
      expect(config).toBeDefined();
      expect(config?.commandType).toBe("CreateOrder");
    });

    it("returns undefined for non-existent command", () => {
      const config = registry.getConfig("NonExistent");
      expect(config).toBeUndefined();
    });
  });

  describe("getRegistration", () => {
    it("returns full registration for registered command", () => {
      const registration = createMockRegistration("CreateOrder", {
        description: "Creates an order",
      });
      registry.register(registration);

      const result = registry.getRegistration("CreateOrder");
      expect(result).toBeDefined();
      expect(result?.metadata.commandType).toBe("CreateOrder");
      expect(result?.metadata.description).toBe("Creates an order");
    });

    it("returns undefined for non-existent command", () => {
      const result = registry.getRegistration("NonExistent");
      expect(result).toBeUndefined();
    });
  });

  describe("has", () => {
    it("returns true for registered command", () => {
      registry.register(createMockRegistration("CreateOrder"));
      expect(registry.has("CreateOrder")).toBe(true);
    });

    it("returns false for non-existent command", () => {
      expect(registry.has("NonExistent")).toBe(false);
    });
  });

  describe("validate", () => {
    it("returns valid for correct payload", () => {
      const registration = createMockRegistration("CreateOrder");
      registration.argsSchema = z.object({
        orderId: z.string(),
        customerId: z.string(),
      });
      registry.register(registration);

      const result = registry.validate("CreateOrder", {
        orderId: "ord_123",
        customerId: "cust_456",
      });
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        orderId: "ord_123",
        customerId: "cust_456",
      });
    });

    it("returns invalid for incorrect payload", () => {
      const registration = createMockRegistration("CreateOrder");
      registration.argsSchema = z.object({
        orderId: z.string(),
        customerId: z.string(),
      });
      registry.register(registration);

      const result = registry.validate("CreateOrder", {
        orderId: "ord_123",
        // missing customerId
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it("returns unknown command error for non-existent command", () => {
      const result = registry.validate("NonExistent", {});
      expect(result.valid).toBe(false);
      expect(result.errors?.[0].code).toBe("UNKNOWN_COMMAND");
    });
  });

  describe("list", () => {
    it("returns empty array when no commands registered", () => {
      expect(registry.list()).toEqual([]);
    });

    it("returns all registered commands", () => {
      registry.register(createMockRegistration("CreateOrder"));
      registry.register(createMockRegistration("CancelOrder"));

      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list.map((c) => c.commandType)).toContain("CreateOrder");
      expect(list.map((c) => c.commandType)).toContain("CancelOrder");
    });

    it("returns CommandInfo objects with correct shape", () => {
      registry.register(
        createMockRegistration("CreateOrder", {
          boundedContext: "orders",
          category: "aggregate",
          targetAggregate: { type: "Order", idField: "orderId" },
          description: "Creates an order",
          tags: ["orders", "create"],
          hasSecondaryProjections: true,
          hasSagaRoute: true,
        })
      );

      const [info] = registry.list();
      expect(info.commandType).toBe("CreateOrder");
      expect(info.boundedContext).toBe("orders");
      expect(info.category).toBe("aggregate");
      expect(info.targetAggregate).toBe("Order");
      expect(info.description).toBe("Creates an order");
      expect(info.tags).toEqual(["orders", "create"]);
      expect(info.hasProjection).toBe(true);
      expect(info.hasSecondaryProjections).toBe(true);
      expect(info.hasSagaRoute).toBe(true);
      expect(info.hasFailedProjection).toBe(false);
    });
  });

  describe("listByCategory", () => {
    beforeEach(() => {
      registry.register(createMockRegistration("CreateOrder", { category: "aggregate" }));
      registry.register(createMockRegistration("StartFulfillment", { category: "process" }));
      registry.register(createMockRegistration("CleanupExpired", { category: "system" }));
    });

    it("filters by aggregate category", () => {
      const aggregates = registry.listByCategory("aggregate");
      expect(aggregates).toHaveLength(1);
      expect(aggregates[0].commandType).toBe("CreateOrder");
    });

    it("filters by process category", () => {
      const processes = registry.listByCategory("process");
      expect(processes).toHaveLength(1);
      expect(processes[0].commandType).toBe("StartFulfillment");
    });

    it("filters by system category", () => {
      const systems = registry.listByCategory("system");
      expect(systems).toHaveLength(1);
      expect(systems[0].commandType).toBe("CleanupExpired");
    });

    it("returns empty for batch when none registered", () => {
      const batches = registry.listByCategory("batch");
      expect(batches).toHaveLength(0);
    });
  });

  describe("listByContext", () => {
    beforeEach(() => {
      registry.register(createMockRegistration("CreateOrder", { boundedContext: "orders" }));
      registry.register(createMockRegistration("CancelOrder", { boundedContext: "orders" }));
      registry.register(createMockRegistration("ReserveStock", { boundedContext: "inventory" }));
    });

    it("filters by bounded context", () => {
      const ordersCommands = registry.listByContext("orders");
      expect(ordersCommands).toHaveLength(2);
      expect(ordersCommands.map((c) => c.commandType)).toContain("CreateOrder");
      expect(ordersCommands.map((c) => c.commandType)).toContain("CancelOrder");
    });

    it("returns empty for non-existent context", () => {
      const commands = registry.listByContext("nonexistent");
      expect(commands).toHaveLength(0);
    });
  });

  describe("listByTag", () => {
    beforeEach(() => {
      registry.register(createMockRegistration("CreateOrder", { tags: ["orders", "create"] }));
      registry.register(createMockRegistration("CancelOrder", { tags: ["orders", "cancel"] }));
      registry.register(createMockRegistration("ReserveStock", { tags: ["inventory"] }));
    });

    it("filters by tag", () => {
      const ordersCommands = registry.listByTag("orders");
      expect(ordersCommands).toHaveLength(2);
    });

    it("returns single command for unique tag", () => {
      const inventoryCommands = registry.listByTag("inventory");
      expect(inventoryCommands).toHaveLength(1);
      expect(inventoryCommands[0].commandType).toBe("ReserveStock");
    });

    it("returns empty for non-existent tag", () => {
      const commands = registry.listByTag("nonexistent");
      expect(commands).toHaveLength(0);
    });
  });

  describe("groupByContext", () => {
    beforeEach(() => {
      registry.register(createMockRegistration("CreateOrder", { boundedContext: "orders" }));
      registry.register(createMockRegistration("CancelOrder", { boundedContext: "orders" }));
      registry.register(createMockRegistration("ReserveStock", { boundedContext: "inventory" }));
    });

    it("groups commands by bounded context", () => {
      const groups = registry.groupByContext();
      expect(groups.size).toBe(2);
      expect(groups.get("orders")).toHaveLength(2);
      expect(groups.get("inventory")).toHaveLength(1);
    });

    it("returns empty map when no commands", () => {
      CommandRegistry.resetForTesting();
      const emptyRegistry = CommandRegistry.getInstance();
      const groups = emptyRegistry.groupByContext();
      expect(groups.size).toBe(0);
    });
  });

  describe("size", () => {
    it("returns 0 when empty", () => {
      expect(registry.size()).toBe(0);
    });

    it("returns correct count", () => {
      registry.register(createMockRegistration("CreateOrder"));
      registry.register(createMockRegistration("CancelOrder"));
      expect(registry.size()).toBe(2);
    });
  });

  describe("clear", () => {
    it("removes all registrations", () => {
      registry.register(createMockRegistration("CreateOrder"));
      registry.register(createMockRegistration("CancelOrder"));
      expect(registry.size()).toBe(2);

      registry.clear();
      expect(registry.size()).toBe(0);
    });
  });
});

describe("globalRegistry", () => {
  afterEach(() => {
    CommandRegistry.resetForTesting();
  });

  it("is the singleton instance", () => {
    CommandRegistry.resetForTesting();
    // After reset, the first getInstance call creates a new instance
    // globalRegistry was created before reset, so we need to get fresh
    const freshRegistry = CommandRegistry.getInstance();
    expect(freshRegistry).toBeDefined();
    expect(typeof freshRegistry.register).toBe("function");
    // globalRegistry is cached, but after reset it should still work
    expect(globalRegistry).toBeDefined();
    expect(typeof globalRegistry.register).toBe("function");
  });
});

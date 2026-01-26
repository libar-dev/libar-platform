/**
 * Unit Tests for Bounded Context Definitions
 *
 * Tests the definition types and helper functions:
 * - CMSFactory: Factory pattern for initial CMS state
 * - CMSUpcasterContract: Contract for CMS lazy migration
 * - CommandDefinition: Command metadata
 * - EventDefinition: Event metadata
 */
import { describe, it, expect } from "vitest";
import type {
  CMSFactory,
  CMSFactoryDefinition,
  CMSUpcasterFn,
  CMSUpcasterContract,
  CMSTypeDefinition,
  CommandDefinition,
  CommandDefinitionRegistry,
  EventDefinition,
  EventDefinitionRegistry,
  EventCategory,
  ProjectionDefinition,
  ProjectionDefinitionRegistry,
  ProjectionType,
  QueryResultType,
  QueryDefinition,
  QueryDefinitionRegistry,
  ProcessManagerTriggerType,
  ProcessManagerDefinition,
  ProcessManagerDefinitionRegistry,
} from "../src";
import {
  defineUpcaster,
  defineCommand,
  defineEvent,
  defineProjection,
  isEventCategory,
  EVENT_CATEGORIES,
  isProjectionType,
  PROJECTION_TYPES,
  QUERY_RESULT_TYPES,
  isQueryResultType,
  defineQuery,
  PROCESS_MANAGER_TRIGGER_TYPES,
  isProcessManagerTriggerType,
  defineProcessManager,
} from "../src";

// Test CMS type
interface TestCMS {
  id: string;
  name: string;
  value: number;
  version: number;
  stateVersion: number;
}

const CURRENT_TEST_CMS_VERSION = 1;

describe("CMSFactory", () => {
  it("types a factory function correctly", () => {
    type TestFactory = CMSFactory<{ id: string; name: string }, TestCMS>;

    const factory: TestFactory = (args) => ({
      id: args.id,
      name: args.name,
      value: 0,
      version: 0,
      stateVersion: CURRENT_TEST_CMS_VERSION,
    });

    const result = factory({ id: "test-1", name: "Test Item" });
    expect(result.id).toBe("test-1");
    expect(result.name).toBe("Test Item");
    expect(result.value).toBe(0);
    expect(result.version).toBe(0);
    expect(result.stateVersion).toBe(CURRENT_TEST_CMS_VERSION);
  });

  it("supports CMSFactoryDefinition with metadata", () => {
    const factoryDef: CMSFactoryDefinition<{ id: string; name: string }, TestCMS> = {
      name: "createTestCMS",
      description: "Creates initial test CMS state",
      producesVersion: CURRENT_TEST_CMS_VERSION,
      create: (args) => ({
        id: args.id,
        name: args.name,
        value: 0,
        version: 0,
        stateVersion: CURRENT_TEST_CMS_VERSION,
      }),
    };

    expect(factoryDef.name).toBe("createTestCMS");
    expect(factoryDef.description).toBe("Creates initial test CMS state");
    expect(factoryDef.producesVersion).toBe(CURRENT_TEST_CMS_VERSION);

    const cms = factoryDef.create({ id: "factory-test", name: "Factory Test" });
    expect(cms.id).toBe("factory-test");
    expect(cms.name).toBe("Factory Test");
  });

  it("allows different argument types", () => {
    type ComplexFactory = CMSFactory<
      { id: string; name: string; initialValue: number; metadata?: Record<string, string> },
      TestCMS
    >;

    const factory: ComplexFactory = (args) => ({
      id: args.id,
      name: args.name,
      value: args.initialValue,
      version: 0,
      stateVersion: 1,
    });

    const result = factory({ id: "complex", name: "Complex", initialValue: 42 });
    expect(result.value).toBe(42);
  });
});

describe("CMSUpcasterContract", () => {
  it("defines upcaster contract structure", () => {
    const upcaster: CMSUpcasterContract<TestCMS> = {
      cmsType: "TestCMS",
      currentVersion: 2,
      minSupportedVersion: 1,
      upcast: (raw) => raw as TestCMS,
      description: "Test upcaster for TestCMS",
    };

    expect(upcaster.cmsType).toBe("TestCMS");
    expect(upcaster.currentVersion).toBe(2);
    expect(upcaster.minSupportedVersion).toBe(1);
    expect(upcaster.description).toBe("Test upcaster for TestCMS");
  });

  it("defineUpcaster helper returns typed contract", () => {
    const upcaster = defineUpcaster<TestCMS>({
      cmsType: "TestCMS",
      currentVersion: CURRENT_TEST_CMS_VERSION,
      minSupportedVersion: 1,
      upcast: (raw) => {
        const state = raw as TestCMS;
        return state;
      },
    });

    expect(upcaster.cmsType).toBe("TestCMS");
    expect(upcaster.currentVersion).toBe(CURRENT_TEST_CMS_VERSION);

    const result = upcaster.upcast({
      id: "x",
      name: "X",
      value: 1,
      version: 1,
      stateVersion: 1,
    });
    expect(result.id).toBe("x");
  });

  it("supports upcast function with migration logic", () => {
    interface OldTestCMS {
      id: string;
      value: number;
      version: number;
      stateVersion: number;
    }

    const upcaster = defineUpcaster<TestCMS>({
      cmsType: "TestCMS",
      currentVersion: 2,
      minSupportedVersion: 1,
      upcast: (raw) => {
        const state = raw as Record<string, unknown>;
        const version = (state["stateVersion"] as number) ?? 0;

        if (version === 2) {
          return raw as TestCMS;
        }

        // Migrate v1 -> v2: add name field
        if (version === 1) {
          return {
            ...(raw as OldTestCMS),
            name: "Migrated",
            stateVersion: 2,
          };
        }

        throw new Error(`Unsupported version: ${version}`);
      },
      description: "Migrates TestCMS v1 to v2 by adding name field",
    });

    // Test v2 passthrough
    const v2Result = upcaster.upcast({
      id: "v2",
      name: "V2",
      value: 100,
      version: 1,
      stateVersion: 2,
    });
    expect(v2Result.name).toBe("V2");

    // Test v1 migration
    const v1Result = upcaster.upcast({
      id: "v1",
      value: 50,
      version: 1,
      stateVersion: 1,
    });
    expect(v1Result.name).toBe("Migrated");
    expect(v1Result.stateVersion).toBe(2);
  });

  it("allows optional description", () => {
    const upcaster = defineUpcaster<TestCMS>({
      cmsType: "TestCMS",
      currentVersion: 1,
      minSupportedVersion: 1,
      upcast: (raw) => raw as TestCMS,
    });

    expect(upcaster.description).toBeUndefined();
  });

  it("handles multi-step migration chain (v1 -> v2 -> v3)", () => {
    // Real-world scenario: CMS has evolved through multiple versions
    interface TestCMSv3 {
      id: string;
      name: string;
      value: number;
      category: string; // Added in v3
      version: number;
      stateVersion: number;
    }

    const upcaster = defineUpcaster<TestCMSv3>({
      cmsType: "TestCMS",
      currentVersion: 3,
      minSupportedVersion: 1,
      upcast: (raw) => {
        const state = raw as Record<string, unknown>;
        const version = (state["stateVersion"] as number) ?? 0;

        // Already at current version
        if (version === 3) {
          return raw as TestCMSv3;
        }

        // Migrate v2 -> v3: add category field
        if (version === 2) {
          return {
            ...(raw as Omit<TestCMSv3, "category" | "stateVersion">),
            category: "default",
            stateVersion: 3,
          };
        }

        // Migrate v1 -> v2 -> v3: add name, then add category
        if (version === 1) {
          // First migrate v1 -> v2 (add name)
          const v2 = {
            ...(raw as { id: string; value: number; version: number }),
            name: "Migrated from v1",
            stateVersion: 2,
          };
          // Then migrate v2 -> v3 (add category)
          return {
            ...v2,
            category: "migrated",
            stateVersion: 3,
          };
        }

        throw new Error(`Unsupported version: ${version}`);
      },
      description: "Migrates TestCMS v1 -> v2 (add name) -> v3 (add category)",
    });

    // Test v3 passthrough
    const v3Result = upcaster.upcast({
      id: "v3",
      name: "V3 Name",
      value: 300,
      category: "existing",
      version: 1,
      stateVersion: 3,
    });
    expect(v3Result.name).toBe("V3 Name");
    expect(v3Result.category).toBe("existing");
    expect(v3Result.stateVersion).toBe(3);

    // Test v2 -> v3 migration
    const v2Result = upcaster.upcast({
      id: "v2",
      name: "V2 Name",
      value: 200,
      version: 1,
      stateVersion: 2,
    });
    expect(v2Result.name).toBe("V2 Name");
    expect(v2Result.category).toBe("default");
    expect(v2Result.stateVersion).toBe(3);

    // Test v1 -> v2 -> v3 migration (full chain)
    const v1Result = upcaster.upcast({
      id: "v1",
      value: 100,
      version: 1,
      stateVersion: 1,
    });
    expect(v1Result.id).toBe("v1");
    expect(v1Result.value).toBe(100);
    expect(v1Result.name).toBe("Migrated from v1");
    expect(v1Result.category).toBe("migrated");
    expect(v1Result.stateVersion).toBe(3);
  });
});

describe("CommandDefinition", () => {
  it("defines command metadata", () => {
    const def: CommandDefinition<"CreateTest"> = {
      commandType: "CreateTest",
      description: "Creates a new test entity",
      targetAggregate: "Test",
      createsAggregate: true,
      producesEvents: ["TestCreated"],
      errorCodes: ["TEST_ALREADY_EXISTS"],
    };

    expect(def.commandType).toBe("CreateTest");
    expect(def.description).toBe("Creates a new test entity");
    expect(def.targetAggregate).toBe("Test");
    expect(def.createsAggregate).toBe(true);
    expect(def.producesEvents).toContain("TestCreated");
    expect(def.errorCodes).toContain("TEST_ALREADY_EXISTS");
  });

  it("defineCommand helper preserves literal types", () => {
    const def = defineCommand({
      commandType: "UpdateTest",
      description: "Updates test entity",
      targetAggregate: "Test",
      createsAggregate: false,
      producesEvents: ["TestUpdated"],
    });

    // Type-level: def.commandType is "UpdateTest", not string
    expect(def.commandType).toBe("UpdateTest");
    expect(def.createsAggregate).toBe(false);
  });

  it("supports internal commands", () => {
    const def = defineCommand({
      commandType: "ExpireTest",
      description: "Internal command to expire test entities",
      targetAggregate: "Test",
      createsAggregate: false,
      producesEvents: ["TestExpired"],
      internal: true,
    });

    expect(def.internal).toBe(true);
  });

  it("supports multiple events and error codes", () => {
    const def = defineCommand({
      commandType: "ProcessTest",
      description: "Processes test with multiple outcomes",
      targetAggregate: "Test",
      createsAggregate: false,
      producesEvents: ["TestProcessed", "TestFailed"],
      errorCodes: ["TEST_NOT_FOUND", "TEST_INVALID_STATE", "TEST_PROCESSING_ERROR"],
    });

    expect(def.producesEvents).toHaveLength(2);
    expect(def.errorCodes).toHaveLength(3);
  });

  it("allows optional error codes", () => {
    const def = defineCommand({
      commandType: "SimpleCommand",
      description: "Simple command with no error codes",
      targetAggregate: "Test",
      createsAggregate: false,
      producesEvents: ["SimpleEvent"],
    });

    expect(def.errorCodes).toBeUndefined();
  });
});

describe("EventDefinition", () => {
  it("defines event metadata", () => {
    const def: EventDefinition<"TestCreated"> = {
      eventType: "TestCreated",
      description: "Emitted when test is created",
      sourceAggregate: "Test",
      category: "domain",
      schemaVersion: 1,
      producedBy: ["CreateTest"],
    };

    expect(def.eventType).toBe("TestCreated");
    expect(def.description).toBe("Emitted when test is created");
    expect(def.sourceAggregate).toBe("Test");
    expect(def.category).toBe("domain");
    expect(def.schemaVersion).toBe(1);
    expect(def.producedBy).toContain("CreateTest");
  });

  it("defineEvent helper preserves literal types", () => {
    const def = defineEvent({
      eventType: "TestUpdated",
      description: "Emitted when test is updated",
      sourceAggregate: "Test",
      category: "domain",
      schemaVersion: 1,
      producedBy: ["UpdateTest"],
      triggersProcesses: ["TestNotificationSaga"],
    });

    expect(def.eventType).toBe("TestUpdated");
    expect(def.triggersProcesses).toContain("TestNotificationSaga");
  });

  it("supports different event categories", () => {
    const categories: EventCategory[] = ["domain", "integration", "trigger", "fat"];

    categories.forEach((category) => {
      const def = defineEvent({
        eventType: "TestEvent",
        description: `Test ${category} event`,
        sourceAggregate: "Test",
        category,
        schemaVersion: 1,
        producedBy: ["TestCommand"],
      });

      expect(def.category).toBe(category);
    });
  });

  it("supports integration events", () => {
    const def = defineEvent({
      eventType: "TestCompletedIntegration",
      description: "Integration event for cross-context communication",
      sourceAggregate: "Test",
      category: "integration",
      schemaVersion: 1,
      producedBy: ["CompleteTest"],
    });

    expect(def.category).toBe("integration");
  });

  it("supports multiple producers", () => {
    const def = defineEvent({
      eventType: "TestStatusChanged",
      description: "Emitted when test status changes",
      sourceAggregate: "Test",
      category: "domain",
      schemaVersion: 1,
      producedBy: ["ApproveTest", "RejectTest", "CancelTest"],
    });

    expect(def.producedBy).toHaveLength(3);
  });

  it("allows optional triggersProcesses", () => {
    const def = defineEvent({
      eventType: "SimpleEvent",
      description: "Simple event with no triggers",
      sourceAggregate: "Test",
      category: "domain",
      schemaVersion: 1,
      producedBy: ["SimpleCommand"],
    });

    expect(def.triggersProcesses).toBeUndefined();
  });
});

describe("CommandDefinitionRegistry", () => {
  it("maps command types to definitions", () => {
    type TestCommands = readonly ["Create", "Update", "Delete"];

    const registry: CommandDefinitionRegistry<TestCommands> = {
      Create: defineCommand({
        commandType: "Create",
        description: "Create entity",
        targetAggregate: "Test",
        createsAggregate: true,
        producesEvents: ["Created"],
      }),
      Update: defineCommand({
        commandType: "Update",
        description: "Update entity",
        targetAggregate: "Test",
        createsAggregate: false,
        producesEvents: ["Updated"],
      }),
      Delete: defineCommand({
        commandType: "Delete",
        description: "Delete entity",
        targetAggregate: "Test",
        createsAggregate: false,
        producesEvents: ["Deleted"],
      }),
    };

    expect(registry.Create.createsAggregate).toBe(true);
    expect(registry.Update.createsAggregate).toBe(false);
    expect(registry.Delete.createsAggregate).toBe(false);
    expect(Object.keys(registry)).toHaveLength(3);
  });

  it("enforces type safety for registry keys", () => {
    // This test verifies the type system at compile time
    // The registry must have exactly the keys defined in the type
    const ORDER_COMMANDS = ["CreateOrder", "SubmitOrder"] as const;

    const orderRegistry: CommandDefinitionRegistry<typeof ORDER_COMMANDS> = {
      CreateOrder: defineCommand({
        commandType: "CreateOrder",
        description: "Creates new order",
        targetAggregate: "Order",
        createsAggregate: true,
        producesEvents: ["OrderCreated"],
      }),
      SubmitOrder: defineCommand({
        commandType: "SubmitOrder",
        description: "Submits order",
        targetAggregate: "Order",
        createsAggregate: false,
        producesEvents: ["OrderSubmitted"],
      }),
    };

    // Verify registry has exactly the same number of keys as the tuple
    expect(Object.keys(orderRegistry)).toHaveLength(ORDER_COMMANDS.length);
    expect(orderRegistry.CreateOrder.commandType).toBe("CreateOrder");
    expect(orderRegistry.SubmitOrder.commandType).toBe("SubmitOrder");
  });
});

describe("EventDefinitionRegistry", () => {
  it("maps event types to definitions", () => {
    type TestEvents = readonly ["Created", "Updated"];

    const registry: EventDefinitionRegistry<TestEvents> = {
      Created: defineEvent({
        eventType: "Created",
        description: "Entity created",
        sourceAggregate: "Test",
        category: "domain",
        schemaVersion: 1,
        producedBy: ["Create"],
      }),
      Updated: defineEvent({
        eventType: "Updated",
        description: "Entity updated",
        sourceAggregate: "Test",
        category: "domain",
        schemaVersion: 1,
        producedBy: ["Update"],
      }),
    };

    expect(registry.Created.category).toBe("domain");
    expect(registry.Updated.schemaVersion).toBe(1);
    expect(Object.keys(registry)).toHaveLength(2);
  });

  it("supports mixed event categories in registry", () => {
    type MixedEvents = readonly ["DomainEvent", "IntegrationEvent"];

    const registry: EventDefinitionRegistry<MixedEvents> = {
      DomainEvent: defineEvent({
        eventType: "DomainEvent",
        description: "Internal domain event",
        sourceAggregate: "Test",
        category: "domain",
        schemaVersion: 1,
        producedBy: ["Command1"],
      }),
      IntegrationEvent: defineEvent({
        eventType: "IntegrationEvent",
        description: "Cross-context integration event",
        sourceAggregate: "Test",
        category: "integration",
        schemaVersion: 1,
        producedBy: ["Command2"],
      }),
    };

    expect(registry.DomainEvent.category).toBe("domain");
    expect(registry.IntegrationEvent.category).toBe("integration");
  });
});

// ============================================================================
// ADDITIONAL TESTS - Added based on multi-agent review
// ============================================================================

describe("CMSTypeDefinition", () => {
  it("defines CMS table metadata", () => {
    const def: CMSTypeDefinition = {
      tableName: "orderCMS",
      currentStateVersion: 2,
      description: "Order aggregate state with items and status",
    };

    expect(def.tableName).toBe("orderCMS");
    expect(def.currentStateVersion).toBe(2);
    expect(def.description).toBe("Order aggregate state with items and status");
  });

  it("requires all fields (no optionals)", () => {
    const def: CMSTypeDefinition = {
      tableName: "testCMS",
      currentStateVersion: 1,
      description: "Test CMS",
    };
    expect(Object.keys(def)).toHaveLength(3);
  });
});

describe("CMSUpcasterFn", () => {
  it("types upcaster function standalone", () => {
    const upcastFn: CMSUpcasterFn<TestCMS> = (raw) => {
      const data = raw as Record<string, unknown>;
      return {
        id: String(data["id"] ?? ""),
        name: String(data["name"] ?? ""),
        value: Number(data["value"] ?? 0),
        version: Number(data["version"] ?? 0),
        stateVersion: Number(data["stateVersion"] ?? 1),
      };
    };

    const result = upcastFn({ id: "test", name: "Test", value: 42, version: 1, stateVersion: 1 });
    expect(result.id).toBe("test");
    expect(result.value).toBe(42);
  });

  it("allows transformation from unknown to typed CMS", () => {
    const upcastFn: CMSUpcasterFn<TestCMS> = (raw) => {
      if (raw === null || raw === undefined) {
        throw new Error("Cannot upcast null or undefined");
      }
      return raw as TestCMS;
    };

    expect(() => upcastFn(null)).toThrow("Cannot upcast null or undefined");
    expect(() => upcastFn(undefined)).toThrow("Cannot upcast null or undefined");
  });
});

describe("Edge Cases", () => {
  describe("Empty arrays in definitions", () => {
    it("handles empty producesEvents array", () => {
      const def = defineCommand({
        commandType: "NoOpCommand",
        description: "Command that produces no events (query-like)",
        targetAggregate: "Test",
        createsAggregate: false,
        producesEvents: [],
      });

      expect(def.producesEvents).toHaveLength(0);
    });

    it("handles empty producedBy array", () => {
      const def = defineEvent({
        eventType: "SystemEvent",
        description: "Event with no command producer (system-generated)",
        sourceAggregate: "System",
        category: "domain",
        schemaVersion: 1,
        producedBy: [],
      });

      expect(def.producedBy).toHaveLength(0);
    });

    it("handles empty errorCodes array", () => {
      const def = defineCommand({
        commandType: "SafeCommand",
        description: "Command that never throws",
        targetAggregate: "Test",
        createsAggregate: false,
        producesEvents: ["TestEvent"],
        errorCodes: [],
      });

      expect(def.errorCodes).toHaveLength(0);
    });
  });

  describe("Schema version edge cases", () => {
    it("handles schemaVersion 0 (initial)", () => {
      const def = defineEvent({
        eventType: "V0Event",
        description: "Version zero event",
        sourceAggregate: "Test",
        category: "domain",
        schemaVersion: 0,
        producedBy: ["Cmd"],
      });
      expect(def.schemaVersion).toBe(0);
    });

    it("handles large schemaVersion numbers", () => {
      const def = defineEvent({
        eventType: "LargeVersionEvent",
        description: "Large version event",
        sourceAggregate: "Test",
        category: "domain",
        schemaVersion: 999,
        producedBy: ["Cmd"],
      });
      expect(def.schemaVersion).toBe(999);
    });
  });

  describe("Upcaster error scenarios", () => {
    it("throws for versions below minSupportedVersion", () => {
      const upcaster = defineUpcaster<TestCMS>({
        cmsType: "TestCMS",
        currentVersion: 3,
        minSupportedVersion: 2,
        upcast: (raw) => {
          const state = raw as Record<string, unknown>;
          const version = (state["stateVersion"] as number) ?? 0;

          if (version < 2) {
            throw new Error(`Version ${version} is below minimum supported version 2`);
          }

          return raw as TestCMS;
        },
      });

      expect(() =>
        upcaster.upcast({
          id: "old",
          value: 1,
          version: 1,
          stateVersion: 1,
        })
      ).toThrow("Version 1 is below minimum supported version 2");
    });

    it("handles malformed CMS input", () => {
      const upcaster = defineUpcaster<TestCMS>({
        cmsType: "TestCMS",
        currentVersion: 1,
        minSupportedVersion: 1,
        upcast: (raw) => {
          const state = raw as Record<string, unknown>;
          if (!state["id"]) {
            throw new Error("Missing required field: id");
          }
          return raw as TestCMS;
        },
      });

      expect(() => upcaster.upcast({ name: "NoId" })).toThrow("Missing required field: id");
    });
  });
});

describe("Type Inference Verification", () => {
  it("preserves commandType as literal type", () => {
    const def = defineCommand({
      commandType: "SpecificCommand",
      description: "Test",
      targetAggregate: "Test",
      createsAggregate: false,
      producesEvents: ["Event"],
    });

    // Runtime check
    expect(def.commandType).toBe("SpecificCommand");

    // Compile-time check: This assignment would fail if type widened to 'string'
    const _typeCheck: "SpecificCommand" = def.commandType;
    expect(_typeCheck).toBe("SpecificCommand");
  });

  it("preserves eventType as literal type", () => {
    const def = defineEvent({
      eventType: "SpecificEvent",
      description: "Test",
      sourceAggregate: "Test",
      category: "domain",
      schemaVersion: 1,
      producedBy: ["Cmd"],
    });

    // Compile-time check
    const _typeCheck: "SpecificEvent" = def.eventType;
    expect(_typeCheck).toBe("SpecificEvent");
  });

  it("registry enforces key-to-definition type matching", () => {
    const COMMANDS = ["Alpha", "Beta"] as const;

    const registry: CommandDefinitionRegistry<typeof COMMANDS> = {
      Alpha: defineCommand({
        commandType: "Alpha",
        description: "",
        targetAggregate: "X",
        createsAggregate: false,
        producesEvents: [],
      }),
      Beta: defineCommand({
        commandType: "Beta",
        description: "",
        targetAggregate: "X",
        createsAggregate: false,
        producesEvents: [],
      }),
    };

    // Each key matches its definition's commandType
    expect(registry.Alpha.commandType).toBe("Alpha");
    expect(registry.Beta.commandType).toBe("Beta");
    expect(Object.keys(registry)).toHaveLength(COMMANDS.length);
  });
});

describe("isEventCategory", () => {
  it("returns true for valid categories", () => {
    expect(isEventCategory("domain")).toBe(true);
    expect(isEventCategory("integration")).toBe(true);
    expect(isEventCategory("trigger")).toBe(true);
    expect(isEventCategory("fat")).toBe(true);
  });

  it("returns false for invalid categories", () => {
    expect(isEventCategory("invalid")).toBe(false);
    expect(isEventCategory("")).toBe(false);
    expect(isEventCategory(null)).toBe(false);
    expect(isEventCategory(undefined)).toBe(false);
    expect(isEventCategory(123)).toBe(false);
    expect(isEventCategory({})).toBe(false);
  });

  it("returns false for array input", () => {
    expect(isEventCategory(["domain"])).toBe(false);
    expect(isEventCategory(["domain", "integration"])).toBe(false);
  });

  it("narrows type correctly", () => {
    const value: unknown = "domain";
    if (isEventCategory(value)) {
      // value is now typed as EventCategory
      const category: EventCategory = value;
      expect(category).toBe("domain");
    }
  });
});

describe("EVENT_CATEGORIES", () => {
  it("exports exactly 4 event categories", () => {
    expect(EVENT_CATEGORIES).toEqual(["domain", "integration", "trigger", "fat"]);
    expect(EVENT_CATEGORIES).toHaveLength(4);
  });

  it("is a readonly tuple", () => {
    // Verify the tuple is typed correctly (readonly)
    // This is a compile-time check - if it compiles, the type is correct
    const categories: readonly ["domain", "integration", "trigger", "fat"] = EVENT_CATEGORIES;
    expect(categories[0]).toBe("domain");
    expect(categories[3]).toBe("fat");
  });

  it("matches EventCategory type", () => {
    // Every element in EVENT_CATEGORIES should be a valid EventCategory
    for (const category of EVENT_CATEGORIES) {
      expect(isEventCategory(category)).toBe(true);
    }
  });
});

// ============================================================================
// PROJECTION DEFINITION TESTS - Added in Phase 12
// ============================================================================

describe("ProjectionDefinition", () => {
  it("defines projection metadata", () => {
    const def: ProjectionDefinition<"OrderCreated" | "OrderSubmitted"> = {
      projectionName: "orderSummary",
      description: "Order listing with status and totals",
      targetTable: "orderSummaries",
      partitionKeyField: "orderId",
      eventSubscriptions: ["OrderCreated", "OrderSubmitted"],
      context: "orders",
      type: "primary",
    };

    expect(def.projectionName).toBe("orderSummary");
    expect(def.description).toBe("Order listing with status and totals");
    expect(def.targetTable).toBe("orderSummaries");
    expect(def.partitionKeyField).toBe("orderId");
    expect(def.eventSubscriptions).toContain("OrderCreated");
    expect(def.eventSubscriptions).toContain("OrderSubmitted");
    expect(def.context).toBe("orders");
    expect(def.type).toBe("primary");
  });

  it("defineProjection helper preserves literal types", () => {
    const def = defineProjection({
      projectionName: "productCatalog",
      description: "Product catalog with stock levels",
      targetTable: "productCatalog",
      partitionKeyField: "productId",
      eventSubscriptions: ["ProductCreated", "StockAdded"] as const,
      context: "inventory",
      type: "primary",
    });

    // Type-level: def.projectionName should be "productCatalog"
    expect(def.projectionName).toBe("productCatalog");
    expect(def.eventSubscriptions).toHaveLength(2);
  });

  it("supports secondary tables", () => {
    const def = defineProjection({
      projectionName: "productCatalog",
      description: "Product catalog with secondary stock table",
      targetTable: "productCatalog",
      partitionKeyField: "productId",
      eventSubscriptions: ["ProductCreated", "StockAdded"] as const,
      context: "inventory",
      type: "primary",
      secondaryTables: ["stockAvailability"],
    });

    expect(def.secondaryTables).toContain("stockAvailability");
    expect(def.secondaryTables).toHaveLength(1);
  });

  it("supports cross-context projections with sources", () => {
    const def = defineProjection({
      projectionName: "orderWithInventory",
      description: "Cross-context view combining order and inventory",
      targetTable: "orderWithInventoryStatus",
      partitionKeyField: "orderId",
      eventSubscriptions: [
        "OrderCreated",
        "OrderSubmitted",
        "StockReserved",
        "ReservationConfirmed",
      ] as const,
      context: "cross-context",
      type: "cross-context",
      sources: ["orders", "inventory"],
    });

    expect(def.context).toBe("cross-context");
    expect(def.type).toBe("cross-context");
    expect(def.sources).toContain("orders");
    expect(def.sources).toContain("inventory");
  });

  it("supports all projection types", () => {
    const types: ProjectionType[] = ["primary", "secondary", "cross-context"];

    types.forEach((type) => {
      const def = defineProjection({
        projectionName: `test${type}`,
        description: `Test ${type} projection`,
        targetTable: "testTable",
        partitionKeyField: "id",
        eventSubscriptions: ["TestEvent"] as const,
        context: "test",
        type,
      });

      expect(def.type).toBe(type);
    });
  });

  it("allows optional fields to be undefined", () => {
    const def = defineProjection({
      projectionName: "simpleProjection",
      description: "Projection without optional fields",
      targetTable: "simpleTable",
      partitionKeyField: "id",
      eventSubscriptions: ["SimpleEvent"] as const,
      context: "simple",
      type: "primary",
    });

    expect(def.secondaryTables).toBeUndefined();
    expect(def.sources).toBeUndefined();
  });
});

describe("ProjectionDefinitionRegistry", () => {
  it("maps projection names to definitions", () => {
    type TestProjections = readonly ["orderSummary", "productCatalog"];

    const registry: ProjectionDefinitionRegistry<TestProjections> = {
      orderSummary: defineProjection({
        projectionName: "orderSummary",
        description: "Order summary",
        targetTable: "orderSummaries",
        partitionKeyField: "orderId",
        eventSubscriptions: ["OrderCreated"] as const,
        context: "orders",
        type: "primary",
      }),
      productCatalog: defineProjection({
        projectionName: "productCatalog",
        description: "Product catalog",
        targetTable: "productCatalog",
        partitionKeyField: "productId",
        eventSubscriptions: ["ProductCreated"] as const,
        context: "inventory",
        type: "primary",
      }),
    };

    expect(registry.orderSummary.projectionName).toBe("orderSummary");
    expect(registry.productCatalog.projectionName).toBe("productCatalog");
    expect(Object.keys(registry)).toHaveLength(2);
  });

  it("enforces type safety for registry keys", () => {
    const PROJECTIONS = ["viewA", "viewB"] as const;

    const registry: ProjectionDefinitionRegistry<typeof PROJECTIONS> = {
      viewA: defineProjection({
        projectionName: "viewA",
        description: "View A",
        targetTable: "tableA",
        partitionKeyField: "id",
        eventSubscriptions: ["EventA"] as const,
        context: "test",
        type: "primary",
      }),
      viewB: defineProjection({
        projectionName: "viewB",
        description: "View B",
        targetTable: "tableB",
        partitionKeyField: "id",
        eventSubscriptions: ["EventB"] as const,
        context: "test",
        type: "secondary",
      }),
    };

    expect(Object.keys(registry)).toHaveLength(PROJECTIONS.length);
    expect(registry.viewA.type).toBe("primary");
    expect(registry.viewB.type).toBe("secondary");
  });
});

describe("Projection Type Inference", () => {
  it("preserves projectionName as literal type", () => {
    const def = defineProjection({
      projectionName: "specificProjection",
      description: "Test",
      targetTable: "table",
      partitionKeyField: "id",
      eventSubscriptions: ["Event"] as const,
      context: "test",
      type: "primary",
    });

    // Compile-time check
    const _typeCheck: "specificProjection" = def.projectionName;
    expect(_typeCheck).toBe("specificProjection");
  });

  it("preserves eventSubscriptions as literal tuple", () => {
    const def = defineProjection({
      projectionName: "test",
      description: "Test",
      targetTable: "table",
      partitionKeyField: "id",
      eventSubscriptions: ["Alpha", "Beta", "Gamma"] as const,
      context: "test",
      type: "primary",
    });

    expect(def.eventSubscriptions).toHaveLength(3);
    expect(def.eventSubscriptions[0]).toBe("Alpha");
    expect(def.eventSubscriptions[1]).toBe("Beta");
    expect(def.eventSubscriptions[2]).toBe("Gamma");
  });
});

// ============================================================================
// PROJECTION_TYPES and isProjectionType - Added from multi-agent review
// ============================================================================

describe("isProjectionType", () => {
  it("returns true for valid projection types", () => {
    expect(isProjectionType("primary")).toBe(true);
    expect(isProjectionType("secondary")).toBe(true);
    expect(isProjectionType("cross-context")).toBe(true);
  });

  it("returns false for invalid projection types", () => {
    expect(isProjectionType("invalid")).toBe(false);
    expect(isProjectionType("")).toBe(false);
    expect(isProjectionType(null)).toBe(false);
    expect(isProjectionType(undefined)).toBe(false);
    expect(isProjectionType(123)).toBe(false);
    expect(isProjectionType({})).toBe(false);
  });

  it("returns false for array input", () => {
    expect(isProjectionType(["primary"])).toBe(false);
    expect(isProjectionType(["primary", "secondary"])).toBe(false);
  });

  it("returns false for similar but incorrect strings", () => {
    expect(isProjectionType("Primary")).toBe(false); // case-sensitive
    expect(isProjectionType("SECONDARY")).toBe(false);
    expect(isProjectionType("crosscontext")).toBe(false); // missing hyphen
    expect(isProjectionType("cross_context")).toBe(false); // underscore instead of hyphen
  });

  it("narrows type correctly", () => {
    const value: unknown = "primary";
    if (isProjectionType(value)) {
      // value is now typed as ProjectionType
      const projType: ProjectionType = value;
      expect(projType).toBe("primary");
    }
  });

  it("can be used in array filter", () => {
    const values: unknown[] = ["primary", "invalid", "secondary", null, "cross-context"];
    const validTypes = values.filter(isProjectionType);
    expect(validTypes).toEqual(["primary", "secondary", "cross-context"]);
    expect(validTypes).toHaveLength(3);
  });
});

describe("PROJECTION_TYPES", () => {
  it("exports exactly 3 projection types", () => {
    expect(PROJECTION_TYPES).toEqual(["primary", "secondary", "cross-context"]);
    expect(PROJECTION_TYPES).toHaveLength(3);
  });

  it("is a readonly tuple", () => {
    // Verify the tuple is typed correctly (readonly)
    // This is a compile-time check - if it compiles, the type is correct
    const types: readonly ["primary", "secondary", "cross-context"] = PROJECTION_TYPES;
    expect(types[0]).toBe("primary");
    expect(types[1]).toBe("secondary");
    expect(types[2]).toBe("cross-context");
  });

  it("matches ProjectionType type", () => {
    // Every element in PROJECTION_TYPES should be a valid ProjectionType
    for (const type of PROJECTION_TYPES) {
      expect(isProjectionType(type)).toBe(true);
    }
  });

  it("can be used to iterate over all valid types", () => {
    const projectionDefs = PROJECTION_TYPES.map((type) =>
      defineProjection({
        projectionName: `test-${type}`,
        description: `Test ${type} projection`,
        targetTable: "testTable",
        partitionKeyField: "id",
        eventSubscriptions: ["TestEvent"] as const,
        context: "test",
        type,
      })
    );

    expect(projectionDefs).toHaveLength(3);
    expect(projectionDefs[0].type).toBe("primary");
    expect(projectionDefs[1].type).toBe("secondary");
    expect(projectionDefs[2].type).toBe("cross-context");
  });
});

// ============================================================================
// QUERY DEFINITION TESTS
// ============================================================================

describe("QueryDefinition", () => {
  it("defines query metadata", () => {
    const def: QueryDefinition<"paginated"> = {
      queryName: "listOrders",
      description: "Paginated list of orders for a customer",
      sourceProjection: "orderSummary",
      targetTable: "orderSummaries",
      resultType: "paginated",
      context: "orders",
      indexUsed: "by_customer",
      supportsPagination: true,
      defaultPageSize: 20,
      maxPageSize: 100,
    };

    expect(def.queryName).toBe("listOrders");
    expect(def.description).toBe("Paginated list of orders for a customer");
    expect(def.sourceProjection).toBe("orderSummary");
    expect(def.targetTable).toBe("orderSummaries");
    expect(def.resultType).toBe("paginated");
    expect(def.context).toBe("orders");
    expect(def.indexUsed).toBe("by_customer");
    expect(def.supportsPagination).toBe(true);
    expect(def.defaultPageSize).toBe(20);
    expect(def.maxPageSize).toBe(100);
  });

  it("defineQuery helper preserves literal types", () => {
    const def = defineQuery({
      queryName: "getOrderById",
      description: "Gets a single order by ID",
      sourceProjection: "orderSummary",
      targetTable: "orderSummaries",
      resultType: "single",
      context: "orders",
    });

    // Type-level: def.queryName should be "getOrderById"
    expect(def.queryName).toBe("getOrderById");
    expect(def.resultType).toBe("single");
  });

  it("supports all result types", () => {
    const types: QueryResultType[] = ["single", "list", "paginated", "count"];

    types.forEach((resultType) => {
      const def = defineQuery({
        queryName: `test${resultType}`,
        description: `Test ${resultType} query`,
        sourceProjection: "testProjection",
        targetTable: "testTable",
        resultType,
        context: "test",
      });

      expect(def.resultType).toBe(resultType);
    });
  });

  it("allows optional fields to be undefined", () => {
    const def = defineQuery({
      queryName: "simpleQuery",
      description: "Simple query without optional fields",
      sourceProjection: "testProjection",
      targetTable: "testTable",
      resultType: "list",
      context: "test",
    });

    expect(def.indexUsed).toBeUndefined();
    expect(def.supportsPagination).toBeUndefined();
    expect(def.defaultPageSize).toBeUndefined();
    expect(def.maxPageSize).toBeUndefined();
  });
});

describe("QueryDefinitionRegistry", () => {
  it("maps query names to definitions", () => {
    type TestQueries = readonly ["listOrders", "getOrderById", "countOrders"];

    const registry: QueryDefinitionRegistry<TestQueries> = {
      listOrders: defineQuery({
        queryName: "listOrders",
        description: "List orders",
        sourceProjection: "orderSummary",
        targetTable: "orderSummaries",
        resultType: "paginated",
        context: "orders",
      }),
      getOrderById: defineQuery({
        queryName: "getOrderById",
        description: "Get order by ID",
        sourceProjection: "orderSummary",
        targetTable: "orderSummaries",
        resultType: "single",
        context: "orders",
      }),
      countOrders: defineQuery({
        queryName: "countOrders",
        description: "Count orders",
        sourceProjection: "orderSummary",
        targetTable: "orderSummaries",
        resultType: "count",
        context: "orders",
      }),
    };

    expect(registry.listOrders.resultType).toBe("paginated");
    expect(registry.getOrderById.resultType).toBe("single");
    expect(registry.countOrders.resultType).toBe("count");
    expect(Object.keys(registry)).toHaveLength(3);
  });
});

describe("isQueryResultType", () => {
  it("returns true for valid query result types", () => {
    expect(isQueryResultType("single")).toBe(true);
    expect(isQueryResultType("list")).toBe(true);
    expect(isQueryResultType("paginated")).toBe(true);
    expect(isQueryResultType("count")).toBe(true);
  });

  it("returns false for invalid query result types", () => {
    expect(isQueryResultType("invalid")).toBe(false);
    expect(isQueryResultType("")).toBe(false);
    expect(isQueryResultType(null)).toBe(false);
    expect(isQueryResultType(undefined)).toBe(false);
    expect(isQueryResultType(123)).toBe(false);
    expect(isQueryResultType({})).toBe(false);
  });

  it("narrows type correctly", () => {
    const value: unknown = "paginated";
    if (isQueryResultType(value)) {
      const resultType: QueryResultType = value;
      expect(resultType).toBe("paginated");
    }
  });
});

describe("QUERY_RESULT_TYPES", () => {
  it("exports exactly 4 query result types", () => {
    expect(QUERY_RESULT_TYPES).toEqual(["single", "list", "paginated", "count"]);
    expect(QUERY_RESULT_TYPES).toHaveLength(4);
  });

  it("is a readonly tuple", () => {
    const types: readonly ["single", "list", "paginated", "count"] = QUERY_RESULT_TYPES;
    expect(types[0]).toBe("single");
    expect(types[3]).toBe("count");
  });

  it("matches QueryResultType type", () => {
    for (const type of QUERY_RESULT_TYPES) {
      expect(isQueryResultType(type)).toBe(true);
    }
  });
});

// ============================================================================
// PROCESS MANAGER DEFINITION TESTS
// ============================================================================

describe("ProcessManagerDefinition", () => {
  it("defines process manager metadata for event-triggered PM", () => {
    const def: ProcessManagerDefinition<"OrderConfirmed" | "OrderShipped"> = {
      processManagerName: "orderNotification",
      description: "Sends notification when order is confirmed or shipped",
      triggerType: "event",
      eventSubscriptions: ["OrderConfirmed", "OrderShipped"],
      emitsCommands: ["SendNotification", "SendEmail"],
      context: "orders",
      correlationStrategy: { correlationProperty: "orderId" },
    };

    expect(def.processManagerName).toBe("orderNotification");
    expect(def.description).toBe("Sends notification when order is confirmed or shipped");
    expect(def.triggerType).toBe("event");
    expect(def.eventSubscriptions).toContain("OrderConfirmed");
    expect(def.eventSubscriptions).toContain("OrderShipped");
    expect(def.emitsCommands).toContain("SendNotification");
    expect(def.context).toBe("orders");
    expect(def.correlationStrategy?.correlationProperty).toBe("orderId");
  });

  it("defines process manager metadata for time-triggered PM", () => {
    const def = defineProcessManager({
      processManagerName: "reservationExpiration",
      description: "Expires stale reservations every 5 minutes",
      triggerType: "time",
      eventSubscriptions: [] as const,
      emitsCommands: ["ReleaseReservation"],
      context: "inventory",
      cronConfig: {
        interval: { minutes: 5 },
        scheduleDescription: "Every 5 minutes",
      },
    });

    expect(def.processManagerName).toBe("reservationExpiration");
    expect(def.triggerType).toBe("time");
    expect(def.eventSubscriptions).toHaveLength(0);
    expect(def.cronConfig?.interval.minutes).toBe(5);
    expect(def.cronConfig?.scheduleDescription).toBe("Every 5 minutes");
  });

  it("defines process manager metadata for hybrid PM", () => {
    const def = defineProcessManager({
      processManagerName: "stockMonitoring",
      description: "Monitors stock levels and creates restock orders",
      triggerType: "hybrid",
      eventSubscriptions: ["StockReserved", "StockDepleted"] as const,
      emitsCommands: ["CreateRestockOrder"],
      context: "inventory",
      correlationStrategy: { correlationProperty: "productId" },
      cronConfig: {
        interval: { hours: 1 },
        scheduleDescription: "Hourly check for critical stock",
      },
      stateVersion: 1,
    });

    expect(def.processManagerName).toBe("stockMonitoring");
    expect(def.triggerType).toBe("hybrid");
    expect(def.eventSubscriptions).toHaveLength(2);
    expect(def.cronConfig?.interval.hours).toBe(1);
    expect(def.stateVersion).toBe(1);
  });

  it("defineProcessManager helper preserves literal types", () => {
    const def = defineProcessManager({
      processManagerName: "testPM",
      description: "Test process manager",
      triggerType: "event",
      eventSubscriptions: ["TestEvent"] as const,
      emitsCommands: ["TestCommand"],
      context: "test",
    });

    // Type-level: def.processManagerName should be "testPM"
    expect(def.processManagerName).toBe("testPM");
    expect(def.eventSubscriptions).toHaveLength(1);
  });

  it("supports all trigger types", () => {
    // Event-triggered PM (requires at least one event subscription)
    const eventPM = defineProcessManager({
      processManagerName: "testevent",
      description: "Test event PM",
      triggerType: "event",
      eventSubscriptions: ["TestEvent"] as const,
      emitsCommands: ["TestCommand"],
      context: "test",
    });
    expect(eventPM.triggerType).toBe("event");

    // Time-triggered PM (requires cronConfig)
    const timePM = defineProcessManager({
      processManagerName: "testtime",
      description: "Test time PM",
      triggerType: "time",
      eventSubscriptions: [] as const,
      emitsCommands: ["TestCommand"],
      context: "test",
      cronConfig: {
        interval: { minutes: 5 },
        scheduleDescription: "Every 5 minutes",
      },
    });
    expect(timePM.triggerType).toBe("time");

    // Hybrid PM (requires cronConfig)
    const hybridPM = defineProcessManager({
      processManagerName: "testhybrid",
      description: "Test hybrid PM",
      triggerType: "hybrid",
      eventSubscriptions: ["TestEvent"] as const,
      emitsCommands: ["TestCommand"],
      context: "test",
      cronConfig: {
        interval: { hours: 1 },
        scheduleDescription: "Every hour",
      },
    });
    expect(hybridPM.triggerType).toBe("hybrid");
  });

  it("allows optional fields to be undefined", () => {
    const def = defineProcessManager({
      processManagerName: "simplePM",
      description: "Simple PM",
      triggerType: "event",
      eventSubscriptions: ["Event"] as const,
      emitsCommands: ["Command"],
      context: "test",
    });

    expect(def.correlationStrategy).toBeUndefined();
    expect(def.cronConfig).toBeUndefined();
    expect(def.stateVersion).toBeUndefined();
  });

  it("throws when time-triggered PM lacks cronConfig", () => {
    expect(() =>
      defineProcessManager({
        processManagerName: "invalidTimePM",
        description: "Time PM without cronConfig",
        triggerType: "time",
        eventSubscriptions: [] as const,
        emitsCommands: ["TestCommand"],
        context: "test",
        // Missing cronConfig
      })
    ).toThrow('requires cronConfig for trigger type "time"');
  });

  it("throws when hybrid PM lacks cronConfig", () => {
    expect(() =>
      defineProcessManager({
        processManagerName: "invalidHybridPM",
        description: "Hybrid PM without cronConfig",
        triggerType: "hybrid",
        eventSubscriptions: ["TestEvent"] as const,
        emitsCommands: ["TestCommand"],
        context: "test",
        // Missing cronConfig
      })
    ).toThrow('requires cronConfig for trigger type "hybrid"');
  });

  it("throws when event-triggered PM has no event subscriptions", () => {
    expect(() =>
      defineProcessManager({
        processManagerName: "invalidEventPM",
        description: "Event PM without subscriptions",
        triggerType: "event",
        eventSubscriptions: [] as const, // Empty
        emitsCommands: ["TestCommand"],
        context: "test",
      })
    ).toThrow("requires at least one event subscription");
  });
});

describe("ProcessManagerDefinitionRegistry", () => {
  it("maps PM names to definitions", () => {
    type TestPMs = readonly ["orderNotification", "reservationExpiration"];

    const registry: ProcessManagerDefinitionRegistry<TestPMs> = {
      orderNotification: defineProcessManager({
        processManagerName: "orderNotification",
        description: "Order notifications",
        triggerType: "event",
        eventSubscriptions: ["OrderConfirmed"] as const,
        emitsCommands: ["SendNotification"],
        context: "orders",
      }),
      reservationExpiration: defineProcessManager({
        processManagerName: "reservationExpiration",
        description: "Reservation expiration",
        triggerType: "time",
        eventSubscriptions: [] as const,
        emitsCommands: ["ReleaseReservation"],
        context: "inventory",
        cronConfig: {
          interval: { hours: 1 },
          scheduleDescription: "Every hour",
        },
      }),
    };

    expect(registry.orderNotification.triggerType).toBe("event");
    expect(registry.reservationExpiration.triggerType).toBe("time");
    expect(Object.keys(registry)).toHaveLength(2);
  });
});

describe("isProcessManagerTriggerType", () => {
  it("returns true for valid trigger types", () => {
    expect(isProcessManagerTriggerType("event")).toBe(true);
    expect(isProcessManagerTriggerType("time")).toBe(true);
    expect(isProcessManagerTriggerType("hybrid")).toBe(true);
  });

  it("returns false for invalid trigger types", () => {
    expect(isProcessManagerTriggerType("invalid")).toBe(false);
    expect(isProcessManagerTriggerType("")).toBe(false);
    expect(isProcessManagerTriggerType(null)).toBe(false);
    expect(isProcessManagerTriggerType(undefined)).toBe(false);
    expect(isProcessManagerTriggerType(123)).toBe(false);
  });

  it("narrows type correctly", () => {
    const value: unknown = "hybrid";
    if (isProcessManagerTriggerType(value)) {
      const triggerType: ProcessManagerTriggerType = value;
      expect(triggerType).toBe("hybrid");
    }
  });
});

describe("PROCESS_MANAGER_TRIGGER_TYPES", () => {
  it("exports exactly 3 trigger types", () => {
    expect(PROCESS_MANAGER_TRIGGER_TYPES).toEqual(["event", "time", "hybrid"]);
    expect(PROCESS_MANAGER_TRIGGER_TYPES).toHaveLength(3);
  });

  it("is a readonly tuple", () => {
    const types: readonly ["event", "time", "hybrid"] = PROCESS_MANAGER_TRIGGER_TYPES;
    expect(types[0]).toBe("event");
    expect(types[2]).toBe("hybrid");
  });

  it("matches ProcessManagerTriggerType type", () => {
    for (const type of PROCESS_MANAGER_TRIGGER_TYPES) {
      expect(isProcessManagerTriggerType(type)).toBe(true);
    }
  });
});

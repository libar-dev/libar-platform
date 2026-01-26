/**
 * Unit tests for createDeciderHandler factory.
 *
 * Tests the factory function that wraps pure decider functions
 * with infrastructure concerns (load, persist, event building).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createDeciderHandler,
  createEntityDeciderHandler,
  type DeciderHandlerConfig,
  type EntityDeciderHandlerConfig,
  type BaseCMSState,
} from "../../../src/decider";
import {
  success,
  rejected,
  failed,
  type DeciderEvent,
  type DeciderContext,
} from "../../../src/decider";

// =============================================================================
// Test Types
// =============================================================================

interface TestCMS extends BaseCMSState {
  id: string;
  status: string;
  value: number;
  version: number;
}

interface TestCommand {
  commandId: string;
  correlationId: string;
  entityId: string;
  newValue?: number;
}

interface TestSuccessEvent extends DeciderEvent {
  eventType: "TestSucceeded";
  payload: { id: string; newValue: number };
}

interface TestFailedEvent extends DeciderEvent {
  eventType: "TestFailed";
  payload: { id: string; reason: string };
}

interface TestSuccessData {
  id: string;
  newValue: number;
}

interface TestStateUpdate {
  value?: number;
  status?: string;
}

// =============================================================================
// Mock Context
// =============================================================================

interface MockContext {
  db: {
    patch: ReturnType<typeof vi.fn>;
  };
}

function createMockContext(): MockContext {
  return {
    db: {
      patch: vi.fn(),
    },
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

const createTestCMS = (overrides: Partial<TestCMS> = {}): TestCMS => ({
  id: "test-1",
  status: "active",
  value: 100,
  version: 1,
  ...overrides,
});

const createTestCommand = (overrides: Partial<TestCommand> = {}): TestCommand => ({
  commandId: "cmd-1",
  correlationId: "corr-1",
  entityId: "test-1",
  ...overrides,
});

// =============================================================================
// Test Deciders
// =============================================================================

function successDecider(
  state: TestCMS,
  command: Omit<TestCommand, "commandId" | "correlationId">,
  _context: DeciderContext
) {
  const newValue = command.newValue ?? state.value + 1;
  return success<TestSuccessEvent, TestSuccessData, TestStateUpdate>({
    data: { id: state.id, newValue },
    event: {
      eventType: "TestSucceeded",
      payload: { id: state.id, newValue },
    },
    stateUpdate: { value: newValue },
  });
}

function rejectedDecider(
  _state: TestCMS,
  _command: Omit<TestCommand, "commandId" | "correlationId">,
  _context: DeciderContext
) {
  return rejected("TEST_REJECTED", "Test rejection message", { reason: "test" });
}

function failedDecider(
  state: TestCMS,
  _command: Omit<TestCommand, "commandId" | "correlationId">,
  _context: DeciderContext
) {
  return failed<TestFailedEvent>(
    "Business failure occurred",
    {
      eventType: "TestFailed",
      payload: { id: state.id, reason: "business_rule" },
    },
    { additionalInfo: "test" }
  );
}

// =============================================================================
// Tests
// =============================================================================

describe("createDeciderHandler", () => {
  let mockContext: MockContext;
  let loadState: ReturnType<typeof vi.fn>;
  let applyUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockContext = createMockContext();
    loadState = vi.fn();
    applyUpdate = vi.fn();
  });

  const createConfig = <TData extends object>(
    decider: DeciderHandlerConfig<
      MockContext,
      TestCMS,
      TestCommand,
      TestSuccessEvent | TestFailedEvent,
      TData,
      TestStateUpdate,
      string
    >["decider"]
  ): DeciderHandlerConfig<
    MockContext,
    TestCMS,
    TestCommand,
    TestSuccessEvent | TestFailedEvent,
    TData,
    TestStateUpdate,
    string
  > => ({
    name: "TestHandler",
    streamType: "Test",
    schemaVersion: 1,
    decider,
    getEntityId: (args) => args.entityId,
    loadState,
    applyUpdate,
  });

  describe("success path", () => {
    it("should call loadState with correct entityId", async () => {
      const cms = createTestCMS();
      loadState.mockResolvedValue({ cms, _id: "doc-1" });

      const handler = createDeciderHandler(createConfig(successDecider));
      const command = createTestCommand();

      await handler(mockContext, command);

      expect(loadState).toHaveBeenCalledWith(mockContext, "test-1");
    });

    it("should call decider with state, command input, and context", async () => {
      const cms = createTestCMS();
      loadState.mockResolvedValue({ cms, _id: "doc-1" });

      const mockDecider = vi.fn().mockReturnValue(
        success<TestSuccessEvent, TestSuccessData, TestStateUpdate>({
          data: { id: "test-1", newValue: 101 },
          event: { eventType: "TestSucceeded", payload: { id: "test-1", newValue: 101 } },
          stateUpdate: { value: 101 },
        })
      );

      const handler = createDeciderHandler(createConfig(mockDecider));
      await handler(mockContext, createTestCommand({ newValue: 101 }));

      expect(mockDecider).toHaveBeenCalledWith(
        cms,
        { entityId: "test-1", newValue: 101 },
        expect.objectContaining({
          commandId: "cmd-1",
          correlationId: "corr-1",
          now: expect.any(Number),
        })
      );
    });

    it("should call applyUpdate with correct parameters", async () => {
      const cms = createTestCMS({ version: 5 });
      loadState.mockResolvedValue({ cms, _id: "doc-1" });

      const handler = createDeciderHandler(createConfig(successDecider));
      await handler(mockContext, createTestCommand({ newValue: 200 }));

      expect(applyUpdate).toHaveBeenCalledWith(
        mockContext,
        "doc-1",
        cms,
        { value: 200 },
        6, // version incremented
        expect.any(Number)
      );
    });

    it("should return success result with correct structure", async () => {
      loadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const handler = createDeciderHandler(createConfig(successDecider));
      const result = await handler(mockContext, createTestCommand());

      expect(result.status).toBe("success");
      expect(result).toHaveProperty("version", 2);
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("event");

      if (result.status === "success") {
        expect(result.data).toEqual({ id: "test-1", newValue: 101 });
        expect(result.event.eventType).toBe("TestSucceeded");
        expect(result.event.streamType).toBe("Test");
        expect(result.event.metadata.correlationId).toContain("corr-1");
        expect(result.event.metadata.causationId).toContain("cmd-1");
      }
    });

    it("should increment version correctly", async () => {
      loadState.mockResolvedValue({ cms: createTestCMS({ version: 10 }), _id: "doc-1" });

      const handler = createDeciderHandler(createConfig(successDecider));
      const result = await handler(mockContext, createTestCommand());

      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.version).toBe(11);
      }
    });
  });

  describe("rejected path", () => {
    it("should return rejected result without calling applyUpdate", async () => {
      loadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const handler = createDeciderHandler(createConfig(rejectedDecider));
      const result = await handler(mockContext, createTestCommand());

      expect(result.status).toBe("rejected");
      expect(applyUpdate).not.toHaveBeenCalled();
    });

    it("should include rejection details", async () => {
      loadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const handler = createDeciderHandler(createConfig(rejectedDecider));
      const result = await handler(mockContext, createTestCommand());

      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("TEST_REJECTED");
        expect(result.reason).toBe("Test rejection message");
        expect(result.context).toEqual({ reason: "test" });
      }
    });
  });

  describe("failed path (business failure with event)", () => {
    it("should return failed result without calling applyUpdate", async () => {
      loadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const handler = createDeciderHandler(createConfig(failedDecider));
      const result = await handler(mockContext, createTestCommand());

      expect(result.status).toBe("failed");
      expect(applyUpdate).not.toHaveBeenCalled();
    });

    it("should include failure event and details", async () => {
      loadState.mockResolvedValue({ cms: createTestCMS({ version: 3 }), _id: "doc-1" });

      const handler = createDeciderHandler(createConfig(failedDecider));
      const result = await handler(mockContext, createTestCommand());

      expect(result.status).toBe("failed");
      if (result.status === "failed") {
        expect(result.reason).toBe("Business failure occurred");
        expect(result.event.eventType).toBe("TestFailed");
        expect(result.expectedVersion).toBe(3); // Current version, not incremented
        expect(result.context).toEqual({ additionalInfo: "test" });
      }
    });
  });

  describe("error handling", () => {
    it("should propagate loadState errors", async () => {
      loadState.mockRejectedValue(new Error("Entity not found"));

      const handler = createDeciderHandler(createConfig(successDecider));

      await expect(handler(mockContext, createTestCommand())).rejects.toThrow("Entity not found");
    });

    it("should use custom error handler when provided", async () => {
      loadState.mockRejectedValue(new Error("Not found"));

      const handleError = vi.fn().mockReturnValue({
        status: "rejected" as const,
        code: "NOT_FOUND",
        message: "Custom not found message",
      });

      const config = {
        ...createConfig(successDecider),
        handleError,
      };

      const handler = createDeciderHandler(config);
      const result = await handler(mockContext, createTestCommand());

      expect(handleError).toHaveBeenCalled();
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("NOT_FOUND");
      }
    });

    it("should rethrow when custom error handler returns nothing", async () => {
      loadState.mockRejectedValue(new Error("Unknown error"));

      const handleError = vi.fn().mockReturnValue(undefined);

      const config = {
        ...createConfig(successDecider),
        handleError,
      };

      const handler = createDeciderHandler(config);

      await expect(handler(mockContext, createTestCommand())).rejects.toThrow("Unknown error");
    });
  });

  describe("logging", () => {
    it("should call logger.debug on success", async () => {
      loadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const config = {
        ...createConfig(successDecider),
        logger,
      };

      const handler = createDeciderHandler(config);
      await handler(mockContext, createTestCommand());

      expect(logger.debug).toHaveBeenCalledWith(
        "[TestHandler] Starting command",
        expect.objectContaining({ entityId: "test-1" })
      );
      expect(logger.debug).toHaveBeenCalledWith(
        "[TestHandler] Command succeeded",
        expect.objectContaining({ version: 2 })
      );
    });

    it("should call logger.debug on rejection", async () => {
      loadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const config = {
        ...createConfig(rejectedDecider),
        logger,
      };

      const handler = createDeciderHandler(config);
      await handler(mockContext, createTestCommand());

      expect(logger.debug).toHaveBeenCalledWith(
        "[TestHandler] Command rejected",
        expect.objectContaining({ code: "TEST_REJECTED" })
      );
    });

    it("should call logger.error on exception", async () => {
      loadState.mockRejectedValue(new Error("Test error"));

      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const config = {
        ...createConfig(successDecider),
        logger,
      };

      const handler = createDeciderHandler(config);

      await expect(handler(mockContext, createTestCommand())).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        "[TestHandler] Command error",
        expect.objectContaining({ entityId: "test-1" })
      );
    });
  });

  describe("event metadata", () => {
    it("should generate unique eventId", async () => {
      loadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const handler = createDeciderHandler(createConfig(successDecider));
      const result1 = await handler(mockContext, createTestCommand());
      const result2 = await handler(mockContext, createTestCommand());

      if (result1.status === "success" && result2.status === "success") {
        expect(result1.event.eventId).not.toBe(result2.event.eventId);
      }
    });

    it("should include schemaVersion in metadata", async () => {
      loadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const config = {
        ...createConfig(successDecider),
        schemaVersion: 3,
      };

      const handler = createDeciderHandler(config);
      const result = await handler(mockContext, createTestCommand());

      if (result.status === "success") {
        expect(result.event.metadata.schemaVersion).toBe(3);
      }
    });

    it("should build correct streamId from entityId", async () => {
      loadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const handler = createDeciderHandler(createConfig(successDecider));
      const result = await handler(mockContext, createTestCommand({ entityId: "my-entity-123" }));

      if (result.status === "success") {
        expect(result.event.streamId).toContain("my-entity-123");
      }
    });
  });
});

// =============================================================================
// Entity Creation Factory Tests
// =============================================================================

describe("createEntityDeciderHandler", () => {
  let mockContext: MockContext & { db: { insert: ReturnType<typeof vi.fn> } };
  let tryLoadState: ReturnType<typeof vi.fn>;
  let insert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockContext = {
      db: {
        patch: vi.fn(),
        insert: vi.fn(),
      },
    };
    tryLoadState = vi.fn();
    insert = vi.fn();
  });

  // Entity creation decider - accepts null state for new entities
  function entityCreateDecider(
    state: TestCMS | null,
    command: Omit<TestCommand, "commandId" | "correlationId">,
    _context: DeciderContext
  ) {
    // Reject if entity already exists
    if (state !== null) {
      return rejected("ENTITY_ALREADY_EXISTS", `Entity ${command.entityId} already exists`);
    }

    // Create new entity
    return success<TestSuccessEvent, TestSuccessData, TestStateUpdate>({
      data: { id: command.entityId, newValue: command.newValue ?? 100 },
      event: {
        eventType: "TestSucceeded",
        payload: { id: command.entityId, newValue: command.newValue ?? 100 },
      },
      stateUpdate: { value: command.newValue ?? 100, status: "active" },
    });
  }

  const createEntityConfig = (): EntityDeciderHandlerConfig<
    typeof mockContext,
    TestCMS,
    TestCommand,
    TestSuccessEvent,
    TestSuccessData,
    TestStateUpdate,
    string
  > => ({
    name: "CreateEntity",
    streamType: "Test",
    schemaVersion: 1,
    decider: entityCreateDecider,
    getEntityId: (args) => args.entityId,
    tryLoadState,
    insert,
  });

  describe("entity creation (null state)", () => {
    it("should call tryLoadState with correct entityId", async () => {
      tryLoadState.mockResolvedValue(null);

      const handler = createEntityDeciderHandler(createEntityConfig());
      await handler(mockContext, createTestCommand());

      expect(tryLoadState).toHaveBeenCalledWith(mockContext, "test-1");
    });

    it("should call decider with null state when entity does not exist", async () => {
      tryLoadState.mockResolvedValue(null);

      const mockDecider = vi.fn().mockReturnValue(
        success<TestSuccessEvent, TestSuccessData, TestStateUpdate>({
          data: { id: "test-1", newValue: 100 },
          event: { eventType: "TestSucceeded", payload: { id: "test-1", newValue: 100 } },
          stateUpdate: { value: 100, status: "active" },
        })
      );

      const config = { ...createEntityConfig(), decider: mockDecider };
      const handler = createEntityDeciderHandler(config);
      await handler(mockContext, createTestCommand());

      expect(mockDecider).toHaveBeenCalledWith(
        null, // state is null for new entities
        { entityId: "test-1" },
        expect.objectContaining({
          commandId: "cmd-1",
          correlationId: "corr-1",
        })
      );
    });

    it("should call insert (not applyUpdate) for new entities", async () => {
      tryLoadState.mockResolvedValue(null);

      const handler = createEntityDeciderHandler(createEntityConfig());
      await handler(mockContext, createTestCommand({ newValue: 200 }));

      expect(insert).toHaveBeenCalledWith(
        mockContext,
        "test-1",
        { value: 200, status: "active" },
        { entityId: "test-1", newValue: 200 }, // commandInput passed to insert
        1, // version is always 1 for new entities
        expect.any(Number)
      );
    });

    it("should return success with version 1 for new entities", async () => {
      tryLoadState.mockResolvedValue(null);

      const handler = createEntityDeciderHandler(createEntityConfig());
      const result = await handler(mockContext, createTestCommand());

      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.version).toBe(1);
        expect(result.data).toEqual({ id: "test-1", newValue: 100 });
        expect(result.event.eventType).toBe("TestSucceeded");
      }
    });

    it("should generate correct event metadata for new entities", async () => {
      tryLoadState.mockResolvedValue(null);

      const handler = createEntityDeciderHandler(createEntityConfig());
      const result = await handler(mockContext, createTestCommand());

      if (result.status === "success") {
        expect(result.event.streamType).toBe("Test");
        expect(result.event.streamId).toContain("test-1");
        expect(result.event.metadata.correlationId).toContain("corr-1");
        expect(result.event.metadata.causationId).toContain("cmd-1");
        expect(result.event.metadata.schemaVersion).toBe(1);
      }
    });
  });

  describe("entity already exists (rejection)", () => {
    it("should call decider with existing state when entity exists", async () => {
      const existingCMS = createTestCMS();
      tryLoadState.mockResolvedValue({ cms: existingCMS, _id: "doc-1" });

      const mockDecider = vi
        .fn()
        .mockReturnValue(rejected("ENTITY_ALREADY_EXISTS", "Entity already exists"));

      const config = { ...createEntityConfig(), decider: mockDecider };
      const handler = createEntityDeciderHandler(config);
      await handler(mockContext, createTestCommand());

      expect(mockDecider).toHaveBeenCalledWith(
        existingCMS, // state is the existing CMS
        { entityId: "test-1" },
        expect.objectContaining({
          commandId: "cmd-1",
          correlationId: "corr-1",
        })
      );
    });

    it("should return rejection when entity already exists", async () => {
      tryLoadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const handler = createEntityDeciderHandler(createEntityConfig());
      const result = await handler(mockContext, createTestCommand());

      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("ENTITY_ALREADY_EXISTS");
      }
    });

    it("should not call insert when entity already exists", async () => {
      tryLoadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const handler = createEntityDeciderHandler(createEntityConfig());
      await handler(mockContext, createTestCommand());

      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe("failed path (business failure with event)", () => {
    it("should return failed result with version 0 for non-existent entity", async () => {
      tryLoadState.mockResolvedValue(null);

      const failedEntityDecider = (
        _state: TestCMS | null,
        _command: Omit<TestCommand, "commandId" | "correlationId">,
        _context: DeciderContext
      ) => {
        return failed<TestFailedEvent>("Cannot create entity", {
          eventType: "TestFailed",
          payload: { id: "test-1", reason: "validation" },
        });
      };

      const config = { ...createEntityConfig(), decider: failedEntityDecider };
      const handler = createEntityDeciderHandler(config);
      const result = await handler(mockContext, createTestCommand());

      expect(result.status).toBe("failed");
      if (result.status === "failed") {
        expect(result.expectedVersion).toBe(0); // Entity doesn't exist
        expect(result.event.eventType).toBe("TestFailed");
      }
    });

    it("should not call insert on business failure", async () => {
      tryLoadState.mockResolvedValue(null);

      const failedEntityDecider = (
        _state: TestCMS | null,
        _command: Omit<TestCommand, "commandId" | "correlationId">,
        _context: DeciderContext
      ) => {
        return failed<TestFailedEvent>("Cannot create entity", {
          eventType: "TestFailed",
          payload: { id: "test-1", reason: "validation" },
        });
      };

      const config = { ...createEntityConfig(), decider: failedEntityDecider };
      const handler = createEntityDeciderHandler(config);
      await handler(mockContext, createTestCommand());

      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should propagate tryLoadState errors", async () => {
      tryLoadState.mockRejectedValue(new Error("Database error"));

      const handler = createEntityDeciderHandler(createEntityConfig());

      await expect(handler(mockContext, createTestCommand())).rejects.toThrow("Database error");
    });

    it("should propagate insert errors", async () => {
      tryLoadState.mockResolvedValue(null);
      insert.mockRejectedValue(new Error("Insert constraint violation"));

      const handler = createEntityDeciderHandler(createEntityConfig());

      await expect(handler(mockContext, createTestCommand())).rejects.toThrow(
        "Insert constraint violation"
      );
    });

    it("should use custom error handler when provided", async () => {
      tryLoadState.mockRejectedValue(new Error("Constraint violation"));

      const handleError = vi.fn().mockReturnValue({
        status: "rejected" as const,
        code: "CONSTRAINT_ERROR",
        message: "Custom error message",
      });

      const config = { ...createEntityConfig(), handleError };
      const handler = createEntityDeciderHandler(config);
      const result = await handler(mockContext, createTestCommand());

      expect(handleError).toHaveBeenCalled();
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("CONSTRAINT_ERROR");
      }
    });
  });

  describe("logging", () => {
    it("should call logger.debug on entity creation success", async () => {
      tryLoadState.mockResolvedValue(null);

      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const config = { ...createEntityConfig(), logger };
      const handler = createEntityDeciderHandler(config);
      await handler(mockContext, createTestCommand());

      expect(logger.debug).toHaveBeenCalledWith(
        "[CreateEntity] Starting command",
        expect.objectContaining({ entityId: "test-1" })
      );
      expect(logger.debug).toHaveBeenCalledWith(
        "[CreateEntity] Command succeeded",
        expect.objectContaining({ version: 1 })
      );
    });

    it("should call logger.debug on rejection", async () => {
      tryLoadState.mockResolvedValue({ cms: createTestCMS(), _id: "doc-1" });

      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const config = { ...createEntityConfig(), logger };
      const handler = createEntityDeciderHandler(config);
      await handler(mockContext, createTestCommand());

      expect(logger.debug).toHaveBeenCalledWith(
        "[CreateEntity] Command rejected",
        expect.objectContaining({ code: "ENTITY_ALREADY_EXISTS" })
      );
    });
  });

  describe("event metadata for entity creation", () => {
    it("should generate unique eventId for each creation", async () => {
      tryLoadState.mockResolvedValue(null);

      const handler = createEntityDeciderHandler(createEntityConfig());
      const result1 = await handler(mockContext, createTestCommand({ entityId: "entity-1" }));
      const result2 = await handler(mockContext, createTestCommand({ entityId: "entity-2" }));

      if (result1.status === "success" && result2.status === "success") {
        expect(result1.event.eventId).not.toBe(result2.event.eventId);
      }
    });

    it("should include schemaVersion in metadata", async () => {
      tryLoadState.mockResolvedValue(null);

      const config = { ...createEntityConfig(), schemaVersion: 5 };
      const handler = createEntityDeciderHandler(config);
      const result = await handler(mockContext, createTestCommand());

      if (result.status === "success") {
        expect(result.event.metadata.schemaVersion).toBe(5);
      }
    });
  });

  describe("preValidate hook", () => {
    it("should short-circuit on preValidate rejection", async () => {
      // preValidate returns rejection (e.g., SKU already exists)
      const preValidate = vi.fn().mockResolvedValue({
        status: "rejected" as const,
        code: "SKU_ALREADY_EXISTS",
        reason: 'SKU "ABC-123" already exists',
      });

      const mockDecider = vi.fn();

      const config = {
        ...createEntityConfig(),
        decider: mockDecider,
        preValidate,
      };

      const handler = createEntityDeciderHandler(config);
      const result = await handler(mockContext, createTestCommand());

      // Should return rejection from preValidate
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("SKU_ALREADY_EXISTS");
      }

      // Should NOT call tryLoadState or decider
      expect(tryLoadState).not.toHaveBeenCalled();
      expect(mockDecider).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    });

    it("should continue when preValidate returns undefined", async () => {
      tryLoadState.mockResolvedValue(null);

      // preValidate returns undefined (validation passed)
      const preValidate = vi.fn().mockResolvedValue(undefined);

      const config = {
        ...createEntityConfig(),
        preValidate,
      };

      const handler = createEntityDeciderHandler(config);
      const result = await handler(mockContext, createTestCommand());

      // Should call preValidate with correct args
      expect(preValidate).toHaveBeenCalledWith(mockContext, { entityId: "test-1" });

      // Should continue with normal flow
      expect(tryLoadState).toHaveBeenCalled();
      expect(insert).toHaveBeenCalled();

      expect(result.status).toBe("success");
    });

    it("should pass correct arguments to preValidate", async () => {
      tryLoadState.mockResolvedValue(null);

      const preValidate = vi.fn().mockResolvedValue(undefined);

      const config = {
        ...createEntityConfig(),
        preValidate,
      };

      const handler = createEntityDeciderHandler(config);
      await handler(mockContext, createTestCommand({ entityId: "my-product", newValue: 500 }));

      // preValidate receives context and domain input (without commandId/correlationId)
      expect(preValidate).toHaveBeenCalledWith(mockContext, {
        entityId: "my-product",
        newValue: 500,
      });
    });

    it("should log pre-validation failure", async () => {
      const preValidate = vi.fn().mockResolvedValue({
        status: "rejected" as const,
        code: "VALIDATION_FAILED",
        reason: "Pre-validation failed",
      });

      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const config = {
        ...createEntityConfig(),
        preValidate,
        logger,
      };

      const handler = createEntityDeciderHandler(config);
      await handler(mockContext, createTestCommand());

      expect(logger.debug).toHaveBeenCalledWith(
        "[CreateEntity] Starting command",
        expect.objectContaining({ entityId: "test-1" })
      );
      expect(logger.debug).toHaveBeenCalledWith(
        "[CreateEntity] Pre-validation failed",
        expect.objectContaining({ entityId: "test-1" })
      );
    });

    it("should not call preValidate if not provided", async () => {
      tryLoadState.mockResolvedValue(null);

      // Config without preValidate
      const config = createEntityConfig();

      const handler = createEntityDeciderHandler(config);
      const result = await handler(mockContext, createTestCommand());

      // Should work normally without preValidate
      expect(tryLoadState).toHaveBeenCalled();
      expect(result.status).toBe("success");
    });
  });
});

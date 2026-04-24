/**
 * CommandBus Backend Integration Harness
 *
 * Direct integration tests for the platform-bus CommandBus component against
 * a real Convex backend. Complements the BDD Gherkin idempotency tests by
 * exercising the full command lifecycle as a single cohesive test suite:
 * - recordCommand (new + duplicate detection)
 * - updateCommandResult (executed/rejected/failed transitions)
 * - getCommandStatus (state queries)
 * - concurrent duplicate detection
 *
 * Uses the order-management example app's testing API as the test surface.
 *
 * Run via: just test-infrastructure-isolated
 */
import { describe, it, expect, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../../examples/order-management/convex/_generated/api";
import { generateCommandId, generateCorrelationId } from "../support/helpers";

interface TestableConvexHelper {
  mutation(fn: unknown, args: unknown): Promise<unknown>;
  query(fn: unknown, args: unknown): Promise<unknown>;
}

async function testMutation<T>(t: ConvexTestingHelper, fn: unknown, args: unknown): Promise<T> {
  const helper = t as unknown as TestableConvexHelper;
  return (await helper.mutation(fn, args)) as T;
}

async function testQuery<T>(t: ConvexTestingHelper, fn: unknown, args: unknown): Promise<T> {
  const helper = t as unknown as TestableConvexHelper;
  return (await helper.query(fn, args)) as T;
}

type RecordResult =
  | { status: "new" }
  | {
      status: "duplicate";
      commandStatus: "pending" | "executed" | "rejected" | "failed";
      result?: unknown;
    };

type CommandStatus = null | {
  commandId: string;
  commandType: string;
  targetContext: string;
  status: "pending" | "executed" | "rejected" | "failed";
  result?: unknown;
  executedAt?: number;
};

function createTestHelper(): ConvexTestingHelper {
  const backendUrl = process.env.CONVEX_URL;
  if (!backendUrl) {
    throw new Error(
      "CONVEX_URL environment variable must be set. Run tests via: just test-infrastructure-isolated"
    );
  }
  return new ConvexTestingHelper({ backendUrl });
}

function makePayloadOfSize(bytes: number): { blob: string } {
  return { blob: "x".repeat(bytes) };
}

describe("CommandBus Backend Integration", () => {
  let t: ConvexTestingHelper;

  afterEach(async () => {
    if (t) {
      try {
        await Promise.race([
          t.close(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Cleanup timeout")), 5000)),
        ]);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it("records a new command", async () => {
    t = createTestHelper();
    const commandId = generateCommandId("new");
    const correlationId = generateCorrelationId();

    const result = await testMutation<RecordResult>(t, api.testingFunctions.recordCommand, {
      commandId,
      commandType: "TestCommand",
      targetContext: "test",
      payload: { test: true },
      metadata: { correlationId, timestamp: Date.now() },
    });

    expect(result.status).toBe("new");
  });

  it("detects duplicate command after recording", async () => {
    t = createTestHelper();
    const commandId = generateCommandId("dup");
    const correlationId = generateCorrelationId();

    // First recording
    await testMutation<RecordResult>(t, api.testingFunctions.recordCommand, {
      commandId,
      commandType: "TestCommand",
      targetContext: "test",
      payload: { test: true },
      metadata: { correlationId, timestamp: Date.now() },
    });

    // Duplicate recording
    const result = await testMutation<RecordResult>(t, api.testingFunctions.recordCommand, {
      commandId,
      commandType: "TestCommand",
      targetContext: "test",
      payload: { test: true },
      metadata: { correlationId: generateCorrelationId(), timestamp: Date.now() },
    });

    expect(result.status).toBe("duplicate");
    if (result.status === "duplicate") {
      expect(result.commandStatus).toBe("pending");
    }
  });

  it("rejects oversized command payloads at the component boundary", async () => {
    t = createTestHelper();
    const commandId = generateCommandId("oversized");

    await expect(
      testMutation<RecordResult>(t, api.testingFunctions.recordCommand, {
        commandId,
        commandType: "OversizedCommand",
        targetContext: "test",
        payload: makePayloadOfSize(128 * 1024),
        metadata: { correlationId: generateCorrelationId(), timestamp: Date.now() },
      })
    ).rejects.toThrow(/PAYLOAD_TOO_LARGE|recordCommand\.payload/);
  });

  it("tracks command through pending -> executed lifecycle", async () => {
    t = createTestHelper();
    const commandId = generateCommandId("lifecycle");
    const correlationId = generateCorrelationId();

    // Record command
    await testMutation<RecordResult>(t, api.testingFunctions.recordCommand, {
      commandId,
      commandType: "LifecycleTest",
      targetContext: "test",
      payload: { step: 1 },
      metadata: { correlationId, timestamp: Date.now() },
    });

    // Verify pending status
    const pendingStatus = await testQuery<CommandStatus>(t, api.testingFunctions.getCommandStatus, {
      commandId,
    });
    expect(pendingStatus).not.toBeNull();
    expect(pendingStatus!.status).toBe("pending");
    expect(pendingStatus!.commandId).toBe(commandId);

    // Update to executed
    const updated = await testMutation<boolean>(t, api.testingFunctions.updateCommandResult, {
      commandId,
      status: "executed",
      result: { success: true },
    });
    expect(updated).toBe(true);

    // Verify executed status
    const executedStatus = await testQuery<CommandStatus>(
      t,
      api.testingFunctions.getCommandStatus,
      { commandId }
    );
    expect(executedStatus).not.toBeNull();
    expect(executedStatus!.status).toBe("executed");
    expect(executedStatus!.result).toEqual({ success: true });
  });

  it("returns duplicate with executed status for completed command", async () => {
    t = createTestHelper();
    const commandId = generateCommandId("completed-dup");
    const correlationId = generateCorrelationId();

    // Record and complete the command
    await testMutation<RecordResult>(t, api.testingFunctions.recordCommand, {
      commandId,
      commandType: "CompletedDupTest",
      targetContext: "test",
      payload: { test: true },
      metadata: { correlationId, timestamp: Date.now() },
    });

    await testMutation<boolean>(t, api.testingFunctions.updateCommandResult, {
      commandId,
      status: "rejected",
      result: { reason: "business_rule_failed" },
    });

    // Submit duplicate
    const result = await testMutation<RecordResult>(t, api.testingFunctions.recordCommand, {
      commandId,
      commandType: "CompletedDupTest",
      targetContext: "test",
      payload: { test: true },
      metadata: { correlationId: generateCorrelationId(), timestamp: Date.now() },
    });

    expect(result.status).toBe("duplicate");
    if (result.status === "duplicate") {
      expect(result.commandStatus).toBe("rejected");
      expect(result.result).toEqual({ reason: "business_rule_failed" });
    }
  });

  it("detects concurrent duplicates with exactly-once semantics", async () => {
    t = createTestHelper();
    const commandId = generateCommandId("concurrent");
    const correlationId1 = generateCorrelationId();
    const correlationId2 = generateCorrelationId();

    const [result1, result2] = await Promise.all([
      testMutation<RecordResult>(t, api.testingFunctions.recordCommand, {
        commandId,
        commandType: "ConcurrentTest",
        targetContext: "test",
        payload: { submission: 1 },
        metadata: { correlationId: correlationId1, timestamp: Date.now() },
      }),
      testMutation<RecordResult>(t, api.testingFunctions.recordCommand, {
        commandId,
        commandType: "ConcurrentTest",
        targetContext: "test",
        payload: { submission: 2 },
        metadata: { correlationId: correlationId2, timestamp: Date.now() },
      }),
    ]);

    const results = [result1, result2];
    const newCount = results.filter((r) => r.status === "new").length;
    const dupCount = results.filter((r) => r.status === "duplicate").length;
    expect(newCount).toBe(1);
    expect(dupCount).toBe(1);

    // Verify exactly one record exists
    const status = await testQuery<CommandStatus>(t, api.testingFunctions.getCommandStatus, {
      commandId,
    });
    expect(status).not.toBeNull();
    expect(status!.commandId).toBe(commandId);
  });

  it("tracks command through rejected lifecycle", async () => {
    t = createTestHelper();
    const commandId = generateCommandId("rejected");
    const correlationId = generateCorrelationId();

    await testMutation<RecordResult>(t, api.testingFunctions.recordCommand, {
      commandId,
      commandType: "RejectTest",
      targetContext: "test",
      payload: { invalid: true },
      metadata: { correlationId, timestamp: Date.now() },
    });

    const updated = await testMutation<boolean>(t, api.testingFunctions.updateCommandResult, {
      commandId,
      status: "rejected",
      result: { code: "VALIDATION_ERROR", message: "Invalid payload" },
    });
    expect(updated).toBe(true);

    const status = await testQuery<CommandStatus>(t, api.testingFunctions.getCommandStatus, {
      commandId,
    });
    expect(status!.status).toBe("rejected");
    expect((status!.result as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("tracks command through failed lifecycle", async () => {
    t = createTestHelper();
    const commandId = generateCommandId("failed");
    const correlationId = generateCorrelationId();

    await testMutation<RecordResult>(t, api.testingFunctions.recordCommand, {
      commandId,
      commandType: "FailTest",
      targetContext: "test",
      payload: { willFail: true },
      metadata: { correlationId, timestamp: Date.now() },
    });

    const updated = await testMutation<boolean>(t, api.testingFunctions.updateCommandResult, {
      commandId,
      status: "failed",
      result: { error: "DatabaseConnectionError" },
    });
    expect(updated).toBe(true);

    const status = await testQuery<CommandStatus>(t, api.testingFunctions.getCommandStatus, {
      commandId,
    });
    expect(status!.status).toBe("failed");
    expect((status!.result as { error: string }).error).toBe("DatabaseConnectionError");
  });
});

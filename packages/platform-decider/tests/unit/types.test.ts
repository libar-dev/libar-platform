/**
 * Unit tests for Decider types and helper functions.
 *
 * Tests the core decider functionality: helper functions for creating
 * outputs and type guards for narrowing.
 */
import { describe, it, expect } from "vitest";
import {
  success,
  rejected,
  failed,
  isSuccess,
  isRejected,
  isFailed,
  type DeciderOutput,
  type DeciderEvent,
} from "../../src/index";

// Test event types
interface TestPayload {
  testId: string;
}

interface TestEvent extends DeciderEvent<TestPayload> {
  eventType: "TestEvent";
  payload: TestPayload;
}

interface TestData {
  result: string;
}

interface TestStateUpdate {
  status: string;
}

describe("success helper", () => {
  it("should create a success output with correct status", () => {
    const result = success<TestEvent, TestData, TestStateUpdate>({
      data: { result: "ok" },
      event: { eventType: "TestEvent", payload: { testId: "123" } },
      stateUpdate: { status: "completed" },
    });

    expect(result.status).toBe("success");
    expect(result.data).toEqual({ result: "ok" });
    expect(result.event.eventType).toBe("TestEvent");
    expect(result.event.payload.testId).toBe("123");
    expect(result.stateUpdate.status).toBe("completed");
  });
});

describe("rejected helper", () => {
  it("should create a rejected output with code and message", () => {
    const result = rejected("TEST_ERROR", "Something went wrong");

    expect(result.status).toBe("rejected");
    expect(result.code).toBe("TEST_ERROR");
    expect(result.message).toBe("Something went wrong");
    expect(result.context).toBeUndefined();
  });

  it("should include context when provided", () => {
    const result = rejected("TEST_ERROR", "Something went wrong", { detail: "extra info" });

    expect(result.status).toBe("rejected");
    expect(result.context).toEqual({ detail: "extra info" });
  });
});

describe("failed helper", () => {
  it("should create a failed output with reason and event", () => {
    const result = failed<TestEvent>("Operation failed", {
      eventType: "TestEvent",
      payload: { testId: "456" },
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("Operation failed");
    expect(result.event.eventType).toBe("TestEvent");
    expect(result.event.payload.testId).toBe("456");
    expect(result.context).toBeUndefined();
  });

  it("should include context when provided", () => {
    const result = failed<TestEvent>(
      "Operation failed",
      { eventType: "TestEvent", payload: { testId: "789" } },
      { attemptNumber: 3 }
    );

    expect(result.status).toBe("failed");
    expect(result.context).toEqual({ attemptNumber: 3 });
  });
});

describe("type guards", () => {
  const successOutput = success<TestEvent, TestData, TestStateUpdate>({
    data: { result: "ok" },
    event: { eventType: "TestEvent", payload: { testId: "123" } },
    stateUpdate: { status: "completed" },
  });

  const rejectedOutput = rejected("TEST_ERROR", "Something went wrong");

  const failedOutput = failed<TestEvent>("Operation failed", {
    eventType: "TestEvent",
    payload: { testId: "456" },
  });

  describe("isSuccess", () => {
    it("should return true for success output", () => {
      expect(isSuccess(successOutput)).toBe(true);
    });

    it("should return false for rejected output", () => {
      expect(isSuccess(rejectedOutput)).toBe(false);
    });

    it("should return false for failed output", () => {
      expect(isSuccess(failedOutput)).toBe(false);
    });

    it("should narrow type correctly", () => {
      const output: DeciderOutput<TestEvent, TestData, TestStateUpdate> = successOutput;
      if (isSuccess(output)) {
        // TypeScript should recognize output.data exists
        expect(output.data.result).toBe("ok");
      }
    });
  });

  describe("isRejected", () => {
    it("should return true for rejected output", () => {
      expect(isRejected(rejectedOutput)).toBe(true);
    });

    it("should return false for success output", () => {
      expect(isRejected(successOutput)).toBe(false);
    });

    it("should return false for failed output", () => {
      expect(isRejected(failedOutput)).toBe(false);
    });

    it("should narrow type correctly", () => {
      const output: DeciderOutput<TestEvent, TestData, TestStateUpdate> = rejectedOutput;
      if (isRejected(output)) {
        // TypeScript should recognize output.code exists
        expect(output.code).toBe("TEST_ERROR");
      }
    });
  });

  describe("isFailed", () => {
    it("should return true for failed output", () => {
      expect(isFailed(failedOutput)).toBe(true);
    });

    it("should return false for success output", () => {
      expect(isFailed(successOutput)).toBe(false);
    });

    it("should return false for rejected output", () => {
      expect(isFailed(rejectedOutput)).toBe(false);
    });

    it("should narrow type correctly", () => {
      const output: DeciderOutput<TestEvent, TestData, TestStateUpdate, TestEvent> = failedOutput;
      if (isFailed(output)) {
        // TypeScript should recognize output.reason exists
        expect(output.reason).toBe("Operation failed");
      }
    });
  });
});

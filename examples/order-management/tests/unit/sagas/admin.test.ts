/**
 * Unit tests for Saga Admin Operations.
 *
 * Tests DB-only logic: query functions and transition validation.
 * Uses convex-test for isolated, fast testing with mocked DB.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { api } from "../../../convex/_generated/api";
import { createUnitTestContext } from "../../support/setup";
import type { Id } from "../../../convex/_generated/dataModel";

// Test context type
type TestContext = ReturnType<typeof createUnitTestContext>;

describe("Saga Admin Operations - Unit Tests", () => {
  let t: TestContext;

  beforeEach(() => {
    t = createUnitTestContext();
  });

  afterEach(() => {
    // Note: finishAllScheduledFunctions requires fake timers which don't work
    // in edge-runtime. The test context is recreated fresh each test anyway.
  });

  // Helper to insert a saga record directly
  async function insertSaga(
    t: TestContext,
    data: {
      sagaType: string;
      sagaId: string;
      status: "pending" | "running" | "completed" | "failed" | "compensating";
      workflowId?: string;
      updatedAt?: number;
      createdAt?: number;
      error?: string;
      completedAt?: number;
    }
  ): Promise<Id<"sagas">> {
    const now = Date.now();
    return await t.run(async (ctx) => {
      return await ctx.db.insert("sagas", {
        sagaType: data.sagaType,
        sagaId: data.sagaId,
        status: data.status,
        workflowId: data.workflowId ?? `wf_${data.sagaId}`,
        triggerEventId: `evt_${data.sagaId}`,
        triggerGlobalPosition: 1,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
        error: data.error,
        completedAt: data.completedAt,
      });
    });
  }

  // ==========================================================================
  // Query Functions - DB-only logic
  // ==========================================================================

  describe("getSagaStats", () => {
    it("returns zero counts for empty database", async () => {
      const result = await t.query(api.sagas.admin.getSagaStats, {
        sagaType: "OrderFulfillment",
      });

      expect(result.pending).toBe(0);
      expect(result.running).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.compensating).toBe(0);
    });

    it("counts sagas by status correctly", async () => {
      // Insert sagas with various statuses
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "1", status: "pending" });
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "2", status: "pending" });
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "3", status: "running" });
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "4", status: "completed" });
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "5", status: "completed" });
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "6", status: "completed" });
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "7", status: "failed" });

      const result = await t.query(api.sagas.admin.getSagaStats, {
        sagaType: "OrderFulfillment",
      });

      expect(result.pending).toBe(2);
      expect(result.running).toBe(1);
      expect(result.completed).toBe(3);
      expect(result.failed).toBe(1);
      expect(result.compensating).toBe(0);
    });

    it("filters by saga type", async () => {
      // Insert sagas of different types
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "1", status: "completed" });
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "2", status: "completed" });
      await insertSaga(t, { sagaType: "PaymentProcessing", sagaId: "3", status: "completed" });

      const orderStats = await t.query(api.sagas.admin.getSagaStats, {
        sagaType: "OrderFulfillment",
      });
      expect(orderStats.completed).toBe(2);

      const paymentStats = await t.query(api.sagas.admin.getSagaStats, {
        sagaType: "PaymentProcessing",
      });
      expect(paymentStats.completed).toBe(1);
    });
  });

  describe("getStuckSagas", () => {
    it("returns empty array when no sagas exist", async () => {
      const result = await t.query(api.sagas.admin.getStuckSagas, {
        sagaType: "OrderFulfillment",
      });

      expect(result).toEqual([]);
    });

    it("returns running sagas older than threshold", async () => {
      const now = Date.now();
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;
      const thirtyMinutesAgo = now - 30 * 60 * 1000;

      // Insert old running saga (stuck)
      await insertSaga(t, {
        sagaType: "OrderFulfillment",
        sagaId: "old-running",
        status: "running",
        updatedAt: twoHoursAgo,
      });

      // Insert recent running saga (not stuck)
      await insertSaga(t, {
        sagaType: "OrderFulfillment",
        sagaId: "recent-running",
        status: "running",
        updatedAt: thirtyMinutesAgo,
      });

      // Insert completed saga (should not be returned)
      await insertSaga(t, {
        sagaType: "OrderFulfillment",
        sagaId: "completed",
        status: "completed",
        updatedAt: twoHoursAgo,
      });

      // Default threshold is 1 hour
      const result = await t.query(api.sagas.admin.getStuckSagas, {
        sagaType: "OrderFulfillment",
      });

      expect(result.length).toBe(1);
      expect(result[0].sagaId).toBe("old-running");
    });

    it("respects custom threshold", async () => {
      const now = Date.now();
      const tenMinutesAgo = now - 10 * 60 * 1000;

      await insertSaga(t, {
        sagaType: "OrderFulfillment",
        sagaId: "ten-min-old",
        status: "running",
        updatedAt: tenMinutesAgo,
      });

      // With 5-minute threshold, should be considered stuck
      const result = await t.query(api.sagas.admin.getStuckSagas, {
        sagaType: "OrderFulfillment",
        thresholdMs: 5 * 60 * 1000,
      });

      expect(result.length).toBe(1);
      expect(result[0].sagaId).toBe("ten-min-old");
    });
  });

  describe("getFailedSagas", () => {
    it("returns empty array when no failed sagas", async () => {
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "1", status: "completed" });

      const result = await t.query(api.sagas.admin.getFailedSagas, {
        sagaType: "OrderFulfillment",
      });

      expect(result).toEqual([]);
    });

    it("returns only failed sagas", async () => {
      await insertSaga(t, {
        sagaType: "OrderFulfillment",
        sagaId: "1",
        status: "failed",
        error: "Error 1",
      });
      await insertSaga(t, {
        sagaType: "OrderFulfillment",
        sagaId: "2",
        status: "failed",
        error: "Error 2",
      });
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "3", status: "completed" });
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "4", status: "running" });

      const result = await t.query(api.sagas.admin.getFailedSagas, {
        sagaType: "OrderFulfillment",
      });

      expect(result.length).toBe(2);
      expect(result.map((s) => s.sagaId).sort()).toEqual(["1", "2"]);
    });

    it("respects limit parameter", async () => {
      // Insert 5 failed sagas
      for (let i = 1; i <= 5; i++) {
        await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: `${i}`, status: "failed" });
      }

      const result = await t.query(api.sagas.admin.getFailedSagas, {
        sagaType: "OrderFulfillment",
        limit: 3,
      });

      expect(result.length).toBe(3);
    });
  });

  // ==========================================================================
  // Mutation Validation - State Transition Tests
  // ==========================================================================

  describe("markSagaFailed - transition validation", () => {
    it("allows marking pending saga as failed", async () => {
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "test", status: "pending" });

      const result = await t.mutation(api.sagas.admin.markSagaFailed, {
        sagaType: "OrderFulfillment",
        sagaId: "test",
        reason: "Admin intervention",
      });

      expect(result.status).toBe("marked_failed");
    });

    it("allows marking running saga as failed", async () => {
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "test", status: "running" });

      const result = await t.mutation(api.sagas.admin.markSagaFailed, {
        sagaType: "OrderFulfillment",
        sagaId: "test",
        reason: "Stuck saga",
      });

      expect(result.status).toBe("marked_failed");
    });

    it("allows marking compensating saga as failed", async () => {
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "test", status: "compensating" });

      const result = await t.mutation(api.sagas.admin.markSagaFailed, {
        sagaType: "OrderFulfillment",
        sagaId: "test",
        reason: "Compensation stuck",
      });

      expect(result.status).toBe("marked_failed");
    });

    it("rejects marking completed saga as failed", async () => {
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "test", status: "completed" });

      const result = await t.mutation(api.sagas.admin.markSagaFailed, {
        sagaType: "OrderFulfillment",
        sagaId: "test",
        reason: "Should not work",
      });

      expect(result.status).toBe("invalid_transition");
      expect(result.currentStatus).toBe("completed");
    });

    it("rejects marking already failed saga as failed", async () => {
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "test", status: "failed" });

      const result = await t.mutation(api.sagas.admin.markSagaFailed, {
        sagaType: "OrderFulfillment",
        sagaId: "test",
        reason: "Already failed",
      });

      expect(result.status).toBe("invalid_transition");
      expect(result.currentStatus).toBe("failed");
    });

    it("returns not_found for non-existent saga", async () => {
      const result = await t.mutation(api.sagas.admin.markSagaFailed, {
        sagaType: "OrderFulfillment",
        sagaId: "nonexistent",
        reason: "Should not work",
      });

      expect(result.status).toBe("not_found");
    });
  });

  describe("markSagaCompensated - transition validation", () => {
    it("allows marking failed saga as compensated", async () => {
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "test", status: "failed" });

      const result = await t.mutation(api.sagas.admin.markSagaCompensated, {
        sagaType: "OrderFulfillment",
        sagaId: "test",
      });

      expect(result.status).toBe("marked_compensated");
    });

    it("rejects marking non-failed saga as compensated", async () => {
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "test", status: "running" });

      const result = await t.mutation(api.sagas.admin.markSagaCompensated, {
        sagaType: "OrderFulfillment",
        sagaId: "test",
      });

      expect(result.status).toBe("invalid_transition");
      expect(result.currentStatus).toBe("running");
    });
  });

  describe("retrySaga - transition validation", () => {
    it("allows retrying failed saga", async () => {
      await insertSaga(t, {
        sagaType: "OrderFulfillment",
        sagaId: "test",
        status: "failed",
        error: "Previous error",
      });

      const result = await t.mutation(api.sagas.admin.retrySaga, {
        sagaType: "OrderFulfillment",
        sagaId: "test",
      });

      expect(result.status).toBe("reset_to_pending");
    });

    it("rejects retrying non-failed saga", async () => {
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "test", status: "running" });

      const result = await t.mutation(api.sagas.admin.retrySaga, {
        sagaType: "OrderFulfillment",
        sagaId: "test",
      });

      expect(result.status).toBe("invalid_state");
      expect(result.currentStatus).toBe("running");
    });

    it("rejects retrying completed saga", async () => {
      await insertSaga(t, { sagaType: "OrderFulfillment", sagaId: "test", status: "completed" });

      const result = await t.mutation(api.sagas.admin.retrySaga, {
        sagaType: "OrderFulfillment",
        sagaId: "test",
      });

      expect(result.status).toBe("invalid_state");
      expect(result.currentStatus).toBe("completed");
    });
  });
});

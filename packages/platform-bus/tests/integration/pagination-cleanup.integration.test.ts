import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";

import { api } from "../../../../examples/order-management/convex/_generated/api";
import {
  generateCommandId,
  generateCorrelationId,
  testMutation,
  testQuery,
} from "../support/helpers";

describe("CommandBus pagination and cleanup", () => {
  let t: ConvexTestingHelper;

  beforeEach(() => {
    t = new ConvexTestingHelper({
      backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
    });
  });

  afterEach(async () => {
    await t.close();
  });

  it("paginates commands by correlation with a stable cursor", async () => {
    const correlationId = generateCorrelationId();
    const baseTimestamp = Date.now() - 10_000;

    for (let index = 0; index < 3; index += 1) {
      const commandId = generateCommandId(`page_${index}`);
      await testMutation(t, api.testingFunctions.recordCommand, {
        commandId,
        commandType: "CreateOrder",
        targetContext: "orders",
        payload: { orderId: `ord_${index}` },
        metadata: {
          correlationId,
          timestamp: baseTimestamp + index,
        },
        ttl: 60_000,
      });

      await testMutation(t, api.testingFunctions.updateCommandResult, {
        commandId,
        status: "executed",
        result: { ok: true },
      });
    }

    const firstPage = await testQuery(t, api.testingFunctions.getCommandsByCorrelation, {
      correlationId,
      limit: 2,
    });

    expect(firstPage.commands).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(firstPage.commands[0]).not.toHaveProperty("result");

    const secondPage = await testQuery(t, api.testingFunctions.getCommandsByCorrelation, {
      correlationId,
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(secondPage.commands).toHaveLength(1);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("cleans up expired rows in bounded batches and reports hasMore", async () => {
    const correlationId = generateCorrelationId();
    const expiredTimestamp = Date.now() - 60_000;

    for (let index = 0; index < 2; index += 1) {
      const commandId = generateCommandId(`cleanup_${index}`);
      await testMutation(t, api.testingFunctions.recordCommand, {
        commandId,
        commandType: "CreateOrder",
        targetContext: "orders",
        payload: { orderId: `ord_cleanup_${index}` },
        metadata: {
          correlationId,
          timestamp: expiredTimestamp + index,
        },
        ttl: 1,
      });

      await testMutation(t, api.testingFunctions.updateCommandResult, {
        commandId,
        status: "executed",
        result: { ok: true },
      });

      await testMutation(t, api.testingFunctions.recordCommandEventCorrelationForTest, {
        commandId,
        eventIds: [`evt_cleanup_${index}`],
        commandType: "CreateOrder",
        boundedContext: "orders",
        ttl: 1,
      });
    }

    const firstCleanup = await testMutation(t, api.testingFunctions.cleanupExpiredCommandBusEntries, {
      batchSize: 1,
    });

    expect(firstCleanup.commands).toBe(1);
    expect(firstCleanup.correlations).toBe(1);
    expect(firstCleanup.hasMore).toBe(true);

    const secondCleanup = await testMutation(t, api.testingFunctions.cleanupExpiredCommandBusEntries, {
      batchSize: 1,
    });

    expect(secondCleanup.commands).toBe(1);
    expect(secondCleanup.correlations).toBe(1);
    expect(secondCleanup.hasMore).toBe(false);
  });
});

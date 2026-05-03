import { describe, expect, it, vi } from "vitest";
import type { FunctionReference, FunctionVisibility } from "convex/server";

import { CommandOrchestrator } from "../../src/orchestration/CommandOrchestrator.js";
import { ConvexEventBus } from "../../src/eventbus/ConvexEventBus.js";
import { createMiddlewarePipeline } from "../../src/middleware/MiddlewarePipeline.js";
import { createConsoleMetrics, createPlatformNoOpMetrics } from "../../src/metrics/index.js";
import { defineSubscriptions } from "../../src/eventbus/registry.js";
import type {
  CommandBusClient,
  CommandConfig,
  CommandHandlerResult,
  CommandHandlerSuccess,
  EventStoreClient,
  MutationCtx,
  WorkpoolClient,
} from "../../src/orchestration/types.js";
import type { PlatformMetrics } from "../../src/metrics/index.js";
import type { PublishedEvent } from "../../src/eventbus/types.js";
import type { SafeMutationRef } from "../../src/function-refs/types.js";
import { toCommandId, toCorrelationId, toCausationId, toEventId, toStreamId } from "../../src/ids/index.js";
import type { UnknownRecord } from "../../src/types.js";

function createMockMetrics(): PlatformMetrics & {
  calls: Array<{ type: string; name: string; value: number }>;
} {
  const calls: Array<{ type: string; name: string; value: number }> = [];
  return {
    calls,
    counter(name, value = 1) {
      calls.push({ type: "counter", name, value });
    },
    histogram(name, value) {
      calls.push({ type: "histogram", name, value });
    },
    gauge(name, value) {
      calls.push({ type: "gauge", name, value });
    },
  };
}

function createMockWorkpool(): WorkpoolClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async enqueueMutation(ctx, handler, args, options) {
      calls.push([ctx, handler, args, options]);
      return null;
    },
    async enqueueAction() {
      return null;
    },
  };
}

function createMockCommandBus(): CommandBusClient {
  return {
    async recordCommand() {
      return { status: "new" as const };
    },
    async updateCommandResult() {
      return true;
    },
  };
}

function createMockEventStore(): EventStoreClient {
  return {
    async appendToStream() {
      return { status: "success" as const, globalPositions: [100n] };
    },
  };
}

const mockHandler = { name: "mockHandler" } as unknown as FunctionReference<
  "mutation",
  FunctionVisibility,
  { orderId: string; commandId: string; correlationId: string },
  CommandHandlerResult<{ orderId: string }>
>;

const mockProjectionHandler = { name: "mockProjectionHandler" } as unknown as FunctionReference<
  "mutation",
  FunctionVisibility,
  UnknownRecord,
  unknown
>;

const mockSubscriptionHandler = { name: "subscriptionHandler" } as unknown as FunctionReference<
  "mutation",
  FunctionVisibility,
  Record<string, unknown>,
  unknown
>;

function createMockCtx(handlerResult: CommandHandlerResult<{ orderId: string }>): MutationCtx {
  return {
    runMutation: async (ref: SafeMutationRef) => {
      if (ref === mockHandler) {
        return handlerResult;
      }
      return null;
    },
    runQuery: async () => null,
    runAction: async () => null,
    db: {} as MutationCtx["db"],
    auth: {} as MutationCtx["auth"],
    scheduler: {} as MutationCtx["scheduler"],
    storage: {} as MutationCtx["storage"],
  } as unknown as MutationCtx;
}

function createSuccessResult(): CommandHandlerSuccess<{ orderId: string }> {
  return {
    status: "success",
    data: { orderId: "ord_123" },
    version: 1,
    event: {
      eventId: toEventId("evt_test_1"),
      eventType: "OrderCreated",
      streamType: "Order",
      streamId: toStreamId("ord_123"),
      payload: { orderId: "ord_123" },
      metadata: {
        correlationId: toCorrelationId("corr_1"),
        causationId: toCausationId("cmd_1"),
      },
    },
  };
}

describe("observability primitives", () => {
  it("CommandOrchestrator emits command.duration for every execution", async () => {
    const metrics = createMockMetrics();
    const projectionPool = createMockWorkpool();
    const fanoutPool = createMockWorkpool();
    const sagaPool = createMockWorkpool();

    const orchestrator = new CommandOrchestrator({
      eventStore: createMockEventStore(),
      commandBus: createMockCommandBus(),
      projectionPool,
      fanoutPool,
      sagaPool,
      middlewarePipeline: createMiddlewarePipeline(),
      metrics,
    });

    const config: CommandConfig<
      { orderId: string },
      { orderId: string; commandId: string; correlationId: string },
      CommandHandlerResult<{ orderId: string }>,
      UnknownRecord,
      { orderId: string }
    > = {
      commandType: "CreateOrder",
      boundedContext: "orders",
      handler: mockHandler,
      toHandlerArgs: (args, commandId, correlationId) => ({
        orderId: args.orderId,
        commandId,
        correlationId,
      }),
      projection: {
        handler: mockProjectionHandler,
        projectionName: "orderSummary",
        toProjectionArgs: () => ({ orderId: "ord_123" }),
        getPartitionKey: () => ({ name: "orderId", value: "ord_123" }),
      },
    };

    await orchestrator.execute(createMockCtx(createSuccessResult()), config, {
      orderId: "ord_123",
    });

    expect(
      metrics.calls.some((call) => call.type === "histogram" && call.name === "command.duration")
    ).toBe(true);
  });

  it("CommandOrchestrator rejects secondary projection fan-out above 50", async () => {
    const orchestrator = new CommandOrchestrator({
      eventStore: createMockEventStore(),
      commandBus: createMockCommandBus(),
      projectionPool: createMockWorkpool(),
      fanoutPool: createMockWorkpool(),
      sagaPool: createMockWorkpool(),
      middlewarePipeline: createMiddlewarePipeline(),
      metrics: createMockMetrics(),
    });

    const config: CommandConfig<
      { orderId: string },
      { orderId: string; commandId: string; correlationId: string },
      CommandHandlerResult<{ orderId: string }>,
      UnknownRecord,
      { orderId: string }
    > = {
      commandType: "CreateOrder",
      boundedContext: "orders",
      handler: mockHandler,
      toHandlerArgs: (args, commandId, correlationId) => ({
        orderId: args.orderId,
        commandId,
        correlationId,
      }),
      projection: {
        handler: mockProjectionHandler,
        projectionName: "orderSummary",
        toProjectionArgs: () => ({ orderId: "ord_123" }),
        getPartitionKey: () => ({ name: "orderId", value: "ord_123" }),
      },
      secondaryProjections: Array.from({ length: 51 }, (_, index) => ({
        handler: mockProjectionHandler,
        projectionName: `secondary-${index}`,
        toProjectionArgs: () => ({ orderId: "ord_123" }),
        getPartitionKey: () => ({ name: "orderId", value: `ord_${index}` }),
      })),
    };

    const result = await orchestrator.execute(createMockCtx(createSuccessResult()), config, {
      orderId: "ord_123",
    });

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toMatch(/Maximum supported fan-out is 50/);
    }
  });

  it("ConvexEventBus emits event.dispatched metrics", async () => {
    const metrics = createMockMetrics();
    const workpool = createMockWorkpool();
    const subscriptions = defineSubscriptions((registry) => {
      registry
        .subscribe("order.handler", mockSubscriptionHandler)
        .forEventTypes("OrderSubmitted")
        .build();
    });

    const bus = new ConvexEventBus(workpool, subscriptions, { metrics });
    const event: PublishedEvent = {
      eventId: "evt_1",
      eventType: "OrderSubmitted",
      streamType: "Order",
      streamId: "ord_123",
      category: "domain",
      schemaVersion: 1,
      boundedContext: "orders",
      globalPosition: 1n,
      timestamp: Date.now(),
      payload: { orderId: "ord_123" },
      correlation: { correlationId: "corr_1", causationId: "cmd_1" },
    };

    await bus.publish({} as MutationCtx, event, {
      commandId: toCommandId("cmd_1"),
      correlationId: toCorrelationId("corr_1"),
      causationId: toCausationId("cmd_1"),
      initiatedAt: Date.now(),
    });

    expect(
      metrics.calls.some((call) => call.type === "counter" && call.name === "event.dispatched")
    ).toBe(true);
  });

  it("console metrics adapter writes structured output", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const metrics = createConsoleMetrics("TestMetrics");

    metrics.counter("event.dispatched", 2, { boundedContext: "orders" });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(String(infoSpy.mock.calls[0]?.[0])).toContain("event.dispatched");

    infoSpy.mockRestore();
  });

  it("no-op metrics remain side-effect free", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const metrics = createPlatformNoOpMetrics();

    metrics.counter("event.dispatched", 1);
    metrics.histogram("command.duration", 10);
    metrics.gauge("queue.depth", 3);

    expect(infoSpy).not.toHaveBeenCalled();
    infoSpy.mockRestore();
  });
});

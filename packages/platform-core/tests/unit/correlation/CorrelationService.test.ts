/**
 * Unit Tests for CorrelationService
 *
 * Tests the command-event correlation tracking service.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CorrelationService,
  createCorrelationService,
  type CorrelationCommandBusClient,
  type CommandEventCorrelation,
} from "../../../src/correlation/CorrelationService";

// Mock command bus client factory
function createMockClient(
  data: Map<string, CommandEventCorrelation> = new Map()
): CorrelationCommandBusClient {
  return {
    recordCommandEventCorrelation: vi.fn(async (args) => {
      const existing = data.get(args.commandId);
      if (existing) {
        // Merge event IDs
        const existingIds = new Set(existing.eventIds);
        for (const id of args.eventIds) {
          existingIds.add(id);
        }
        existing.eventIds = Array.from(existingIds);
      } else {
        data.set(args.commandId, {
          commandId: args.commandId,
          eventIds: args.eventIds,
          commandType: args.commandType,
          boundedContext: args.boundedContext,
          createdAt: Date.now(),
        });
      }
      return true;
    }),

    getEventsByCommandId: vi.fn(async (args) => {
      return data.get(args.commandId) ?? null;
    }),

    getCorrelationsByContext: vi.fn(async (args) => {
      return Array.from(data.values())
        .filter((c) => c.boundedContext === args.boundedContext)
        .filter((c) => args.afterTimestamp === undefined || c.createdAt > args.afterTimestamp)
        .slice(0, args.limit ?? 100);
    }),
  };
}

describe("CorrelationService", () => {
  let client: CorrelationCommandBusClient;
  let service: CorrelationService;
  let dataStore: Map<string, CommandEventCorrelation>;

  beforeEach(() => {
    dataStore = new Map();
    client = createMockClient(dataStore);
    service = new CorrelationService(client);
  });

  describe("recordCorrelation", () => {
    it("records a new correlation", async () => {
      const result = await service.recordCorrelation({
        commandId: "cmd_123",
        eventIds: ["evt_456"],
        commandType: "CreateOrder",
        boundedContext: "orders",
      });

      expect(result).toBe(true);
      expect(client.recordCommandEventCorrelation).toHaveBeenCalledWith({
        commandId: "cmd_123",
        eventIds: ["evt_456"],
        commandType: "CreateOrder",
        boundedContext: "orders",
      });
    });

    it("merges event IDs for existing correlation", async () => {
      // Record first correlation
      await service.recordCorrelation({
        commandId: "cmd_123",
        eventIds: ["evt_1"],
        commandType: "CreateOrder",
        boundedContext: "orders",
      });

      // Record second with same command ID
      await service.recordCorrelation({
        commandId: "cmd_123",
        eventIds: ["evt_2"],
        commandType: "CreateOrder",
        boundedContext: "orders",
      });

      // Check merged result
      const correlation = await service.getEventsByCommand("cmd_123");
      expect(correlation?.eventIds).toContain("evt_1");
      expect(correlation?.eventIds).toContain("evt_2");
    });
  });

  describe("getEventsByCommand", () => {
    it("returns null for non-existent command", async () => {
      const result = await service.getEventsByCommand("cmd_nonexistent");
      expect(result).toBeNull();
    });

    it("returns correlation for existing command", async () => {
      await service.recordCorrelation({
        commandId: "cmd_123",
        eventIds: ["evt_456", "evt_789"],
        commandType: "CreateOrder",
        boundedContext: "orders",
      });

      const result = await service.getEventsByCommand("cmd_123");

      expect(result).not.toBeNull();
      expect(result?.commandId).toBe("cmd_123");
      expect(result?.eventIds).toEqual(["evt_456", "evt_789"]);
      expect(result?.commandType).toBe("CreateOrder");
      expect(result?.boundedContext).toBe("orders");
    });
  });

  describe("getCorrelationsByContext", () => {
    beforeEach(async () => {
      // Seed data
      await service.recordCorrelation({
        commandId: "cmd_1",
        eventIds: ["evt_1"],
        commandType: "CreateOrder",
        boundedContext: "orders",
      });
      await service.recordCorrelation({
        commandId: "cmd_2",
        eventIds: ["evt_2"],
        commandType: "ReserveStock",
        boundedContext: "inventory",
      });
      await service.recordCorrelation({
        commandId: "cmd_3",
        eventIds: ["evt_3"],
        commandType: "AddOrderItem",
        boundedContext: "orders",
      });
    });

    it("filters by bounded context", async () => {
      const result = await service.getCorrelationsByContext({
        boundedContext: "orders",
      });

      expect(result.length).toBe(2);
      expect(result.every((c) => c.boundedContext === "orders")).toBe(true);
    });

    it("throws when boundedContext is missing", async () => {
      await expect(service.getCorrelationsByContext({})).rejects.toThrow(
        "boundedContext is required"
      );
    });

    it("respects limit parameter", async () => {
      const result = await service.getCorrelationsByContext({
        boundedContext: "orders",
        limit: 1,
      });

      expect(result.length).toBe(1);
    });
  });

  describe("hasCorrelation", () => {
    it("returns true for command with events", async () => {
      await service.recordCorrelation({
        commandId: "cmd_123",
        eventIds: ["evt_456"],
        commandType: "CreateOrder",
        boundedContext: "orders",
      });

      const result = await service.hasCorrelation("cmd_123");
      expect(result).toBe(true);
    });

    it("returns false for non-existent command", async () => {
      const result = await service.hasCorrelation("cmd_nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("getEventCount", () => {
    it("returns event count for existing command", async () => {
      await service.recordCorrelation({
        commandId: "cmd_123",
        eventIds: ["evt_1", "evt_2", "evt_3"],
        commandType: "CreateOrder",
        boundedContext: "orders",
      });

      const count = await service.getEventCount("cmd_123");
      expect(count).toBe(3);
    });

    it("returns 0 for non-existent command", async () => {
      const count = await service.getEventCount("cmd_nonexistent");
      expect(count).toBe(0);
    });
  });
});

describe("createCorrelationService", () => {
  it("creates a CorrelationService instance", () => {
    const client = createMockClient();
    const service = createCorrelationService(client);
    expect(service).toBeInstanceOf(CorrelationService);
  });
});

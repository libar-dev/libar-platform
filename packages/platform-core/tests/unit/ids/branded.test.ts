/**
 * Unit tests for branded ID types.
 *
 * Branded types provide compile-time safety by making IDs nominally distinct.
 * At runtime, they're still strings with zero overhead.
 */
import { describe, it, expect } from "vitest";
import {
  toCommandId,
  toCorrelationId,
  toCausationId,
  toEventId,
  toStreamId,
  isValidIdString,
  type CommandId,
  type CorrelationId,
  type CausationId,
  type EventId,
  type StreamId,
} from "../../../src/ids/branded.js";
import {
  generateCommandId,
  generateCorrelationId,
  generateEventId,
  generateIntegrationEventId,
} from "../../../src/ids/generator.js";

describe("Branded Types", () => {
  describe("Factory Functions", () => {
    it("toCommandId creates CommandId from string", () => {
      const cmdId = toCommandId("cmd_test123");
      expect(cmdId).toBe("cmd_test123");
      // Type assertion - ensures TypeScript recognizes the branded type
      const _typeCheck: CommandId = cmdId;
      expect(_typeCheck).toBe(cmdId);
    });

    it("toCorrelationId creates CorrelationId from string", () => {
      const corrId = toCorrelationId("corr_test456");
      expect(corrId).toBe("corr_test456");
      const _typeCheck: CorrelationId = corrId;
      expect(_typeCheck).toBe(corrId);
    });

    it("toCausationId creates CausationId from string", () => {
      const causId = toCausationId("cmd_test789");
      expect(causId).toBe("cmd_test789");
      const _typeCheck: CausationId = causId;
      expect(_typeCheck).toBe(causId);
    });

    it("toEventId creates EventId from string", () => {
      const evtId = toEventId("orders_event_abc");
      expect(evtId).toBe("orders_event_abc");
      const _typeCheck: EventId = evtId;
      expect(_typeCheck).toBe(evtId);
    });

    it("toStreamId creates StreamId from string", () => {
      const streamId = toStreamId("Order-123");
      expect(streamId).toBe("Order-123");
      const _typeCheck: StreamId = streamId;
      expect(_typeCheck).toBe(streamId);
    });
  });

  describe("String Compatibility", () => {
    it("branded types are assignable to string", () => {
      const cmdId: CommandId = toCommandId("cmd_test");
      const corrId: CorrelationId = toCorrelationId("corr_test");
      const causId: CausationId = toCausationId("cause_test");
      const evtId: EventId = toEventId("evt_test");
      const streamId: StreamId = toStreamId("stream_test");

      // All branded types should be usable as strings
      const str1: string = cmdId;
      const str2: string = corrId;
      const str3: string = causId;
      const str4: string = evtId;
      const str5: string = streamId;

      expect(str1).toBe("cmd_test");
      expect(str2).toBe("corr_test");
      expect(str3).toBe("cause_test");
      expect(str4).toBe("evt_test");
      expect(str5).toBe("stream_test");
    });

    it("branded types work with string methods", () => {
      const cmdId = toCommandId("cmd_TEST_123");
      expect(cmdId.toLowerCase()).toBe("cmd_test_123");
      expect(cmdId.startsWith("cmd_")).toBe(true);
      expect(cmdId.length).toBe(12);
    });
  });

  describe("Generator Integration", () => {
    it("generateCommandId returns CommandId branded type", () => {
      const cmdId: CommandId = generateCommandId();
      expect(cmdId).toMatch(/^cmd_/);
      // Verify it's a valid UUID v7 format after prefix
      const uuid = cmdId.slice(4);
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("generateCorrelationId returns CorrelationId branded type", () => {
      const corrId: CorrelationId = generateCorrelationId();
      expect(corrId).toMatch(/^corr_/);
      const uuid = corrId.slice(5);
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("generateEventId returns EventId branded type", () => {
      const evtId: EventId = generateEventId("orders");
      expect(evtId).toMatch(/^orders_event_/);
    });

    it("generateIntegrationEventId returns EventId branded type", () => {
      const intEvtId: EventId = generateIntegrationEventId();
      expect(intEvtId).toMatch(/^int_evt_/);
    });
  });

  describe("isValidIdString Type Guard", () => {
    it("returns true for non-empty strings", () => {
      expect(isValidIdString("cmd_123")).toBe(true);
      expect(isValidIdString("a")).toBe(true);
      expect(isValidIdString("any-string-value")).toBe(true);
    });

    it("returns false for empty strings", () => {
      expect(isValidIdString("")).toBe(false);
    });

    it("returns false for non-string values", () => {
      expect(isValidIdString(null)).toBe(false);
      expect(isValidIdString(undefined)).toBe(false);
      expect(isValidIdString(123)).toBe(false);
      expect(isValidIdString({})).toBe(false);
      expect(isValidIdString([])).toBe(false);
    });

    it("narrows type correctly", () => {
      const value: unknown = "test_id";
      if (isValidIdString(value)) {
        // TypeScript should recognize value as string here
        const str: string = value;
        expect(str.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Unique ID Generation", () => {
    it("generates unique CommandIds", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCommandId());
      }
      expect(ids.size).toBe(100);
    });

    it("generates unique CorrelationIds", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(100);
    });
  });
});

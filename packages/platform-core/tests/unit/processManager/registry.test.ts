/**
 * Unit tests for ProcessManagerRegistry.
 *
 * Tests the process manager registry CRUD operations and lookup capabilities.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createProcessManagerRegistry } from "../../../src/processManager/registry";
import { defineProcessManager } from "@libar-dev/platform-bc";

describe("ProcessManagerRegistry", () => {
  // Test process manager definitions
  const orderNotificationPM = defineProcessManager({
    processManagerName: "orderNotification",
    description: "Sends notification when order is confirmed",
    triggerType: "event",
    eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
    emitsCommands: ["SendNotification", "LogActivity"],
    context: "orders",
  });

  const reservationExpirationPM = defineProcessManager({
    processManagerName: "reservationExpiration",
    description: "Releases expired reservations on a schedule",
    triggerType: "time",
    eventSubscriptions: [] as const,
    emitsCommands: ["ReleaseReservation"],
    context: "inventory",
    cronConfig: {
      interval: { minutes: 5 },
      scheduleDescription: "Every 5 minutes",
    },
  });

  const orderFulfillmentPM = defineProcessManager({
    processManagerName: "orderFulfillment",
    description: "Handles order fulfillment with time and events",
    triggerType: "hybrid",
    eventSubscriptions: ["OrderPaid", "ShipmentReady"] as const,
    emitsCommands: ["CreateShipment", "NotifyWarehouse"],
    context: "orders",
    correlationStrategy: { correlationProperty: "orderId" },
    cronConfig: {
      interval: { hours: 1 },
      scheduleDescription: "Every hour",
    },
  });

  describe("register", () => {
    it("registers a process manager definition", () => {
      const registry = createProcessManagerRegistry();

      registry.register(orderNotificationPM);

      expect(registry.has("orderNotification")).toBe(true);
      expect(registry.size).toBe(1);
    });

    it("registers multiple process managers", () => {
      const registry = createProcessManagerRegistry();

      registry.register(orderNotificationPM);
      registry.register(reservationExpirationPM);
      registry.register(orderFulfillmentPM);

      expect(registry.size).toBe(3);
    });

    it("throws when registering duplicate PM name", () => {
      const registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);

      expect(() => registry.register(orderNotificationPM)).toThrow(
        'Process manager "orderNotification" is already registered'
      );
    });
  });

  describe("get", () => {
    let registry: ReturnType<typeof createProcessManagerRegistry>;

    beforeEach(() => {
      registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);
      registry.register(reservationExpirationPM);
    });

    it("returns PM by name", () => {
      const pm = registry.get("orderNotification");

      expect(pm).toBeDefined();
      expect(pm?.processManagerName).toBe("orderNotification");
      expect(pm?.triggerType).toBe("event");
    });

    it("returns undefined for unknown PM", () => {
      const pm = registry.get("unknownPM");

      expect(pm).toBeUndefined();
    });
  });

  describe("has", () => {
    it("returns true for registered PM", () => {
      const registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);

      expect(registry.has("orderNotification")).toBe(true);
    });

    it("returns false for unregistered PM", () => {
      const registry = createProcessManagerRegistry();

      expect(registry.has("unknownPM")).toBe(false);
    });
  });

  describe("list", () => {
    it("returns empty array for empty registry", () => {
      const registry = createProcessManagerRegistry();

      expect(registry.list()).toEqual([]);
    });

    it("returns all registered PMs", () => {
      const registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);
      registry.register(reservationExpirationPM);

      const all = registry.list();

      expect(all).toHaveLength(2);
      expect(all.map((pm) => pm.processManagerName)).toContain("orderNotification");
      expect(all.map((pm) => pm.processManagerName)).toContain("reservationExpiration");
    });
  });

  describe("size", () => {
    it("returns 0 for empty registry", () => {
      const registry = createProcessManagerRegistry();

      expect(registry.size).toBe(0);
    });

    it("returns correct count after registrations", () => {
      const registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);
      registry.register(reservationExpirationPM);

      expect(registry.size).toBe(2);
    });
  });

  describe("getByTriggerEvent", () => {
    let registry: ReturnType<typeof createProcessManagerRegistry>;

    beforeEach(() => {
      registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);
      registry.register(reservationExpirationPM);
      registry.register(orderFulfillmentPM);
    });

    it("returns PMs that subscribe to event type", () => {
      const pms = registry.getByTriggerEvent("OrderConfirmed");

      expect(pms).toHaveLength(1);
      expect(pms[0].processManagerName).toBe("orderNotification");
    });

    it("returns multiple PMs for shared event", () => {
      // OrderShipped is only subscribed by orderNotificationPM
      const pms = registry.getByTriggerEvent("OrderPaid");

      expect(pms).toHaveLength(1);
      expect(pms.map((pm) => pm.processManagerName)).toContain("orderFulfillment");
    });

    it("returns empty array for unknown event type", () => {
      const pms = registry.getByTriggerEvent("UnknownEvent");

      expect(pms).toEqual([]);
    });

    it("returns empty array for time-triggered PM with no event subscriptions", () => {
      // reservationExpirationPM has no event subscriptions
      const pms = registry.getByTriggerEvent("ReleaseReservation");

      expect(pms).toEqual([]);
    });
  });

  describe("getAllTriggerEvents", () => {
    it("returns empty array for empty registry", () => {
      const registry = createProcessManagerRegistry();

      expect(registry.getAllTriggerEvents()).toEqual([]);
    });

    it("returns unique sorted event types", () => {
      const registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);
      registry.register(orderFulfillmentPM);

      const eventTypes = registry.getAllTriggerEvents();

      // Should be sorted
      const sorted = [...eventTypes].sort();
      expect(eventTypes).toEqual(sorted);

      // Should be unique
      expect(new Set(eventTypes).size).toBe(eventTypes.length);

      // Should include all event types
      expect(eventTypes).toContain("OrderConfirmed");
      expect(eventTypes).toContain("OrderShipped");
      expect(eventTypes).toContain("OrderPaid");
      expect(eventTypes).toContain("ShipmentReady");
    });
  });

  describe("getAllEmittedCommands", () => {
    it("returns empty array for empty registry", () => {
      const registry = createProcessManagerRegistry();

      expect(registry.getAllEmittedCommands()).toEqual([]);
    });

    it("returns unique sorted command types", () => {
      const registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);
      registry.register(reservationExpirationPM);
      registry.register(orderFulfillmentPM);

      const commandTypes = registry.getAllEmittedCommands();

      // Should be sorted
      const sorted = [...commandTypes].sort();
      expect(commandTypes).toEqual(sorted);

      // Should be unique
      expect(new Set(commandTypes).size).toBe(commandTypes.length);

      // Should include all command types
      expect(commandTypes).toContain("SendNotification");
      expect(commandTypes).toContain("LogActivity");
      expect(commandTypes).toContain("ReleaseReservation");
      expect(commandTypes).toContain("CreateShipment");
      expect(commandTypes).toContain("NotifyWarehouse");
    });
  });

  describe("getByContext", () => {
    let registry: ReturnType<typeof createProcessManagerRegistry>;

    beforeEach(() => {
      registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);
      registry.register(reservationExpirationPM);
      registry.register(orderFulfillmentPM);
    });

    it("filters by orders context", () => {
      const pms = registry.getByContext("orders");

      expect(pms).toHaveLength(2);
      expect(pms.map((pm) => pm.processManagerName)).toContain("orderNotification");
      expect(pms.map((pm) => pm.processManagerName)).toContain("orderFulfillment");
    });

    it("filters by inventory context", () => {
      const pms = registry.getByContext("inventory");

      expect(pms).toHaveLength(1);
      expect(pms[0].processManagerName).toBe("reservationExpiration");
    });

    it("returns empty array for unknown context", () => {
      const pms = registry.getByContext("unknown");

      expect(pms).toEqual([]);
    });
  });

  describe("getByTriggerType", () => {
    let registry: ReturnType<typeof createProcessManagerRegistry>;

    beforeEach(() => {
      registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);
      registry.register(reservationExpirationPM);
      registry.register(orderFulfillmentPM);
    });

    it("filters by event trigger type", () => {
      const pms = registry.getByTriggerType("event");

      expect(pms).toHaveLength(1);
      expect(pms[0].processManagerName).toBe("orderNotification");
    });

    it("filters by time trigger type", () => {
      const pms = registry.getByTriggerType("time");

      expect(pms).toHaveLength(1);
      expect(pms[0].processManagerName).toBe("reservationExpiration");
    });

    it("filters by hybrid trigger type", () => {
      const pms = registry.getByTriggerType("hybrid");

      expect(pms).toHaveLength(1);
      expect(pms[0].processManagerName).toBe("orderFulfillment");
    });
  });

  describe("getTimeTriggeredPMs", () => {
    let registry: ReturnType<typeof createProcessManagerRegistry>;

    beforeEach(() => {
      registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);
      registry.register(reservationExpirationPM);
      registry.register(orderFulfillmentPM);
    });

    it("returns time and hybrid triggered PMs", () => {
      const pms = registry.getTimeTriggeredPMs();

      expect(pms).toHaveLength(2);
      expect(pms.map((pm) => pm.processManagerName)).toContain("reservationExpiration");
      expect(pms.map((pm) => pm.processManagerName)).toContain("orderFulfillment");
    });

    it("excludes event-only triggered PMs", () => {
      const pms = registry.getTimeTriggeredPMs();

      expect(pms.map((pm) => pm.processManagerName)).not.toContain("orderNotification");
    });

    it("all returned PMs have cronConfig", () => {
      const pms = registry.getTimeTriggeredPMs();

      pms.forEach((pm) => {
        expect(pm.cronConfig).toBeDefined();
        expect(pm.cronConfig?.scheduleDescription).toBeDefined();
      });
    });
  });

  describe("Use Case: Event Routing", () => {
    it("can find all handlers for an event", () => {
      const registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);
      registry.register(orderFulfillmentPM);

      // Simulate routing an OrderShipped event
      const handlers = registry.getByTriggerEvent("OrderShipped");

      expect(handlers).toHaveLength(1);
      expect(handlers[0].processManagerName).toBe("orderNotification");
    });
  });

  describe("Use Case: Cron Setup", () => {
    it("can get all time-triggered PMs for cron scheduling", () => {
      const registry = createProcessManagerRegistry();
      registry.register(orderNotificationPM);
      registry.register(reservationExpirationPM);
      registry.register(orderFulfillmentPM);

      const cronPMs = registry.getTimeTriggeredPMs();

      expect(cronPMs).toHaveLength(2);

      // Each should have cron config
      cronPMs.forEach((pm) => {
        expect(pm.cronConfig).toBeDefined();
        if (pm.cronConfig?.interval.minutes) {
          expect(pm.cronConfig.interval.minutes).toBeGreaterThan(0);
        }
        if (pm.cronConfig?.interval.hours) {
          expect(pm.cronConfig.interval.hours).toBeGreaterThan(0);
        }
      });
    });
  });

  describe("Edge Cases", () => {
    it("handles PM with empty eventSubscriptions and emitsCommands", () => {
      const registry = createProcessManagerRegistry();

      // A time-triggered PM that does nothing (edge case for registry methods)
      const noopPM = defineProcessManager({
        processManagerName: "noopPM",
        description: "Does nothing - time-triggered with no subscriptions or commands",
        triggerType: "time",
        eventSubscriptions: [] as const,
        emitsCommands: [],
        context: "test",
        cronConfig: { interval: { hours: 1 }, scheduleDescription: "Hourly" },
      });

      registry.register(noopPM);

      // Should be registered
      expect(registry.has("noopPM")).toBe(true);
      expect(registry.size).toBe(1);

      // Should not contribute to trigger events
      expect(registry.getAllTriggerEvents()).toEqual([]);

      // Should not contribute to emitted commands
      expect(registry.getAllEmittedCommands()).toEqual([]);

      // Should be found by trigger type
      const timePMs = registry.getByTriggerType("time");
      expect(timePMs).toHaveLength(1);
      expect(timePMs[0].processManagerName).toBe("noopPM");

      // Should be found in time-triggered PMs
      const cronPMs = registry.getTimeTriggeredPMs();
      expect(cronPMs).toHaveLength(1);

      // Should not be found by any event type
      expect(registry.getByTriggerEvent("SomeEvent")).toEqual([]);
    });

    it("handles mixed PMs where some have empty arrays", () => {
      const registry = createProcessManagerRegistry();

      const noopPM = defineProcessManager({
        processManagerName: "noopPM",
        description: "No-op PM",
        triggerType: "time",
        eventSubscriptions: [] as const,
        emitsCommands: [],
        context: "test",
        cronConfig: { interval: { minutes: 30 }, scheduleDescription: "Every 30 minutes" },
      });

      registry.register(orderNotificationPM);
      registry.register(noopPM);

      // getAllTriggerEvents should only include orderNotificationPM's events
      const events = registry.getAllTriggerEvents();
      expect(events).toContain("OrderConfirmed");
      expect(events).toContain("OrderShipped");
      expect(events).toHaveLength(2);

      // getAllEmittedCommands should only include orderNotificationPM's commands
      const commands = registry.getAllEmittedCommands();
      expect(commands).toContain("SendNotification");
      expect(commands).toContain("LogActivity");
      expect(commands).toHaveLength(2);
    });
  });
});

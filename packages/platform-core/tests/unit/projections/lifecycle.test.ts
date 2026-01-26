/**
 * Unit tests for Projection Lifecycle State Machine.
 *
 * Tests the projection lifecycle state machine for state transitions and validation.
 */
import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  transitionState,
  getValidEventsFrom,
  getAllTransitions,
  assertValidTransition,
  type ProjectionLifecycleState,
} from "../../../src/projections/lifecycle";

describe("Projection Lifecycle State Machine", () => {
  describe("isValidTransition", () => {
    describe("from active state", () => {
      it("allows START_REBUILD", () => {
        expect(isValidTransition("active", "START_REBUILD")).toBe(true);
      });

      it("allows PAUSE", () => {
        expect(isValidTransition("active", "PAUSE")).toBe(true);
      });

      it("allows FAIL", () => {
        expect(isValidTransition("active", "FAIL")).toBe(true);
      });

      it("rejects COMPLETE_REBUILD", () => {
        expect(isValidTransition("active", "COMPLETE_REBUILD")).toBe(false);
      });

      it("rejects RESUME", () => {
        expect(isValidTransition("active", "RESUME")).toBe(false);
      });

      it("rejects RECOVER", () => {
        expect(isValidTransition("active", "RECOVER")).toBe(false);
      });
    });

    describe("from rebuilding state", () => {
      it("allows COMPLETE_REBUILD", () => {
        expect(isValidTransition("rebuilding", "COMPLETE_REBUILD")).toBe(true);
      });

      it("allows FAIL", () => {
        expect(isValidTransition("rebuilding", "FAIL")).toBe(true);
      });

      it("rejects START_REBUILD", () => {
        expect(isValidTransition("rebuilding", "START_REBUILD")).toBe(false);
      });

      it("rejects PAUSE", () => {
        expect(isValidTransition("rebuilding", "PAUSE")).toBe(false);
      });

      it("rejects RESUME", () => {
        expect(isValidTransition("rebuilding", "RESUME")).toBe(false);
      });

      it("rejects RECOVER", () => {
        expect(isValidTransition("rebuilding", "RECOVER")).toBe(false);
      });
    });

    describe("from paused state", () => {
      it("allows RESUME", () => {
        expect(isValidTransition("paused", "RESUME")).toBe(true);
      });

      it("allows START_REBUILD", () => {
        expect(isValidTransition("paused", "START_REBUILD")).toBe(true);
      });

      it("allows FAIL", () => {
        expect(isValidTransition("paused", "FAIL")).toBe(true);
      });

      it("rejects COMPLETE_REBUILD", () => {
        expect(isValidTransition("paused", "COMPLETE_REBUILD")).toBe(false);
      });

      it("rejects PAUSE", () => {
        expect(isValidTransition("paused", "PAUSE")).toBe(false);
      });

      it("rejects RECOVER", () => {
        expect(isValidTransition("paused", "RECOVER")).toBe(false);
      });
    });

    describe("from error state", () => {
      it("allows RECOVER", () => {
        expect(isValidTransition("error", "RECOVER")).toBe(true);
      });

      it("allows START_REBUILD", () => {
        expect(isValidTransition("error", "START_REBUILD")).toBe(true);
      });

      it("rejects COMPLETE_REBUILD", () => {
        expect(isValidTransition("error", "COMPLETE_REBUILD")).toBe(false);
      });

      it("rejects FAIL", () => {
        expect(isValidTransition("error", "FAIL")).toBe(false);
      });

      it("rejects PAUSE", () => {
        expect(isValidTransition("error", "PAUSE")).toBe(false);
      });

      it("rejects RESUME", () => {
        expect(isValidTransition("error", "RESUME")).toBe(false);
      });
    });
  });

  describe("transitionState", () => {
    it("returns new state for valid transition", () => {
      expect(transitionState("active", "START_REBUILD")).toBe("rebuilding");
      expect(transitionState("active", "PAUSE")).toBe("paused");
      expect(transitionState("active", "FAIL")).toBe("error");
      expect(transitionState("rebuilding", "COMPLETE_REBUILD")).toBe("active");
      expect(transitionState("rebuilding", "FAIL")).toBe("error");
      expect(transitionState("paused", "RESUME")).toBe("active");
      expect(transitionState("paused", "START_REBUILD")).toBe("rebuilding");
      expect(transitionState("paused", "FAIL")).toBe("error");
      expect(transitionState("error", "RECOVER")).toBe("active");
      expect(transitionState("error", "START_REBUILD")).toBe("rebuilding");
    });

    it("returns null for invalid transition", () => {
      expect(transitionState("active", "COMPLETE_REBUILD")).toBeNull();
      expect(transitionState("paused", "COMPLETE_REBUILD")).toBeNull();
      expect(transitionState("rebuilding", "PAUSE")).toBeNull();
      expect(transitionState("error", "PAUSE")).toBeNull();
    });
  });

  describe("getValidEventsFrom", () => {
    it("returns valid events from active state", () => {
      const events = getValidEventsFrom("active");

      expect(events).toContain("START_REBUILD");
      expect(events).toContain("PAUSE");
      expect(events).toContain("FAIL");
      expect(events).toHaveLength(3);
    });

    it("returns valid events from rebuilding state", () => {
      const events = getValidEventsFrom("rebuilding");

      expect(events).toContain("COMPLETE_REBUILD");
      expect(events).toContain("FAIL");
      expect(events).toHaveLength(2);
    });

    it("returns valid events from paused state", () => {
      const events = getValidEventsFrom("paused");

      expect(events).toContain("RESUME");
      expect(events).toContain("START_REBUILD");
      expect(events).toContain("FAIL");
      expect(events).toHaveLength(3);
    });

    it("returns valid events from error state", () => {
      const events = getValidEventsFrom("error");

      expect(events).toContain("RECOVER");
      expect(events).toContain("START_REBUILD");
      expect(events).toHaveLength(2);
    });
  });

  describe("getAllTransitions", () => {
    it("returns all valid transitions", () => {
      const transitions = getAllTransitions();

      // Should have 10 valid transitions
      expect(transitions.length).toBe(10);

      // Each transition should have from, event, and to
      transitions.forEach((t) => {
        expect(t).toHaveProperty("from");
        expect(t).toHaveProperty("event");
        expect(t).toHaveProperty("to");
      });
    });

    it("includes all expected transitions", () => {
      const transitions = getAllTransitions();
      const transitionStrings = transitions.map((t) => `${t.from}->${t.event}->${t.to}`);

      expect(transitionStrings).toContain("active->START_REBUILD->rebuilding");
      expect(transitionStrings).toContain("active->PAUSE->paused");
      expect(transitionStrings).toContain("active->FAIL->error");
      expect(transitionStrings).toContain("rebuilding->COMPLETE_REBUILD->active");
      expect(transitionStrings).toContain("rebuilding->FAIL->error");
      expect(transitionStrings).toContain("paused->RESUME->active");
      expect(transitionStrings).toContain("paused->START_REBUILD->rebuilding");
      expect(transitionStrings).toContain("paused->FAIL->error");
      expect(transitionStrings).toContain("error->RECOVER->active");
      expect(transitionStrings).toContain("error->START_REBUILD->rebuilding");
    });

    it("returns readonly array", () => {
      const transitions1 = getAllTransitions();
      const transitions2 = getAllTransitions();

      // Should return the same array reference
      expect(transitions1).toBe(transitions2);
    });
  });

  describe("assertValidTransition", () => {
    it("returns new state for valid transition", () => {
      const newState = assertValidTransition("active", "START_REBUILD", "orderSummary");

      expect(newState).toBe("rebuilding");
    });

    it("throws for invalid transition with projection name", () => {
      expect(() => {
        assertValidTransition("paused", "COMPLETE_REBUILD", "orderSummary");
      }).toThrow('Invalid transition for projection "orderSummary": paused -> COMPLETE_REBUILD');
    });

    it("throws with descriptive error message", () => {
      expect(() => {
        assertValidTransition("active", "RESUME", "productCatalog");
      }).toThrow('Invalid transition for projection "productCatalog": active -> RESUME');
    });
  });

  describe("State Machine Completeness", () => {
    const states: ProjectionLifecycleState[] = ["active", "rebuilding", "paused", "error"];

    it("all states are reachable from at least one other state", () => {
      const transitions = getAllTransitions();
      const reachableStates = new Set(transitions.map((t) => t.to));

      // All states should be reachable (except possibly initial state)
      expect(reachableStates.has("active")).toBe(true);
      expect(reachableStates.has("rebuilding")).toBe(true);
      expect(reachableStates.has("paused")).toBe(true);
      expect(reachableStates.has("error")).toBe(true);
    });

    it("all states can transition to at least one other state", () => {
      states.forEach((state) => {
        const validEvents = getValidEventsFrom(state);
        expect(validEvents.length).toBeGreaterThan(0);
      });
    });

    it("active state is reachable from error state (recovery path)", () => {
      // Important: there must be a path from error back to active
      const newState = transitionState("error", "RECOVER");
      expect(newState).toBe("active");
    });

    it("error state is reachable from active state", () => {
      const newState = transitionState("active", "FAIL");
      expect(newState).toBe("error");
    });

    it("rebuilding can be started from error state (retry rebuild)", () => {
      const newState = transitionState("error", "START_REBUILD");
      expect(newState).toBe("rebuilding");
    });
  });

  describe("Typical Workflows", () => {
    it("normal processing workflow: active stays active (no transition needed)", () => {
      // Normal processing doesn't require state transitions
      // Events are processed while in 'active' state
      const state: ProjectionLifecycleState = "active";
      expect(getValidEventsFrom(state)).toContain("FAIL");
    });

    it("rebuild workflow: active -> rebuilding -> active", () => {
      let state: ProjectionLifecycleState = "active";

      // Start rebuild
      state = transitionState(state, "START_REBUILD")!;
      expect(state).toBe("rebuilding");

      // Complete rebuild
      state = transitionState(state, "COMPLETE_REBUILD")!;
      expect(state).toBe("active");
    });

    it("error recovery workflow: active -> error -> active", () => {
      let state: ProjectionLifecycleState = "active";

      // Fail
      state = transitionState(state, "FAIL")!;
      expect(state).toBe("error");

      // Recover
      state = transitionState(state, "RECOVER")!;
      expect(state).toBe("active");
    });

    it("error rebuild workflow: active -> error -> rebuilding -> active", () => {
      let state: ProjectionLifecycleState = "active";

      // Fail
      state = transitionState(state, "FAIL")!;
      expect(state).toBe("error");

      // Start rebuild instead of recover
      state = transitionState(state, "START_REBUILD")!;
      expect(state).toBe("rebuilding");

      // Complete rebuild
      state = transitionState(state, "COMPLETE_REBUILD")!;
      expect(state).toBe("active");
    });

    it("pause/resume workflow: active -> paused -> active", () => {
      let state: ProjectionLifecycleState = "active";

      // Pause
      state = transitionState(state, "PAUSE")!;
      expect(state).toBe("paused");

      // Resume
      state = transitionState(state, "RESUME")!;
      expect(state).toBe("active");
    });

    it("rebuild failure workflow: active -> rebuilding -> error -> active", () => {
      let state: ProjectionLifecycleState = "active";

      // Start rebuild
      state = transitionState(state, "START_REBUILD")!;
      expect(state).toBe("rebuilding");

      // Rebuild fails
      state = transitionState(state, "FAIL")!;
      expect(state).toBe("error");

      // Recover
      state = transitionState(state, "RECOVER")!;
      expect(state).toBe("active");
    });

    it("paused rebuild workflow: active -> paused -> rebuilding -> active", () => {
      let state: ProjectionLifecycleState = "active";

      // Pause
      state = transitionState(state, "PAUSE")!;
      expect(state).toBe("paused");

      // Start rebuild from paused (useful for maintenance scenarios)
      state = transitionState(state, "START_REBUILD")!;
      expect(state).toBe("rebuilding");

      // Complete rebuild
      state = transitionState(state, "COMPLETE_REBUILD")!;
      expect(state).toBe("active");
    });

    it("paused error workflow: active -> paused -> error -> active", () => {
      let state: ProjectionLifecycleState = "active";

      // Pause
      state = transitionState(state, "PAUSE")!;
      expect(state).toBe("paused");

      // Error detected while paused (e.g., corruption found during inspection)
      state = transitionState(state, "FAIL")!;
      expect(state).toBe("error");

      // Recover
      state = transitionState(state, "RECOVER")!;
      expect(state).toBe("active");
    });
  });
});

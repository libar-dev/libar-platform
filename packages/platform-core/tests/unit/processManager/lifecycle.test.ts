/**
 * Unit tests for Process Manager Lifecycle State Machine.
 *
 * Tests the PM lifecycle state machine for state transitions and validation.
 */
import { describe, it, expect } from "vitest";
import {
  isPMValidTransition,
  pmTransitionState,
  getPMValidEventsFrom,
  getAllPMTransitions,
  assertPMValidTransition,
  isTerminalState,
  isErrorState,
  type ProcessManagerLifecycleState,
} from "../../../src/processManager/lifecycle";

describe("Process Manager Lifecycle State Machine", () => {
  describe("isPMValidTransition", () => {
    describe("from idle state", () => {
      it("allows START", () => {
        expect(isPMValidTransition("idle", "START")).toBe(true);
      });

      it("rejects SUCCESS", () => {
        expect(isPMValidTransition("idle", "SUCCESS")).toBe(false);
      });

      it("rejects FAIL", () => {
        expect(isPMValidTransition("idle", "FAIL")).toBe(false);
      });

      it("rejects RETRY", () => {
        expect(isPMValidTransition("idle", "RETRY")).toBe(false);
      });

      it("rejects RESET", () => {
        expect(isPMValidTransition("idle", "RESET")).toBe(false);
      });
    });

    describe("from processing state", () => {
      it("allows SUCCESS", () => {
        expect(isPMValidTransition("processing", "SUCCESS")).toBe(true);
      });

      it("allows FAIL", () => {
        expect(isPMValidTransition("processing", "FAIL")).toBe(true);
      });

      it("rejects START", () => {
        expect(isPMValidTransition("processing", "START")).toBe(false);
      });

      it("rejects RETRY", () => {
        expect(isPMValidTransition("processing", "RETRY")).toBe(false);
      });

      it("rejects RESET", () => {
        expect(isPMValidTransition("processing", "RESET")).toBe(false);
      });
    });

    describe("from completed state", () => {
      it("allows RESET", () => {
        expect(isPMValidTransition("completed", "RESET")).toBe(true);
      });

      it("rejects START", () => {
        expect(isPMValidTransition("completed", "START")).toBe(false);
      });

      it("rejects SUCCESS", () => {
        expect(isPMValidTransition("completed", "SUCCESS")).toBe(false);
      });

      it("rejects FAIL", () => {
        expect(isPMValidTransition("completed", "FAIL")).toBe(false);
      });

      it("rejects RETRY", () => {
        expect(isPMValidTransition("completed", "RETRY")).toBe(false);
      });
    });

    describe("from failed state", () => {
      it("allows RETRY", () => {
        expect(isPMValidTransition("failed", "RETRY")).toBe(true);
      });

      it("allows RESET", () => {
        expect(isPMValidTransition("failed", "RESET")).toBe(true);
      });

      it("rejects START", () => {
        expect(isPMValidTransition("failed", "START")).toBe(false);
      });

      it("rejects SUCCESS", () => {
        expect(isPMValidTransition("failed", "SUCCESS")).toBe(false);
      });

      it("rejects FAIL", () => {
        expect(isPMValidTransition("failed", "FAIL")).toBe(false);
      });
    });
  });

  describe("pmTransitionState", () => {
    it("returns new state for valid transitions", () => {
      expect(pmTransitionState("idle", "START")).toBe("processing");
      expect(pmTransitionState("processing", "SUCCESS")).toBe("completed");
      expect(pmTransitionState("processing", "FAIL")).toBe("failed");
      expect(pmTransitionState("completed", "RESET")).toBe("idle");
      expect(pmTransitionState("failed", "RETRY")).toBe("processing");
      expect(pmTransitionState("failed", "RESET")).toBe("idle");
    });

    it("returns null for invalid transitions", () => {
      expect(pmTransitionState("idle", "SUCCESS")).toBeNull();
      expect(pmTransitionState("completed", "START")).toBeNull();
      expect(pmTransitionState("processing", "RETRY")).toBeNull();
      expect(pmTransitionState("failed", "SUCCESS")).toBeNull();
    });
  });

  describe("getPMValidEventsFrom", () => {
    it("returns valid events from idle state", () => {
      const events = getPMValidEventsFrom("idle");

      expect(events).toContain("START");
      expect(events).toHaveLength(1);
    });

    it("returns valid events from processing state", () => {
      const events = getPMValidEventsFrom("processing");

      expect(events).toContain("SUCCESS");
      expect(events).toContain("FAIL");
      expect(events).toHaveLength(2);
    });

    it("returns valid events from completed state", () => {
      const events = getPMValidEventsFrom("completed");

      expect(events).toContain("RESET");
      expect(events).toHaveLength(1);
    });

    it("returns valid events from failed state", () => {
      const events = getPMValidEventsFrom("failed");

      expect(events).toContain("RETRY");
      expect(events).toContain("RESET");
      expect(events).toHaveLength(2);
    });
  });

  describe("getAllPMTransitions", () => {
    it("returns all valid transitions", () => {
      const transitions = getAllPMTransitions();

      // Should have 6 valid transitions
      expect(transitions.length).toBe(6);

      // Each transition should have from, event, and to
      transitions.forEach((t) => {
        expect(t).toHaveProperty("from");
        expect(t).toHaveProperty("event");
        expect(t).toHaveProperty("to");
      });
    });

    it("includes all expected transitions", () => {
      const transitions = getAllPMTransitions();
      const transitionStrings = transitions.map((t) => `${t.from}->${t.event}->${t.to}`);

      expect(transitionStrings).toContain("idle->START->processing");
      expect(transitionStrings).toContain("processing->SUCCESS->completed");
      expect(transitionStrings).toContain("processing->FAIL->failed");
      expect(transitionStrings).toContain("completed->RESET->idle");
      expect(transitionStrings).toContain("failed->RETRY->processing");
      expect(transitionStrings).toContain("failed->RESET->idle");
    });

    it("returns readonly array", () => {
      const transitions1 = getAllPMTransitions();
      const transitions2 = getAllPMTransitions();

      // Should return the same array reference
      expect(transitions1).toBe(transitions2);
    });
  });

  describe("assertPMValidTransition", () => {
    it("returns new state for valid transition", () => {
      const newState = assertPMValidTransition("idle", "START", "orderNotification", "inst-123");

      expect(newState).toBe("processing");
    });

    it("throws for invalid transition with PM name and instance ID", () => {
      expect(() => {
        assertPMValidTransition("completed", "START", "orderNotification", "inst-123");
      }).toThrow('Invalid PM transition for "orderNotification" (inst-123): completed -> START');
    });

    it("throws with descriptive error message for processing state", () => {
      expect(() => {
        assertPMValidTransition("processing", "RETRY", "reservationExpiration", "inst-456");
      }).toThrow(
        'Invalid PM transition for "reservationExpiration" (inst-456): processing -> RETRY'
      );
    });
  });

  describe("isTerminalState", () => {
    it("returns true for completed state", () => {
      expect(isTerminalState("completed")).toBe(true);
    });

    it("returns false for idle state", () => {
      expect(isTerminalState("idle")).toBe(false);
    });

    it("returns false for processing state", () => {
      expect(isTerminalState("processing")).toBe(false);
    });

    it("returns false for failed state (can RETRY)", () => {
      expect(isTerminalState("failed")).toBe(false);
    });
  });

  describe("isErrorState", () => {
    it("returns true for failed state", () => {
      expect(isErrorState("failed")).toBe(true);
    });

    it("returns false for idle state", () => {
      expect(isErrorState("idle")).toBe(false);
    });

    it("returns false for processing state", () => {
      expect(isErrorState("processing")).toBe(false);
    });

    it("returns false for completed state", () => {
      expect(isErrorState("completed")).toBe(false);
    });
  });

  describe("State Machine Completeness", () => {
    const states: ProcessManagerLifecycleState[] = ["idle", "processing", "completed", "failed"];

    it("all non-terminal states can transition to at least one other state", () => {
      const nonTerminalStates = states.filter((s) => !isTerminalState(s));
      nonTerminalStates.forEach((state) => {
        const validEvents = getPMValidEventsFrom(state);
        expect(validEvents.length).toBeGreaterThan(0);
      });
    });

    it("processing is reachable from idle", () => {
      const newState = pmTransitionState("idle", "START");
      expect(newState).toBe("processing");
    });

    it("recovery path exists from failed back to processing", () => {
      const newState = pmTransitionState("failed", "RETRY");
      expect(newState).toBe("processing");
    });

    it("reset path exists from failed back to idle", () => {
      const newState = pmTransitionState("failed", "RESET");
      expect(newState).toBe("idle");
    });

    it("reset path exists from completed back to idle (for time-triggered PMs)", () => {
      const newState = pmTransitionState("completed", "RESET");
      expect(newState).toBe("idle");
    });
  });

  describe("Typical Workflows", () => {
    it("happy path: idle -> processing -> completed", () => {
      let state: ProcessManagerLifecycleState = "idle";

      // Start processing
      state = pmTransitionState(state, "START")!;
      expect(state).toBe("processing");

      // Complete successfully
      state = pmTransitionState(state, "SUCCESS")!;
      expect(state).toBe("completed");
    });

    it("failure path: idle -> processing -> failed", () => {
      let state: ProcessManagerLifecycleState = "idle";

      // Start processing
      state = pmTransitionState(state, "START")!;
      expect(state).toBe("processing");

      // Fail
      state = pmTransitionState(state, "FAIL")!;
      expect(state).toBe("failed");
    });

    it("retry workflow: idle -> processing -> failed -> processing -> completed", () => {
      let state: ProcessManagerLifecycleState = "idle";

      // Start processing
      state = pmTransitionState(state, "START")!;
      expect(state).toBe("processing");

      // Fail
      state = pmTransitionState(state, "FAIL")!;
      expect(state).toBe("failed");

      // Retry
      state = pmTransitionState(state, "RETRY")!;
      expect(state).toBe("processing");

      // Complete on retry
      state = pmTransitionState(state, "SUCCESS")!;
      expect(state).toBe("completed");
    });

    it("time-triggered PM workflow: idle -> processing -> completed -> idle (reset)", () => {
      let state: ProcessManagerLifecycleState = "idle";

      // Start processing
      state = pmTransitionState(state, "START")!;
      expect(state).toBe("processing");

      // Complete
      state = pmTransitionState(state, "SUCCESS")!;
      expect(state).toBe("completed");

      // Reset for next scheduled run
      state = pmTransitionState(state, "RESET")!;
      expect(state).toBe("idle");
    });

    it("failed reset workflow: idle -> processing -> failed -> idle (reset)", () => {
      let state: ProcessManagerLifecycleState = "idle";

      // Start processing
      state = pmTransitionState(state, "START")!;
      expect(state).toBe("processing");

      // Fail
      state = pmTransitionState(state, "FAIL")!;
      expect(state).toBe("failed");

      // Reset instead of retry (e.g., after investigation)
      state = pmTransitionState(state, "RESET")!;
      expect(state).toBe("idle");
    });
  });
});

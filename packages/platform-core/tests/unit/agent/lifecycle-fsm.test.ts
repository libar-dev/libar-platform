/**
 * Lifecycle FSM Unit Tests
 *
 * Tests for the pure agent lifecycle state machine including:
 * - All 10 valid transitions from the transition table
 * - Invalid transitions that return null or throw
 * - assertValidAgentTransition throws/returns behavior
 * - getValidAgentEventsFrom returns correct event arrays
 * - getAllAgentTransitions returns all 10 transitions
 * - State classification helpers (isAgentErrorState, isAgentProcessingState)
 * - commandToEvent maps command types to lifecycle events
 */

import { describe, it, expect } from "vitest";
import {
  AGENT_LIFECYCLE_STATES,
  AGENT_LIFECYCLE_EVENTS,
  isValidAgentTransition,
  transitionAgentState,
  assertValidAgentTransition,
  getValidAgentEventsFrom,
  getAllAgentTransitions,
  isAgentErrorState,
  isAgentProcessingState,
  commandToEvent,
  type AgentLifecycleState,
  type AgentLifecycleEvent,
} from "../../../src/agent/lifecycle-fsm.js";

// ============================================================================
// Constants
// ============================================================================

describe("AGENT_LIFECYCLE_STATES", () => {
  it("contains all four lifecycle states", () => {
    expect(AGENT_LIFECYCLE_STATES).toEqual(["stopped", "active", "paused", "error_recovery"]);
  });

  it("has exactly 4 states", () => {
    expect(AGENT_LIFECYCLE_STATES).toHaveLength(4);
  });
});

describe("AGENT_LIFECYCLE_EVENTS", () => {
  it("contains all seven lifecycle events", () => {
    expect(AGENT_LIFECYCLE_EVENTS).toEqual([
      "START",
      "PAUSE",
      "RESUME",
      "STOP",
      "RECONFIGURE",
      "ENTER_ERROR_RECOVERY",
      "RECOVER",
    ]);
  });

  it("has exactly 7 events", () => {
    expect(AGENT_LIFECYCLE_EVENTS).toHaveLength(7);
  });
});

// ============================================================================
// Valid Transitions (all 10)
// ============================================================================

describe("transitionAgentState — valid transitions", () => {
  const validTransitions: {
    from: AgentLifecycleState;
    event: AgentLifecycleEvent;
    to: AgentLifecycleState;
  }[] = [
    { from: "stopped", event: "START", to: "active" },
    { from: "active", event: "PAUSE", to: "paused" },
    { from: "active", event: "STOP", to: "stopped" },
    { from: "active", event: "ENTER_ERROR_RECOVERY", to: "error_recovery" },
    { from: "active", event: "RECONFIGURE", to: "active" },
    { from: "paused", event: "RESUME", to: "active" },
    { from: "paused", event: "STOP", to: "stopped" },
    { from: "paused", event: "RECONFIGURE", to: "active" },
    { from: "error_recovery", event: "RECOVER", to: "active" },
    { from: "error_recovery", event: "STOP", to: "stopped" },
  ];

  for (const { from, event, to } of validTransitions) {
    it(`transitions ${from} + ${event} -> ${to}`, () => {
      expect(transitionAgentState(from, event)).toBe(to);
    });
  }
});

describe("isValidAgentTransition — valid transitions", () => {
  const validPairs: [AgentLifecycleState, AgentLifecycleEvent][] = [
    ["stopped", "START"],
    ["active", "PAUSE"],
    ["active", "STOP"],
    ["active", "ENTER_ERROR_RECOVERY"],
    ["active", "RECONFIGURE"],
    ["paused", "RESUME"],
    ["paused", "STOP"],
    ["paused", "RECONFIGURE"],
    ["error_recovery", "RECOVER"],
    ["error_recovery", "STOP"],
  ];

  for (const [from, event] of validPairs) {
    it(`returns true for ${from} + ${event}`, () => {
      expect(isValidAgentTransition(from, event)).toBe(true);
    });
  }
});

// ============================================================================
// Invalid Transitions
// ============================================================================

describe("transitionAgentState — invalid transitions", () => {
  it("returns null for stopped + PAUSE (cannot pause what is not running)", () => {
    expect(transitionAgentState("stopped", "PAUSE")).toBeNull();
  });

  it("returns null for stopped + RESUME (cannot resume what is not running)", () => {
    expect(transitionAgentState("stopped", "RESUME")).toBeNull();
  });

  it("returns null for paused + PAUSE (cannot double-pause)", () => {
    expect(transitionAgentState("paused", "PAUSE")).toBeNull();
  });

  it("returns null for error_recovery + PAUSE (cannot pause during recovery)", () => {
    expect(transitionAgentState("error_recovery", "PAUSE")).toBeNull();
  });

  it("returns null for active + START (cannot start what is already running)", () => {
    expect(transitionAgentState("active", "START")).toBeNull();
  });

  it("returns null for active + RECOVER (RECOVER is only from error_recovery)", () => {
    expect(transitionAgentState("active", "RECOVER")).toBeNull();
  });

  it("returns null for stopped + STOP (cannot stop what is already stopped)", () => {
    expect(transitionAgentState("stopped", "STOP")).toBeNull();
  });

  it("returns null for stopped + RECONFIGURE (cannot reconfigure a stopped agent)", () => {
    expect(transitionAgentState("stopped", "RECONFIGURE")).toBeNull();
  });

  it("returns null for error_recovery + RESUME (must RECOVER, not RESUME)", () => {
    expect(transitionAgentState("error_recovery", "RESUME")).toBeNull();
  });

  it("returns null for paused + START (already initialized, use RESUME)", () => {
    expect(transitionAgentState("paused", "START")).toBeNull();
  });
});

describe("isValidAgentTransition — exhaustive invalid transitions", () => {
  // Compute all (state, event) pairs that are NOT valid
  const allPairs: [AgentLifecycleState, AgentLifecycleEvent][] = [];
  for (const state of AGENT_LIFECYCLE_STATES) {
    for (const event of AGENT_LIFECYCLE_EVENTS) {
      allPairs.push([state, event]);
    }
  }

  const validPairs = getAllAgentTransitions().map((t) => `${t.from}:${t.event}`);

  const invalidPairs = allPairs.filter(
    ([state, event]) => !validPairs.includes(`${state}:${event}`)
  );

  it("should have exactly 18 invalid pairs", () => {
    expect(invalidPairs).toHaveLength(18);
  });

  for (const [from, event] of invalidPairs) {
    it(`returns false for ${from} + ${event}`, () => {
      expect(isValidAgentTransition(from, event)).toBe(false);
    });
  }
});

describe("transitionAgentState — exhaustive invalid transitions", () => {
  // Compute all (state, event) pairs that are NOT valid
  const allPairs: [AgentLifecycleState, AgentLifecycleEvent][] = [];
  for (const state of AGENT_LIFECYCLE_STATES) {
    for (const event of AGENT_LIFECYCLE_EVENTS) {
      allPairs.push([state, event]);
    }
  }

  const validPairs = getAllAgentTransitions().map((t) => `${t.from}:${t.event}`);

  const invalidPairs = allPairs.filter(
    ([state, event]) => !validPairs.includes(`${state}:${event}`)
  );

  it("should have exactly 18 invalid pairs", () => {
    expect(invalidPairs).toHaveLength(18);
  });

  for (const [from, event] of invalidPairs) {
    it(`returns null for ${from} + ${event}`, () => {
      expect(transitionAgentState(from, event)).toBeNull();
    });
  }
});

// ============================================================================
// assertValidAgentTransition
// ============================================================================

describe("assertValidAgentTransition", () => {
  it("returns the next state for a valid transition", () => {
    const result = assertValidAgentTransition("stopped", "START", "test-agent");
    expect(result).toBe("active");
  });

  it("returns the next state for paused + RESUME", () => {
    const result = assertValidAgentTransition("paused", "RESUME", "test-agent");
    expect(result).toBe("active");
  });

  it("throws for an invalid transition", () => {
    expect(() => assertValidAgentTransition("stopped", "PAUSE", "test-agent")).toThrow(
      /Invalid agent lifecycle transition/
    );
  });

  it("includes agent ID in the error message", () => {
    expect(() => assertValidAgentTransition("stopped", "PAUSE", "my-agent")).toThrow(
      /agent="my-agent"/
    );
  });

  it("includes from state in the error message", () => {
    expect(() => assertValidAgentTransition("stopped", "PAUSE", "test-agent")).toThrow(
      /from="stopped"/
    );
  });

  it("includes the invalid event in the error message", () => {
    expect(() => assertValidAgentTransition("stopped", "PAUSE", "test-agent")).toThrow(
      /event="PAUSE"/
    );
  });

  it("includes valid events in the error message", () => {
    expect(() => assertValidAgentTransition("stopped", "PAUSE", "test-agent")).toThrow(/START/);
  });

  it("works for self-transition active + RECONFIGURE", () => {
    const result = assertValidAgentTransition("active", "RECONFIGURE", "test-agent");
    expect(result).toBe("active");
  });
});

// ============================================================================
// getValidAgentEventsFrom
// ============================================================================

describe("getValidAgentEventsFrom", () => {
  it("returns [START] for stopped", () => {
    expect(getValidAgentEventsFrom("stopped")).toEqual(["START"]);
  });

  it("returns [PAUSE, STOP, ENTER_ERROR_RECOVERY, RECONFIGURE] for active", () => {
    const events = getValidAgentEventsFrom("active");
    expect(events).toEqual(["PAUSE", "STOP", "ENTER_ERROR_RECOVERY", "RECONFIGURE"]);
  });

  it("returns [RESUME, STOP, RECONFIGURE] for paused", () => {
    const events = getValidAgentEventsFrom("paused");
    expect(events).toEqual(["RESUME", "STOP", "RECONFIGURE"]);
  });

  it("returns [RECOVER, STOP] for error_recovery", () => {
    const events = getValidAgentEventsFrom("error_recovery");
    expect(events).toEqual(["RECOVER", "STOP"]);
  });
});

// ============================================================================
// getAllAgentTransitions
// ============================================================================

describe("getAllAgentTransitions", () => {
  it("returns exactly 10 transitions", () => {
    expect(getAllAgentTransitions()).toHaveLength(10);
  });

  it("each transition has from, event, and to fields", () => {
    const transitions = getAllAgentTransitions();
    for (const t of transitions) {
      expect(t).toHaveProperty("from");
      expect(t).toHaveProperty("event");
      expect(t).toHaveProperty("to");
    }
  });

  it("contains the stopped -> START -> active transition", () => {
    const transitions = getAllAgentTransitions();
    expect(transitions).toContainEqual({ from: "stopped", event: "START", to: "active" });
  });

  it("contains the error_recovery -> STOP -> stopped transition", () => {
    const transitions = getAllAgentTransitions();
    expect(transitions).toContainEqual({
      from: "error_recovery",
      event: "STOP",
      to: "stopped",
    });
  });

  it("returns a readonly array (frozen reference)", () => {
    const t1 = getAllAgentTransitions();
    const t2 = getAllAgentTransitions();
    expect(t1).toBe(t2); // Same reference
  });
});

// ============================================================================
// State Classification Helpers
// ============================================================================

describe("isAgentErrorState", () => {
  it("returns true for error_recovery", () => {
    expect(isAgentErrorState("error_recovery")).toBe(true);
  });

  it("returns false for active", () => {
    expect(isAgentErrorState("active")).toBe(false);
  });

  it("returns false for stopped", () => {
    expect(isAgentErrorState("stopped")).toBe(false);
  });

  it("returns false for paused", () => {
    expect(isAgentErrorState("paused")).toBe(false);
  });
});

describe("isAgentProcessingState", () => {
  it("returns true for active", () => {
    expect(isAgentProcessingState("active")).toBe(true);
  });

  it("returns false for stopped", () => {
    expect(isAgentProcessingState("stopped")).toBe(false);
  });

  it("returns false for paused", () => {
    expect(isAgentProcessingState("paused")).toBe(false);
  });

  it("returns false for error_recovery", () => {
    expect(isAgentProcessingState("error_recovery")).toBe(false);
  });
});

// ============================================================================
// commandToEvent
// ============================================================================

describe("commandToEvent", () => {
  it('maps "StartAgent" to "START"', () => {
    expect(commandToEvent("StartAgent")).toBe("START");
  });

  it('maps "PauseAgent" to "PAUSE"', () => {
    expect(commandToEvent("PauseAgent")).toBe("PAUSE");
  });

  it('maps "ResumeAgent" to "RESUME"', () => {
    expect(commandToEvent("ResumeAgent")).toBe("RESUME");
  });

  it('maps "StopAgent" to "STOP"', () => {
    expect(commandToEvent("StopAgent")).toBe("STOP");
  });

  it('maps "ReconfigureAgent" to "RECONFIGURE"', () => {
    expect(commandToEvent("ReconfigureAgent")).toBe("RECONFIGURE");
  });

  it("returns null for unknown command type", () => {
    expect(commandToEvent("UnknownCommand")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(commandToEvent("")).toBeNull();
  });

  it("is case-sensitive (lowercase fails)", () => {
    expect(commandToEvent("startagent")).toBeNull();
  });
});

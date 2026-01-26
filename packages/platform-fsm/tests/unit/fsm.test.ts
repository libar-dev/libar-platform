/**
 * Unit tests for FSM module.
 *
 * Tests the core FSM functionality: defining state machines,
 * checking transitions, and error handling.
 */
import { describe, it, expect } from "vitest";
import {
  defineFSM,
  canTransition,
  assertTransition,
  validTransitions,
  isTerminal,
  isValidState,
  FSMTransitionError,
} from "../../src/index";

// Test FSM definition
type TestStatus = "draft" | "submitted" | "confirmed" | "cancelled";

const testFSM = defineFSM<TestStatus>({
  initial: "draft",
  transitions: {
    draft: ["submitted", "cancelled"],
    submitted: ["confirmed", "cancelled"],
    confirmed: [], // terminal
    cancelled: [], // terminal
  },
});

describe("defineFSM", () => {
  it("should create FSM with correct initial state", () => {
    expect(testFSM.initial).toBe("draft");
  });

  it("should preserve the definition", () => {
    expect(testFSM.definition.initial).toBe("draft");
    expect(testFSM.definition.transitions.draft).toEqual(["submitted", "cancelled"]);
  });
});

describe("canTransition", () => {
  it("should return true for valid transitions", () => {
    expect(testFSM.canTransition("draft", "submitted")).toBe(true);
    expect(testFSM.canTransition("draft", "cancelled")).toBe(true);
    expect(testFSM.canTransition("submitted", "confirmed")).toBe(true);
    expect(testFSM.canTransition("submitted", "cancelled")).toBe(true);
  });

  it("should return false for invalid transitions", () => {
    expect(testFSM.canTransition("draft", "confirmed")).toBe(false);
    expect(testFSM.canTransition("submitted", "draft")).toBe(false);
    expect(testFSM.canTransition("confirmed", "draft")).toBe(false);
    expect(testFSM.canTransition("cancelled", "draft")).toBe(false);
  });

  it("should work with standalone function", () => {
    expect(canTransition(testFSM, "draft", "submitted")).toBe(true);
    expect(canTransition(testFSM, "draft", "confirmed")).toBe(false);
  });
});

describe("assertTransition", () => {
  it("should not throw for valid transitions", () => {
    expect(() => testFSM.assertTransition("draft", "submitted")).not.toThrow();
    expect(() => testFSM.assertTransition("submitted", "confirmed")).not.toThrow();
  });

  it("should throw FSMTransitionError for invalid transitions", () => {
    expect(() => testFSM.assertTransition("draft", "confirmed")).toThrow(FSMTransitionError);
  });

  it("should include transition details in error", () => {
    try {
      testFSM.assertTransition("draft", "confirmed");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FSMTransitionError);
      const fsmError = error as FSMTransitionError;
      expect(fsmError.from).toBe("draft");
      expect(fsmError.to).toBe("confirmed");
      expect(fsmError.validTransitions).toEqual(["submitted", "cancelled"]);
      expect(fsmError.code).toBe("FSM_INVALID_TRANSITION");
    }
  });

  it("should work with standalone function", () => {
    expect(() => assertTransition(testFSM, "draft", "submitted")).not.toThrow();
    expect(() => assertTransition(testFSM, "draft", "confirmed")).toThrow(FSMTransitionError);
  });
});

describe("validTransitions", () => {
  it("should return valid transitions for each state", () => {
    expect(testFSM.validTransitions("draft")).toEqual(["submitted", "cancelled"]);
    expect(testFSM.validTransitions("submitted")).toEqual(["confirmed", "cancelled"]);
    expect(testFSM.validTransitions("confirmed")).toEqual([]);
    expect(testFSM.validTransitions("cancelled")).toEqual([]);
  });

  it("should work with standalone function", () => {
    expect(validTransitions(testFSM, "draft")).toEqual(["submitted", "cancelled"]);
  });
});

describe("isTerminal", () => {
  it("should identify terminal states", () => {
    expect(testFSM.isTerminal("confirmed")).toBe(true);
    expect(testFSM.isTerminal("cancelled")).toBe(true);
  });

  it("should identify non-terminal states", () => {
    expect(testFSM.isTerminal("draft")).toBe(false);
    expect(testFSM.isTerminal("submitted")).toBe(false);
  });

  it("should work with standalone function", () => {
    expect(isTerminal(testFSM, "confirmed")).toBe(true);
    expect(isTerminal(testFSM, "draft")).toBe(false);
  });
});

describe("isValidState", () => {
  it("should return true for valid states", () => {
    expect(testFSM.isValidState("draft")).toBe(true);
    expect(testFSM.isValidState("submitted")).toBe(true);
    expect(testFSM.isValidState("confirmed")).toBe(true);
    expect(testFSM.isValidState("cancelled")).toBe(true);
  });

  it("should return false for invalid states", () => {
    expect(testFSM.isValidState("unknown")).toBe(false);
    expect(testFSM.isValidState("")).toBe(false);
    expect(testFSM.isValidState("DRAFT")).toBe(false); // case sensitive
  });

  it("should work with standalone function", () => {
    expect(isValidState(testFSM, "draft")).toBe(true);
    expect(isValidState(testFSM, "unknown")).toBe(false);
  });
});

describe("FSMTransitionError", () => {
  it("should have correct error properties", () => {
    const error = new FSMTransitionError("draft", "confirmed", ["submitted", "cancelled"]);

    expect(error.name).toBe("FSMTransitionError");
    expect(error.code).toBe("FSM_INVALID_TRANSITION");
    expect(error.from).toBe("draft");
    expect(error.to).toBe("confirmed");
    expect(error.validTransitions).toEqual(["submitted", "cancelled"]);
    expect(error.message).toContain("Invalid transition");
    expect(error.message).toContain("draft");
    expect(error.message).toContain("confirmed");
  });

  it("should handle terminal states in error message", () => {
    const error = new FSMTransitionError("confirmed", "draft", []);

    expect(error.message).toContain("(none - terminal state)");
  });
});

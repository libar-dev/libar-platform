/**
 * Unit Tests for Command Naming Policy
 *
 * Tests the command naming conventions:
 * - Valid naming patterns
 * - Validation function
 * - Suggestion generation
 * - Formatting helpers
 */
import { describe, it, expect } from "vitest";
import {
  CommandNamingPolicy,
  COMMAND_NAME_PREFIXES,
  validateCommandName,
  generateNameSuggestions,
  isValidCommandName,
  getCommandPrefix,
  formatCommandName,
} from "../../../src/commands/naming";

describe("CommandNamingPolicy", () => {
  it("contains all expected prefixes", () => {
    expect(COMMAND_NAME_PREFIXES).toContain("CREATE");
    expect(COMMAND_NAME_PREFIXES).toContain("SUBMIT");
    expect(COMMAND_NAME_PREFIXES).toContain("CANCEL");
    expect(COMMAND_NAME_PREFIXES).toContain("UPDATE");
    expect(COMMAND_NAME_PREFIXES).toContain("ADD");
    expect(COMMAND_NAME_PREFIXES).toContain("REMOVE");
    expect(COMMAND_NAME_PREFIXES).toContain("CONFIRM");
    expect(COMMAND_NAME_PREFIXES).toContain("RESERVE");
    expect(COMMAND_NAME_PREFIXES).toContain("RELEASE");
    expect(COMMAND_NAME_PREFIXES).toContain("EXPIRE");
  });

  describe("CREATE pattern", () => {
    it("matches CreateOrder", () => {
      expect(CommandNamingPolicy.CREATE.test("CreateOrder")).toBe(true);
    });

    it("matches CreateProduct", () => {
      expect(CommandNamingPolicy.CREATE.test("CreateProduct")).toBe(true);
    });

    it("does not match lowercase create", () => {
      expect(CommandNamingPolicy.CREATE.test("createOrder")).toBe(false);
    });
  });

  describe("ADD pattern", () => {
    it("matches AddOrderItem", () => {
      expect(CommandNamingPolicy.ADD.test("AddOrderItem")).toBe(true);
    });

    it("matches AddToCart", () => {
      expect(CommandNamingPolicy.ADD.test("AddToCart")).toBe(true);
    });
  });

  describe("UPDATE pattern", () => {
    it("matches UpdateAddress", () => {
      expect(CommandNamingPolicy.UPDATE.test("UpdateAddress")).toBe(true);
    });

    it("matches ChangePassword", () => {
      expect(CommandNamingPolicy.UPDATE.test("ChangePassword")).toBe(true);
    });

    it("matches ModifyOrder", () => {
      expect(CommandNamingPolicy.UPDATE.test("ModifyOrder")).toBe(true);
    });
  });
});

describe("isValidCommandName", () => {
  describe("with valid command names", () => {
    it("returns true for CreateOrder", () => {
      expect(isValidCommandName("CreateOrder")).toBe(true);
    });

    it("returns true for AddOrderItem", () => {
      expect(isValidCommandName("AddOrderItem")).toBe(true);
    });

    it("returns true for RemoveOrderItem", () => {
      expect(isValidCommandName("RemoveOrderItem")).toBe(true);
    });

    it("returns true for SubmitOrder", () => {
      expect(isValidCommandName("SubmitOrder")).toBe(true);
    });

    it("returns true for CancelOrder", () => {
      expect(isValidCommandName("CancelOrder")).toBe(true);
    });

    it("returns true for ConfirmOrder", () => {
      expect(isValidCommandName("ConfirmOrder")).toBe(true);
    });

    it("returns true for ReserveStock", () => {
      expect(isValidCommandName("ReserveStock")).toBe(true);
    });

    it("returns true for ReleaseReservation", () => {
      expect(isValidCommandName("ReleaseReservation")).toBe(true);
    });

    it("returns true for ExpireReservation", () => {
      expect(isValidCommandName("ExpireReservation")).toBe(true);
    });

    it("returns true for UpdateProfile", () => {
      expect(isValidCommandName("UpdateProfile")).toBe(true);
    });

    it("returns true for DeleteUser", () => {
      expect(isValidCommandName("DeleteUser")).toBe(true);
    });
  });

  describe("with invalid command names", () => {
    it("returns false for OrderCreate (inverted)", () => {
      expect(isValidCommandName("OrderCreate")).toBe(false);
    });

    it("returns false for lowercase createOrder", () => {
      expect(isValidCommandName("createOrder")).toBe(false);
    });

    it("returns false for snake_case", () => {
      expect(isValidCommandName("create_order")).toBe(false);
    });

    it("returns false for kebab-case", () => {
      expect(isValidCommandName("create-order")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isValidCommandName("")).toBe(false);
    });

    it("returns false for single word", () => {
      expect(isValidCommandName("Order")).toBe(false);
    });
  });
});

describe("validateCommandName", () => {
  describe("with valid names", () => {
    it("returns valid result for CreateOrder", () => {
      const result = validateCommandName("CreateOrder");
      expect(result.valid).toBe(true);
      expect(result.matchedPrefix).toBe("CREATE");
      expect(result.suggestions).toBeUndefined();
    });

    it("returns valid result for AddOrderItem", () => {
      const result = validateCommandName("AddOrderItem");
      expect(result.valid).toBe(true);
      expect(result.matchedPrefix).toBe("ADD");
    });

    it("returns valid result for ChangePassword", () => {
      const result = validateCommandName("ChangePassword");
      expect(result.valid).toBe(true);
      expect(result.matchedPrefix).toBe("UPDATE");
    });
  });

  describe("with invalid names", () => {
    it("returns invalid result with suggestions", () => {
      const result = validateCommandName("OrderCreate");
      expect(result.valid).toBe(false);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
      expect(result.message).toContain("does not follow naming conventions");
    });

    it("includes CreateOrder in suggestions for OrderCreate", () => {
      const result = validateCommandName("OrderCreate");
      expect(result.suggestions).toContain("CreateOrder");
    });
  });
});

describe("generateNameSuggestions", () => {
  it("suggests CreateOrder for OrderCreate", () => {
    const suggestions = generateNameSuggestions("OrderCreate");
    expect(suggestions).toContain("CreateOrder");
  });

  it("returns limited suggestions (max 3)", () => {
    const suggestions = generateNameSuggestions("SomeRandomName");
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });
});

describe("getCommandPrefix", () => {
  it("returns CREATE for CreateOrder", () => {
    expect(getCommandPrefix("CreateOrder")).toBe("CREATE");
  });

  it("returns ADD for AddOrderItem", () => {
    expect(getCommandPrefix("AddOrderItem")).toBe("ADD");
  });

  it("returns UPDATE for ChangePassword", () => {
    expect(getCommandPrefix("ChangePassword")).toBe("UPDATE");
  });

  it("returns undefined for invalid name", () => {
    expect(getCommandPrefix("OrderCreate")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getCommandPrefix("")).toBeUndefined();
  });
});

describe("formatCommandName", () => {
  it("formats snake_case to PascalCase", () => {
    const result = formatCommandName("create_order", "Create");
    expect(result).toBe("CreateOrder");
  });

  it("formats kebab-case to PascalCase", () => {
    const result = formatCommandName("add-item", "Add");
    expect(result).toBe("AddItem");
  });

  it("returns valid name unchanged", () => {
    const result = formatCommandName("CreateOrder");
    expect(result).toBe("CreateOrder");
  });

  it("adds default prefix when needed", () => {
    const result = formatCommandName("Order", "Create");
    expect(result).toBe("CreateOrder");
  });

  it("uses Execute as fallback prefix", () => {
    const result = formatCommandName("Something");
    expect(result).toBe("ExecuteSomething");
  });
});

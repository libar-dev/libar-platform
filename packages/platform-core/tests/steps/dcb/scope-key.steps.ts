/**
 * DCB Scope Key - Step Definitions
 *
 * BDD step definitions for scope key utilities behavior:
 * - Creation: createScopeKey, tryCreateScopeKey
 * - Parsing: parseScopeKey
 * - Validation: validateScopeKey, isValidScopeKey, assertValidScopeKey
 * - Tenant operations: isScopeTenant, extractTenantId, extractScopeType, extractScopeId
 *
 * @since Phase 16 (DCB)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// Import modules under test
import {
  createScopeKey,
  tryCreateScopeKey,
  parseScopeKey,
  validateScopeKey,
  isValidScopeKey,
  assertValidScopeKey,
  isScopeTenant,
  extractTenantId,
  extractScopeType,
  extractScopeId,
  SCOPE_KEY_PREFIX,
  type DCBScopeKey,
  type ParsedScopeKey,
  type ScopeKeyValidationError,
} from "../../../src/dcb/index.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  scopeKey: DCBScopeKey | null;
  parsedScopeKey: ParsedScopeKey | null;
  validationError: ScopeKeyValidationError | null;
  result: unknown;
  error: Error | null;
}

let state: TestState;

function resetState(): void {
  state = {
    scopeKey: null,
    parsedScopeKey: null,
    validationError: null,
    result: null,
    error: null,
  };
}

// =============================================================================
// Scope Key Feature
// =============================================================================

const scopeKeyFeature = await loadFeature("tests/features/behavior/dcb/scope-key.feature");

describeFeature(
  scopeKeyFeature,
  ({ Scenario, ScenarioOutline, Background, BeforeEachScenario, AfterEachScenario }) => {
    BeforeEachScenario(() => {
      resetState();
    });

    AfterEachScenario(() => {
      resetState();
    });

    Background(({ Given, And }) => {
      Given('the scope key format is "tenant:${tenantId}:${scopeType}:${scopeId}"', () => {
        // Documentation - format is defined in implementation
      });

      And('the tenant prefix is "tenant:" for mandatory tenant isolation', () => {
        expect(SCOPE_KEY_PREFIX).toBe("tenant:");
      });
    });

    // =========================================================================
    // Scope Key Creation
    // =========================================================================

    Scenario("Create valid scope key from components", ({ When, Then, And }) => {
      When(
        'I call createScopeKey with tenantId "t123", scopeType "reservation", scopeId "res_456"',
        () => {
          try {
            state.scopeKey = createScopeKey("t123", "reservation", "res_456");
            state.error = null;
          } catch (e) {
            state.error = e as Error;
          }
        }
      );

      Then('I receive scope key "tenant:t123:reservation:res_456"', () => {
        expect(state.scopeKey).toBe("tenant:t123:reservation:res_456");
      });

      And("the result is a branded DCBScopeKey type", () => {
        // TypeScript compilation ensures this; at runtime, verify it's a string
        expect(typeof state.scopeKey).toBe("string");
        expect(isValidScopeKey(state.scopeKey!)).toBe(true);
      });
    });

    Scenario("Scope ID may contain colons for composite identifiers", ({ When, Then }) => {
      When(
        'I call createScopeKey with tenantId "t1", scopeType "order", scopeId "ord:2024:001"',
        () => {
          state.scopeKey = createScopeKey("t1", "order", "ord:2024:001");
        }
      );

      Then('I receive scope key "tenant:t1:order:ord:2024:001"', () => {
        expect(state.scopeKey).toBe("tenant:t1:order:ord:2024:001");
      });
    });

    ScenarioOutline(
      "createScopeKey throws on invalid input",
      (
        { When, Then },
        variables: { tenantId: string; scopeType: string; scopeId: string; errorPart: string }
      ) => {
        When(
          'I call createScopeKey with tenantId "<tenantId>", scopeType "<scopeType>", scopeId "<scopeId>"',
          () => {
            try {
              state.scopeKey = createScopeKey(
                variables.tenantId,
                variables.scopeType,
                variables.scopeId
              );
              state.error = null;
            } catch (e) {
              state.error = e as Error;
            }
          }
        );

        Then('an error is thrown with message containing "<errorPart>"', () => {
          expect(state.error).not.toBeNull();
          expect(state.error?.message).toContain(variables.errorPart);
        });
      }
    );

    // =========================================================================
    // Safe Creation (tryCreateScopeKey)
    // =========================================================================

    Scenario("tryCreateScopeKey returns scope key for valid input", ({ When, Then }) => {
      When(
        'I call tryCreateScopeKey with tenantId "tenant_1", scopeType "order", scopeId "ord_789"',
        () => {
          state.scopeKey = tryCreateScopeKey("tenant_1", "order", "ord_789");
        }
      );

      Then('I receive scope key "tenant:tenant_1:order:ord_789"', () => {
        expect(state.scopeKey).toBe("tenant:tenant_1:order:ord_789");
      });
    });

    Scenario("tryCreateScopeKey returns null for invalid input", ({ When, Then }) => {
      When('I call tryCreateScopeKey with tenantId "", scopeType "order", scopeId "ord_1"', () => {
        state.scopeKey = tryCreateScopeKey("", "order", "ord_1");
      });

      Then("I receive null", () => {
        expect(state.scopeKey).toBeNull();
      });
    });

    // =========================================================================
    // Scope Key Parsing
    // =========================================================================

    Scenario("Parse valid scope key into components", ({ When, Then }) => {
      When('I call parseScopeKey with "tenant:t1:order:ord_123"', () => {
        state.parsedScopeKey = parseScopeKey("tenant:t1:order:ord_123");
      });

      Then(
        "I receive parsed scope key with:",
        (_, dataTable: { property: string; value: string }[]) => {
          expect(state.parsedScopeKey).not.toBeNull();
          for (const row of dataTable) {
            const key = row.property as keyof ParsedScopeKey;
            expect(state.parsedScopeKey![key]).toBe(row.value);
          }
        }
      );
    });

    Scenario("Parse scope key with composite scopeId containing colons", ({ When, Then }) => {
      When('I call parseScopeKey with "tenant:t1:reservation:res:2024:summer:001"', () => {
        state.parsedScopeKey = parseScopeKey("tenant:t1:reservation:res:2024:summer:001");
      });

      Then(
        "I receive parsed scope key with:",
        (_, dataTable: { property: string; value: string }[]) => {
          expect(state.parsedScopeKey).not.toBeNull();
          for (const row of dataTable) {
            const key = row.property as keyof ParsedScopeKey;
            expect(state.parsedScopeKey![key]).toBe(row.value);
          }
        }
      );
    });

    ScenarioOutline(
      "parseScopeKey returns null for invalid format",
      ({ When, Then }, variables: { input: string }) => {
        When('I call parseScopeKey with "<input>"', () => {
          state.parsedScopeKey = parseScopeKey(variables.input);
        });

        Then("I receive null", () => {
          expect(state.parsedScopeKey).toBeNull();
        });
      }
    );

    // =========================================================================
    // Scope Key Validation
    // =========================================================================

    Scenario("validateScopeKey returns null for valid scope key", ({ When, Then }) => {
      When('I call validateScopeKey with "tenant:t1:reservation:res_123"', () => {
        state.validationError = validateScopeKey("tenant:t1:reservation:res_123");
      });

      Then("I receive null indicating valid", () => {
        expect(state.validationError).toBeNull();
      });
    });

    Scenario(
      "validateScopeKey returns SCOPE_KEY_EMPTY error for empty string",
      ({ When, Then, And }) => {
        When('I call validateScopeKey with ""', () => {
          state.validationError = validateScopeKey("");
        });

        Then('I receive validation error with code "SCOPE_KEY_EMPTY"', () => {
          expect(state.validationError).not.toBeNull();
          expect(state.validationError!.code).toBe("SCOPE_KEY_EMPTY");
        });

        And('the error message contains "cannot be empty"', () => {
          expect(state.validationError!.message.toLowerCase()).toContain("cannot be empty");
        });
      }
    );

    Scenario("validateScopeKey returns error for missing tenant prefix", ({ When, Then, And }) => {
      When('I call validateScopeKey with "reservation:res_123"', () => {
        state.validationError = validateScopeKey("reservation:res_123");
      });

      Then('I receive validation error with code "INVALID_SCOPE_KEY_FORMAT"', () => {
        expect(state.validationError).not.toBeNull();
        expect(state.validationError!.code).toBe("INVALID_SCOPE_KEY_FORMAT");
      });

      And('the error message contains "tenant:"', () => {
        expect(state.validationError!.message).toContain("tenant:");
      });
    });

    Scenario("validateScopeKey returns error for malformed scope key", ({ When, Then }) => {
      When('I call validateScopeKey with "tenant:t1:reservation"', () => {
        state.validationError = validateScopeKey("tenant:t1:reservation");
      });

      Then('I receive validation error with code "INVALID_SCOPE_KEY_FORMAT"', () => {
        expect(state.validationError).not.toBeNull();
        expect(state.validationError!.code).toBe("INVALID_SCOPE_KEY_FORMAT");
      });
    });

    // =========================================================================
    // Type Guards
    // =========================================================================

    ScenarioOutline(
      "isValidScopeKey type guard",
      ({ When, Then }, variables: { input: string; result: string }) => {
        When('I call isValidScopeKey with "<input>"', () => {
          state.result = isValidScopeKey(variables.input);
        });

        Then("I receive <result>", () => {
          const expected = variables.result === "true";
          expect(state.result).toBe(expected);
        });
      }
    );

    Scenario("assertValidScopeKey throws on invalid input", ({ When, Then }) => {
      When('I call assertValidScopeKey with "invalid_scope"', () => {
        try {
          assertValidScopeKey("invalid_scope");
          state.error = null;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('an error is thrown with message containing "INVALID_SCOPE_KEY_FORMAT"', () => {
        expect(state.error).not.toBeNull();
        expect(state.error?.message).toContain("INVALID_SCOPE_KEY_FORMAT");
      });
    });

    Scenario("assertValidScopeKey succeeds on valid input", ({ When, Then }) => {
      When('I call assertValidScopeKey with "tenant:t1:order:ord_1"', () => {
        try {
          assertValidScopeKey("tenant:t1:order:ord_1");
          state.error = null;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("no error is thrown", () => {
        expect(state.error).toBeNull();
      });
    });

    // =========================================================================
    // Tenant Operations
    // =========================================================================

    ScenarioOutline(
      "isScopeTenant checks tenant membership",
      ({ Given, When, Then }, variables: { checkTenant: string; result: string }) => {
        Given('a valid scope key "tenant:t1:order:ord_123"', () => {
          state.scopeKey = createScopeKey("t1", "order", "ord_123");
        });

        When('I call isScopeTenant with tenantId "<checkTenant>"', () => {
          state.result = isScopeTenant(state.scopeKey!, variables.checkTenant);
        });

        Then("I receive <result>", () => {
          const expected = variables.result === "true";
          expect(state.result).toBe(expected);
        });
      }
    );

    Scenario("extractTenantId returns tenant ID from scope key", ({ Given, When, Then }) => {
      Given('a valid scope key "tenant:tenant_abc:reservation:res_001"', () => {
        state.scopeKey = createScopeKey("tenant_abc", "reservation", "res_001");
      });

      When("I call extractTenantId", () => {
        state.result = extractTenantId(state.scopeKey!);
      });

      Then('I receive "tenant_abc"', () => {
        expect(state.result).toBe("tenant_abc");
      });
    });

    Scenario("extractScopeType returns scope type from scope key", ({ Given, When, Then }) => {
      Given('a valid scope key "tenant:t1:reservation:res_001"', () => {
        state.scopeKey = createScopeKey("t1", "reservation", "res_001");
      });

      When("I call extractScopeType", () => {
        state.result = extractScopeType(state.scopeKey!);
      });

      Then('I receive "reservation"', () => {
        expect(state.result).toBe("reservation");
      });
    });

    Scenario("extractScopeId returns scope ID from scope key", ({ Given, When, Then }) => {
      Given('a valid scope key "tenant:t1:order:ord:2024:001"', () => {
        state.scopeKey = createScopeKey("t1", "order", "ord:2024:001");
      });

      When("I call extractScopeId", () => {
        state.result = extractScopeId(state.scopeKey!);
      });

      Then('I receive "ord:2024:001"', () => {
        expect(state.result).toBe("ord:2024:001");
      });
    });
  }
);

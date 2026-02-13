/**
 * Agent Command Router Unit Tests
 *
 * Tests for getRoute(), validateRoutes(), and COMMAND_ROUTING_ERROR_CODES:
 * - getRoute returns route when exists
 * - getRoute returns undefined when route does not exist
 * - validateRoutes produces success results for valid routes
 * - validateRoutes detects missing commandType (COMMAND_NOT_REGISTERED)
 * - validateRoutes detects missing boundedContext (UNKNOWN_ROUTE)
 * - validateRoutes detects missing toOrchestratorArgs (INVALID_TRANSFORM)
 * - validateRoutes returns empty array for empty route map
 * - COMMAND_ROUTING_ERROR_CODES contains all expected codes
 */

import { describe, it, expect } from "vitest";
import {
  getRoute,
  validateRoutes,
  COMMAND_ROUTING_ERROR_CODES,
  type AgentCommandRouteMap,
  type AgentCommandRoute,
} from "../../../src/agent/command-router.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createValidRoute(overrides?: Partial<AgentCommandRoute>): AgentCommandRoute {
  return {
    commandType: "CancelOrder",
    boundedContext: "orders",
    toOrchestratorArgs: (cmd, ctx) => ({
      orderId: "order-123",
      agentId: ctx.agentId,
      correlationId: ctx.correlationId,
    }),
    ...overrides,
  };
}

function createValidRouteMap(): AgentCommandRouteMap {
  return {
    SuggestCustomerOutreach: {
      commandType: "SuggestCustomerOutreach",
      boundedContext: "agent",
      toOrchestratorArgs: (cmd, ctx) => ({
        customerId: "cust-123",
        agentId: ctx.agentId,
        correlationId: ctx.correlationId,
      }),
    },
    CancelOrder: {
      commandType: "CancelOrder",
      boundedContext: "orders",
      toOrchestratorArgs: (cmd, _ctx) => ({
        orderId: "ord-456",
        reason: cmd.reason,
      }),
    },
  };
}

// ============================================================================
// getRoute Tests
// ============================================================================

describe("getRoute", () => {
  it("returns the route when commandType exists in the map", () => {
    const routes = createValidRouteMap();

    const result = getRoute(routes, "CancelOrder");

    expect(result).toBeDefined();
    expect(result!.commandType).toBe("CancelOrder");
    expect(result!.boundedContext).toBe("orders");
    expect(typeof result!.toOrchestratorArgs).toBe("function");
  });

  it("returns undefined when commandType does not exist in the map", () => {
    const routes = createValidRouteMap();

    const result = getRoute(routes, "NonExistentCommand");

    expect(result).toBeUndefined();
  });

  it("returns undefined for empty route map", () => {
    const routes: AgentCommandRouteMap = {};

    const result = getRoute(routes, "AnyCommand");

    expect(result).toBeUndefined();
  });
});

// ============================================================================
// validateRoutes Tests
// ============================================================================

describe("validateRoutes", () => {
  it("produces success results for valid routes", () => {
    const routes = createValidRouteMap();

    const results = validateRoutes(routes);

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.success).toBe(true);
    }

    // Verify each route's commandType is reported
    const successResults = results.filter((r) => r.success === true);
    const commandTypes = successResults.map(
      (r) => (r as { success: true; commandType: string }).commandType
    );
    expect(commandTypes).toContain("SuggestCustomerOutreach");
    expect(commandTypes).toContain("CancelOrder");
  });

  it("returns COMMAND_NOT_REGISTERED error for missing commandType", () => {
    const routes: AgentCommandRouteMap = {
      BadRoute: createValidRoute({ commandType: "" }),
    };

    const results = validateRoutes(routes);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    const failure = results[0] as { success: false; code: string; message: string };
    expect(failure.code).toBe(COMMAND_ROUTING_ERROR_CODES.COMMAND_NOT_REGISTERED);
    expect(failure.message).toContain("BadRoute");
    expect(failure.message).toContain("missing commandType");
  });

  it("returns UNKNOWN_ROUTE error for missing boundedContext", () => {
    const routes: AgentCommandRouteMap = {
      NoBCRoute: createValidRoute({ boundedContext: "" }),
    };

    const results = validateRoutes(routes);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    const failure = results[0] as { success: false; code: string; message: string };
    expect(failure.code).toBe(COMMAND_ROUTING_ERROR_CODES.UNKNOWN_ROUTE);
    expect(failure.message).toContain("NoBCRoute");
    expect(failure.message).toContain("missing boundedContext");
  });

  it("returns INVALID_TRANSFORM error for missing toOrchestratorArgs", () => {
    const routes: AgentCommandRouteMap = {
      NoTransformRoute: {
        commandType: "SomeCommand",
        boundedContext: "someContext",
        // Force missing function via type override
        toOrchestratorArgs: undefined as unknown as AgentCommandRoute["toOrchestratorArgs"],
      },
    };

    const results = validateRoutes(routes);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    const failure = results[0] as { success: false; code: string; message: string };
    expect(failure.code).toBe(COMMAND_ROUTING_ERROR_CODES.INVALID_TRANSFORM);
    expect(failure.message).toContain("NoTransformRoute");
    expect(failure.message).toContain("missing toOrchestratorArgs");
  });

  it("returns empty array for empty route map", () => {
    const routes: AgentCommandRouteMap = {};

    const results = validateRoutes(routes);

    expect(results).toEqual([]);
  });

  it("validates mixed valid and invalid routes independently", () => {
    const routes: AgentCommandRouteMap = {
      ValidRoute: createValidRoute(),
      InvalidRoute: createValidRoute({ commandType: "" }),
    };

    const results = validateRoutes(routes);

    expect(results).toHaveLength(2);
    const successCount = results.filter((r) => r.success === true).length;
    const failureCount = results.filter((r) => r.success === false).length;
    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);
  });
});

// ============================================================================
// COMMAND_ROUTING_ERROR_CODES Tests
// ============================================================================

describe("COMMAND_ROUTING_ERROR_CODES", () => {
  it("contains all expected error codes", () => {
    expect(COMMAND_ROUTING_ERROR_CODES.UNKNOWN_ROUTE).toBe("UNKNOWN_ROUTE");
    expect(COMMAND_ROUTING_ERROR_CODES.DUPLICATE_ROUTE).toBe("DUPLICATE_ROUTE");
    expect(COMMAND_ROUTING_ERROR_CODES.COMMAND_NOT_REGISTERED).toBe("COMMAND_NOT_REGISTERED");
    expect(COMMAND_ROUTING_ERROR_CODES.INVALID_TRANSFORM).toBe("INVALID_TRANSFORM");
  });

  it("has exactly 4 error codes", () => {
    expect(Object.keys(COMMAND_ROUTING_ERROR_CODES)).toHaveLength(4);
  });

  it("values are string constants (not undefined or null)", () => {
    for (const [key, value] of Object.entries(COMMAND_ROUTING_ERROR_CODES)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
      // Convention: error code value matches the key
      expect(value).toBe(key);
    }
  });
});

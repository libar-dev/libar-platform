import { vi } from "vitest";
import type { Logger } from "../../../src/logging/types.js";
import type { AgentComponentAPI } from "../../../src/agent/handler-types.js";

/**
 * Create a mock Logger for unit tests.
 * Shared across agent test files to avoid duplication.
 */
export function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    flush: vi.fn(),
  };
}

/**
 * Create a mock AgentComponentAPI for unit tests.
 *
 * Includes ALL properties from the AgentComponentAPI interface:
 * - checkpoints: loadOrCreate, update, transitionLifecycle, patchConfigOverrides
 * - audit: record
 * - commands: record, updateStatus
 * - approvals: create
 * - deadLetters: record
 *
 * Shared across lifecycle-handlers, command-bridge, and oncomplete-handler tests.
 */
export function createMockComponent(): AgentComponentAPI {
  return {
    checkpoints: {
      loadOrCreate:
        "mock_loadOrCreate" as unknown as AgentComponentAPI["checkpoints"]["loadOrCreate"],
      update: "mock_update" as unknown as AgentComponentAPI["checkpoints"]["update"],
      transitionLifecycle:
        "mock_transitionLifecycle" as unknown as AgentComponentAPI["checkpoints"]["transitionLifecycle"],
      patchConfigOverrides:
        "mock_patchConfigOverrides" as unknown as AgentComponentAPI["checkpoints"]["patchConfigOverrides"],
    },
    audit: {
      record: "mock_audit_record" as unknown as AgentComponentAPI["audit"]["record"],
    },
    commands: {
      record: "mock_commands_record" as unknown as AgentComponentAPI["commands"]["record"],
      updateStatus:
        "mock_commands_updateStatus" as unknown as AgentComponentAPI["commands"]["updateStatus"],
    },
    approvals: {
      create: "mock_approvals_create" as unknown as AgentComponentAPI["approvals"]["create"],
    },
    deadLetters: {
      record: "mock_deadLetters_record" as unknown as AgentComponentAPI["deadLetters"]["record"],
    },
  };
}

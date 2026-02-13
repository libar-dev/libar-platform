import { vi } from "vitest";
import type { Logger } from "../../../src/logging/types.js";

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

/**
 * Agent Rate Limiter Unit Tests
 *
 * Tests for withRateLimit() including:
 * - Allowed: operation executes and result returned
 * - Denied: operation NOT called, retryAfterMs returned
 * - Rate limit key is agent-scoped
 * - Operation error propagation
 */

import { describe, it, expect, vi } from "vitest";
import {
  withRateLimit,
  type AgentRateLimiterConfig,
} from "../../../src/agent/agent-rate-limiter.js";
import { createMockLogger } from "./_test-utils.js";

// ============================================================================
// withRateLimit Tests
// ============================================================================

describe("withRateLimit", () => {
  it("executes operation and returns result when allowed", async () => {
    const config: AgentRateLimiterConfig = {
      agentId: "test-agent",
      checkRateLimit: vi.fn().mockResolvedValue({ ok: true }),
    };

    const operation = vi.fn().mockResolvedValue({ analysis: "success", score: 0.95 });

    const result = await withRateLimit(config, operation);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.result).toEqual({ analysis: "success", score: 0.95 });
    }
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("does not execute operation when denied", async () => {
    const config: AgentRateLimiterConfig = {
      agentId: "test-agent",
      checkRateLimit: vi.fn().mockResolvedValue({ ok: false, retryAfterMs: 5000 }),
    };

    const operation = vi.fn();

    const result = await withRateLimit(config, operation);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBe(5000);
    }
    expect(operation).not.toHaveBeenCalled();
  });

  it("uses agent-scoped rate limit key", async () => {
    const checkRateLimit = vi.fn().mockResolvedValue({ ok: true });
    const config: AgentRateLimiterConfig = {
      agentId: "churn-risk-agent",
      checkRateLimit,
    };

    await withRateLimit(config, async () => "result");

    expect(checkRateLimit).toHaveBeenCalledWith("agent:churn-risk-agent");
  });

  it("propagates operation errors", async () => {
    const config: AgentRateLimiterConfig = {
      agentId: "test-agent",
      checkRateLimit: vi.fn().mockResolvedValue({ ok: true }),
    };

    const operation = vi.fn().mockRejectedValue(new Error("LLM API crashed"));

    await expect(withRateLimit(config, operation)).rejects.toThrow("LLM API crashed");
  });

  it("logs warning when rate limited", async () => {
    const logger = createMockLogger();
    const config: AgentRateLimiterConfig = {
      agentId: "test-agent",
      checkRateLimit: vi.fn().mockResolvedValue({ ok: false, retryAfterMs: 3000 }),
      logger,
    };

    await withRateLimit(config, async () => "result");

    expect(logger.warn).toHaveBeenCalledWith(
      "Rate limited",
      expect.objectContaining({
        agentId: "test-agent",
        retryAfterMs: 3000,
      })
    );
  });

  it("propagates checkRateLimit callback errors without calling operation", async () => {
    const config: AgentRateLimiterConfig = {
      agentId: "test-agent",
      checkRateLimit: vi.fn().mockRejectedValue(new Error("Rate limiter store unavailable")),
    };

    const operation = vi.fn();

    await expect(withRateLimit(config, operation)).rejects.toThrow(
      "Rate limiter store unavailable"
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it("logs debug when rate limit check passes", async () => {
    const logger = createMockLogger();
    const config: AgentRateLimiterConfig = {
      agentId: "test-agent",
      checkRateLimit: vi.fn().mockResolvedValue({ ok: true }),
      logger,
    };

    await withRateLimit(config, async () => "result");

    expect(logger.debug).toHaveBeenCalledWith(
      "Rate limit passed, executing operation",
      expect.objectContaining({
        agentId: "test-agent",
      })
    );
  });
});

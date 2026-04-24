import { describe, expect, it } from "vitest";
import { initializeAgentBC } from "../../../src/agent/init.js";
import type { AgentBCConfig } from "../../../src/agent/types.js";
import type { FunctionReference } from "convex/server";

const testPattern = {
  name: "test-pattern",
  window: { duration: "7d" },
  trigger: () => true,
};

function createValidAgentConfig(): AgentBCConfig {
  return {
    id: "test-agent",
    subscriptions: ["OrderCancelled"],
    patternWindow: { duration: "7d", minEvents: 1, eventLimit: 100 },
    confidenceThreshold: 0.9,
    patterns: [testPattern],
  } as AgentBCConfig;
}

describe("initializeAgentBC lifecycle placeholders", () => {
  it("throws explicit not-implemented errors for pause, resume, and unsubscribe", async () => {
    const result = initializeAgentBC(createValidAgentConfig(), {
      eventBus: {} as never,
      handler: {} as FunctionReference<"mutation">,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    await expect(result.handle.subscription.pause()).rejects.toThrow("not implemented");
    await expect(result.handle.subscription.resume()).rejects.toThrow("not implemented");
    await expect(result.handle.subscription.unsubscribe()).rejects.toThrow("not implemented");
  });
});

import { describe, expect, it } from "vitest";
import {
  generateAgentSubscriptionId,
  generateApprovalId,
  generateDecisionId,
  generateLifecycleDecisionId,
} from "../../../src/ids/generator.js";

describe("agent-scoped id generators", () => {
  it("generates full UUIDv7-backed approval and decision identifiers", () => {
    expect(generateApprovalId()).toMatch(/^apr_[0-9a-f-]{36}$/);
    expect(generateDecisionId()).toMatch(/^dec_[0-9a-f-]{36}$/);
  });

  it("generates agent-scoped subscription and lifecycle identifiers", () => {
    expect(generateAgentSubscriptionId("agent-1")).toMatch(/^sub_agent-1_[0-9a-f-]{36}$/);
    expect(generateLifecycleDecisionId("agent-1")).toMatch(
      /^lifecycle_agent-1_[0-9a-f-]{36}$/
    );
  });
});

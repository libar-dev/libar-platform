/**
 * Unit Tests for Correlation Chain Functions
 *
 * Tests the correlation chain utilities:
 * - createCorrelationChain: Initialize a chain from a command
 * - deriveCorrelationChain: Derive a chain from a parent event
 * - toEventMetadata: Extract event metadata from chain
 * - isCorrelated / isCausedBy: Relationship checks
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createCorrelationChain,
  deriveCorrelationChain,
  toEventMetadata,
  isCorrelated,
  isCausedBy,
} from "../../../src/correlation/chain";
import type { CorrelationChain, CausationSource } from "../../../src/correlation/types";
import { toCommandId, toCorrelationId, toCausationId, toEventId } from "../../../src/ids/branded";

describe("createCorrelationChain", () => {
  const fixedTime = 1703001234567;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("with only commandId", () => {
    it("creates chain with commandId as causationId", () => {
      const chain = createCorrelationChain(toCommandId("cmd_test_123"));

      expect(chain.commandId).toBe("cmd_test_123");
      expect(chain.causationId).toBe("cmd_test_123");
    });

    it("generates a correlationId", () => {
      const chain = createCorrelationChain(toCommandId("cmd_test_123"));

      expect(chain.correlationId).toBeDefined();
      expect(chain.correlationId).toMatch(/^corr_/);
    });

    it("sets initiatedAt to current time", () => {
      const chain = createCorrelationChain(toCommandId("cmd_test_123"));

      expect(chain.initiatedAt).toBe(fixedTime);
    });

    it("has undefined userId and context", () => {
      const chain = createCorrelationChain(toCommandId("cmd_test_123"));

      expect(chain.userId).toBeUndefined();
      expect(chain.context).toBeUndefined();
    });
  });

  describe("with options", () => {
    it("uses provided correlationId", () => {
      const chain = createCorrelationChain(toCommandId("cmd_test_123"), {
        correlationId: toCorrelationId("corr_custom_456"),
      });

      expect(chain.correlationId).toBe("corr_custom_456");
    });

    it("uses provided userId", () => {
      const chain = createCorrelationChain(toCommandId("cmd_test_123"), {
        userId: "user_abc",
      });

      expect(chain.userId).toBe("user_abc");
    });

    it("uses provided context", () => {
      const chain = createCorrelationChain(toCommandId("cmd_test_123"), {
        context: { source: "api", version: "v1" },
      });

      expect(chain.context).toEqual({ source: "api", version: "v1" });
    });

    it("uses provided initiatedAt", () => {
      const customTime = 1700000000000;
      const chain = createCorrelationChain(toCommandId("cmd_test_123"), {
        initiatedAt: customTime,
      });

      expect(chain.initiatedAt).toBe(customTime);
    });

    it("accepts all options together", () => {
      const chain = createCorrelationChain(toCommandId("cmd_test_123"), {
        correlationId: toCorrelationId("corr_custom"),
        userId: "user_xyz",
        context: { key: "value" },
        initiatedAt: 1699999999999,
      });

      expect(chain).toEqual({
        commandId: "cmd_test_123",
        correlationId: "corr_custom",
        causationId: "cmd_test_123",
        userId: "user_xyz",
        context: { key: "value" },
        initiatedAt: 1699999999999,
      });
    });
  });
});

describe("deriveCorrelationChain", () => {
  const fixedTime = 1703001234567;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("basic derivation", () => {
    it("preserves correlationId from source", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
      };

      const derived = deriveCorrelationChain(source);

      expect(derived.correlationId).toBe("corr_original");
    });

    it("uses eventId as causationId", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
      };

      const derived = deriveCorrelationChain(source);

      expect(derived.causationId).toBe("evt_abc123");
    });

    it("generates new commandId", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
      };

      const derived = deriveCorrelationChain(source);

      expect(derived.commandId).toBeDefined();
      expect(derived.commandId).toMatch(/^cmd_/);
    });

    it("inherits userId from source", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
        userId: "user_inherited",
      };

      const derived = deriveCorrelationChain(source);

      expect(derived.userId).toBe("user_inherited");
    });

    it("sets initiatedAt to current time", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
      };

      const derived = deriveCorrelationChain(source);

      expect(derived.initiatedAt).toBe(fixedTime);
    });
  });

  describe("context merging", () => {
    it("inherits context from source", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
        context: { parentKey: "parentValue" },
      };

      const derived = deriveCorrelationChain(source);

      expect(derived.context).toEqual({ parentKey: "parentValue" });
    });

    it("merges source and option contexts", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
        context: { parentKey: "parentValue" },
      };

      const derived = deriveCorrelationChain(source, {
        context: { childKey: "childValue" },
      });

      expect(derived.context).toEqual({
        parentKey: "parentValue",
        childKey: "childValue",
      });
    });

    it("option context takes precedence over source context", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
        context: { key: "sourceValue" },
      };

      const derived = deriveCorrelationChain(source, {
        context: { key: "optionValue" },
      });

      expect(derived.context).toEqual({ key: "optionValue" });
    });

    it("handles source with context and options without", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
        context: { key: "value" },
      };

      const derived = deriveCorrelationChain(source, {});

      expect(derived.context).toEqual({ key: "value" });
    });

    it("handles source without context and options with", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
      };

      const derived = deriveCorrelationChain(source, {
        context: { key: "value" },
      });

      expect(derived.context).toEqual({ key: "value" });
    });

    it("returns undefined context when neither has context", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
      };

      const derived = deriveCorrelationChain(source);

      expect(derived.context).toBeUndefined();
    });

    it("creates empty merged context when both source and options have empty context", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
        context: {},
      };

      const derived = deriveCorrelationChain(source, { context: {} });

      // Both have context (even if empty), so merged result is empty object, not undefined
      expect(derived.context).toEqual({});
    });

    it("preserves source context when options context is empty", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
        context: { key: "value" },
      };

      const derived = deriveCorrelationChain(source, { context: {} });

      expect(derived.context).toEqual({ key: "value" });
    });

    it("uses options context when source context is empty", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
        context: {},
      };

      const derived = deriveCorrelationChain(source, { context: { key: "value" } });

      expect(derived.context).toEqual({ key: "value" });
    });
  });

  describe("with options", () => {
    it("uses provided commandId", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
      };

      const derived = deriveCorrelationChain(source, {
        commandId: toCommandId("cmd_custom_999"),
      });

      expect(derived.commandId).toBe("cmd_custom_999");
    });

    it("uses provided initiatedAt", () => {
      const source: CausationSource = {
        eventId: toEventId("evt_abc123"),
        correlationId: toCorrelationId("corr_original"),
      };

      const derived = deriveCorrelationChain(source, {
        initiatedAt: 1700000000000,
      });

      expect(derived.initiatedAt).toBe(1700000000000);
    });
  });
});

describe("toEventMetadata", () => {
  it("extracts correlationId and causationId", () => {
    const chain: CorrelationChain = {
      commandId: toCommandId("cmd_123"),
      correlationId: toCorrelationId("corr_456"),
      causationId: toCausationId("evt_789"),
      initiatedAt: Date.now(),
    };

    const metadata = toEventMetadata(chain);

    expect(metadata.correlationId).toBe("corr_456");
    expect(metadata.causationId).toBe("evt_789");
  });

  it("includes userId when present", () => {
    const chain: CorrelationChain = {
      commandId: toCommandId("cmd_123"),
      correlationId: toCorrelationId("corr_456"),
      causationId: toCausationId("cmd_123"),
      userId: "user_abc",
      initiatedAt: Date.now(),
    };

    const metadata = toEventMetadata(chain);

    expect(metadata.userId).toBe("user_abc");
  });

  it("excludes userId when undefined", () => {
    const chain: CorrelationChain = {
      commandId: toCommandId("cmd_123"),
      correlationId: toCorrelationId("corr_456"),
      causationId: toCausationId("cmd_123"),
      initiatedAt: Date.now(),
    };

    const metadata = toEventMetadata(chain);

    expect("userId" in metadata).toBe(false);
  });

  it("merges additional metadata", () => {
    const chain: CorrelationChain = {
      commandId: toCommandId("cmd_123"),
      correlationId: toCorrelationId("corr_456"),
      causationId: toCausationId("cmd_123"),
      initiatedAt: Date.now(),
    };

    const metadata = toEventMetadata(chain, {
      requestId: "req_xyz",
      customField: 42,
    });

    expect(metadata.correlationId).toBe("corr_456");
    expect(metadata.causationId).toBe("cmd_123");
    expect(metadata.requestId).toBe("req_xyz");
    expect(metadata.customField).toBe(42);
  });

  it("does not include context or initiatedAt from chain", () => {
    const chain: CorrelationChain = {
      commandId: toCommandId("cmd_123"),
      correlationId: toCorrelationId("corr_456"),
      causationId: toCausationId("cmd_123"),
      initiatedAt: Date.now(),
      context: { key: "value" },
    };

    const metadata = toEventMetadata(chain);

    expect("context" in metadata).toBe(false);
    expect("initiatedAt" in metadata).toBe(false);
    expect("commandId" in metadata).toBe(false);
  });
});

describe("isCorrelated", () => {
  it("returns true for chains with same correlationId", () => {
    const chainA: CorrelationChain = {
      commandId: toCommandId("cmd_1"),
      correlationId: toCorrelationId("corr_shared"),
      causationId: toCausationId("cmd_1"),
      initiatedAt: Date.now(),
    };

    const chainB: CorrelationChain = {
      commandId: toCommandId("cmd_2"),
      correlationId: toCorrelationId("corr_shared"),
      causationId: toCausationId("evt_1"),
      initiatedAt: Date.now(),
    };

    expect(isCorrelated(chainA, chainB)).toBe(true);
  });

  it("returns false for chains with different correlationIds", () => {
    const chainA: CorrelationChain = {
      commandId: toCommandId("cmd_1"),
      correlationId: toCorrelationId("corr_first"),
      causationId: toCausationId("cmd_1"),
      initiatedAt: Date.now(),
    };

    const chainB: CorrelationChain = {
      commandId: toCommandId("cmd_2"),
      correlationId: toCorrelationId("corr_second"),
      causationId: toCausationId("evt_1"),
      initiatedAt: Date.now(),
    };

    expect(isCorrelated(chainA, chainB)).toBe(false);
  });
});

describe("isCausedBy", () => {
  it("returns true when child causationId matches parent commandId", () => {
    const parent: CorrelationChain = {
      commandId: toCommandId("cmd_parent"),
      correlationId: toCorrelationId("corr_shared"),
      causationId: toCausationId("cmd_parent"),
      initiatedAt: Date.now(),
    };

    const child: CorrelationChain = {
      commandId: toCommandId("cmd_child"),
      correlationId: toCorrelationId("corr_shared"),
      causationId: toCausationId("cmd_parent"), // Points to parent's commandId
      initiatedAt: Date.now(),
    };

    expect(isCausedBy(parent, child)).toBe(true);
  });

  it("returns false when child causationId does not match", () => {
    const parent: CorrelationChain = {
      commandId: toCommandId("cmd_parent"),
      correlationId: toCorrelationId("corr_shared"),
      causationId: toCausationId("cmd_parent"),
      initiatedAt: Date.now(),
    };

    const child: CorrelationChain = {
      commandId: toCommandId("cmd_child"),
      correlationId: toCorrelationId("corr_shared"),
      causationId: toCausationId("evt_other"), // Points to different cause
      initiatedAt: Date.now(),
    };

    expect(isCausedBy(parent, child)).toBe(false);
  });

  it("returns true for same chain (command is its own cause)", () => {
    const chain: CorrelationChain = {
      commandId: toCommandId("cmd_1"),
      correlationId: toCorrelationId("corr_1"),
      causationId: toCausationId("cmd_1"),
      initiatedAt: Date.now(),
    };

    // Initial commands have causationId === commandId, so isCausedBy returns true
    expect(isCausedBy(chain, chain)).toBe(true);
  });
});

describe("correlation flow scenarios", () => {
  const fixedTime = 1703001234567;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("demonstrates full request flow tracing", () => {
    // Step 1: User submits an order
    const submitOrderChain = createCorrelationChain(toCommandId("cmd_submit_001"), {
      userId: "user_123",
      context: { source: "web-ui" },
    });

    expect(submitOrderChain.commandId).toBe("cmd_submit_001");
    expect(submitOrderChain.causationId).toBe("cmd_submit_001");

    // Step 2: OrderSubmitted event is emitted with chain metadata
    const orderSubmittedMetadata = toEventMetadata(submitOrderChain);
    expect(orderSubmittedMetadata.correlationId).toBe(submitOrderChain.correlationId);

    // Step 3: Saga reacts to OrderSubmitted, triggers ReserveStock
    const orderSubmittedEvent: CausationSource = {
      eventId: toEventId("evt_order_submitted_001"),
      correlationId: submitOrderChain.correlationId,
      userId: submitOrderChain.userId,
      context: submitOrderChain.context,
    };

    const reserveStockChain = deriveCorrelationChain(orderSubmittedEvent);

    // Verify the chain relationships
    expect(reserveStockChain.correlationId).toBe(submitOrderChain.correlationId); // Same correlation
    expect(reserveStockChain.causationId).toBe("evt_order_submitted_001"); // Points to triggering event
    expect(reserveStockChain.userId).toBe("user_123"); // Inherited
    expect(reserveStockChain.context).toEqual({ source: "web-ui" }); // Inherited

    // Verify chains are correlated
    expect(isCorrelated(submitOrderChain, reserveStockChain)).toBe(true);
  });

  it("demonstrates multi-step saga with correlation preservation", () => {
    // Initial command
    const initialChain = createCorrelationChain(toCommandId("cmd_1"), {
      correlationId: toCorrelationId("corr_saga_flow"),
    });

    // Event 1 triggers Command 2
    const event1: CausationSource = {
      eventId: toEventId("evt_1"),
      correlationId: initialChain.correlationId,
    };
    const chain2 = deriveCorrelationChain(event1);

    // Event 2 triggers Command 3
    const event2: CausationSource = {
      eventId: toEventId("evt_2"),
      correlationId: chain2.correlationId,
    };
    const chain3 = deriveCorrelationChain(event2);

    // All chains share the same correlationId
    expect(chain2.correlationId).toBe("corr_saga_flow");
    expect(chain3.correlationId).toBe("corr_saga_flow");

    // Each chain has different causationId (different direct cause)
    expect(chain2.causationId).toBe("evt_1");
    expect(chain3.causationId).toBe("evt_2");

    // All chains are correlated
    expect(isCorrelated(initialChain, chain2)).toBe(true);
    expect(isCorrelated(chain2, chain3)).toBe(true);
    expect(isCorrelated(initialChain, chain3)).toBe(true);
  });
});

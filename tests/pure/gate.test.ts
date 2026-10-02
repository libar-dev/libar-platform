import {
  paginationOptsValidator,
  paginationResultValidator,
  type GenericDataModel,
  type GenericMutationCtx,
} from "convex/server";
import { v } from "convex/values";
import { expect, test, vi } from "vitest";
import { assertOperator, limitOperatorBytes } from "../../src/command/index.js";
import {
  closeGate,
  resumeGate,
  getGate,
  getGateAudit,
  scopesOfUseCase,
} from "../../src/gate/index.js";
import { gateHandler } from "./gate-handlers.js";

// spec:command.actor-and-scope fnAssertOperator, limitOperatorBytes.
test.each(["", " ", "\t\n", "\u2003", " ".repeat(512), " ".repeat(513)])(
  "pure: an empty or whitespace operator %j is refused",
  (operator) => {
    expect(() => assertOperator(operator)).toThrow(
      new Error("An operator entry needs a stated operator"),
    );
  },
);

// spec:command.actor-and-scope fnAssertOperator, limitOperatorBytes.
test.each(["a", " a ", "a".repeat(512), "é".repeat(256), "😀".repeat(128)])(
  "pure: a bounded operator is returned unchanged, %j",
  (operator) => {
    expect(limitOperatorBytes).toBe(512);
    expect(assertOperator(operator)).toBe(operator);
  },
);

// spec:command.actor-and-scope fnAssertOperator.
test.each(["a".repeat(513), "é".repeat(256) + "a", "😀".repeat(128) + "é"])(
  "pure: an operator over the UTF-8 bound is refused, %j",
  (operator) => {
    const bytes = new TextEncoder().encode(operator).length;
    expect(() => assertOperator(operator)).toThrow(
      new Error(
        `The stated operator is ${bytes} bytes, above the limit of 512`,
      ),
    );
  },
);

// spec:application.write-pause fnScopesOfUseCase, typeScopeKey.
test("pure: scopes preserve declaration order and the whole tenant ID", () => {
  const writes = [
    { contextId: "depot", streamType: "stock" },
    { contextId: "depot", streamType: "document" },
    { contextId: "depot", streamType: "stock" },
  ];
  expect(scopesOfUseCase("source:depot:stock", writes)).toEqual([
    "all",
    "tenant:source:depot:stock",
    "source:depot:stock",
    "source:depot:document",
    "source:depot:stock",
  ]);
  expect(scopesOfUseCase("t", [])).toEqual(["all", "tenant:t"]);
});

for (const entry of ["closeGate", "resumeGate"] as const) {
  // spec:application.write-pause fnCloseGate, fnResumeGate.
  test.each([
    "",
    "tenant:",
    "source:depot:document",
    "All",
    "tenant:" + "a".repeat(257),
    "tenant:" + "é".repeat(129),
  ])(
    `pure: ${entry} refuses invalid scope %j before a read`,
    async (scopeKey) => {
      const access = vi.fn(() => {
        throw new Error("Database accessed");
      });
      const ctx = new Proxy(
        {},
        { get: access },
      ) as GenericMutationCtx<GenericDataModel>;
      await expect(
        gateHandler(entry)._handler(ctx, {
          scopeKey,
          reason: "work",
          operator: "op",
        }),
      ).rejects.toThrow(
        new Error(
          `${entry} takes the scope all or a tenant scope, and ${scopeKey} is neither`,
        ),
      );
      expect(access).not.toHaveBeenCalled();
    },
  );

  // spec:application.write-pause fnCloseGate, fnResumeGate, typeScopeKey.
  test.each([
    "all",
    "tenant:t",
    "tenant: ",
    "tenant:source:depot:document",
    "tenant:" + "a".repeat(256),
    "tenant:" + "é".repeat(128),
  ])(`pure: ${entry} accepts the scope syntax %j`, async (scopeKey) => {
    const access = vi.fn(() => {
      throw new Error("Reached database");
    });
    const ctx = {
      db: new Proxy({}, { get: access }),
    } as GenericMutationCtx<GenericDataModel>;
    await expect(
      gateHandler(entry)._handler(ctx, {
        scopeKey,
        reason: "work",
        operator: "op",
      }),
    ).rejects.toThrow(new Error("Reached database"));
    expect(access).toHaveBeenCalled();
  });
}

// spec:application.write-pause fnCloseGate, fnResumeGate, fnGetGate, fnGetGateAudit, validatorClosedEntry.
test("pure: registered gate entries export the exact argument and return validators", () => {
  const closed = v.object({
    scopeKey: v.string(),
    reason: v.string(),
    generationId: v.optional(v.id("generations")),
    changedAt: v.number(),
    changedBy: v.string(),
  });
  const audit = v.object({
    _id: v.id("operatorAudit"),
    _creationTime: v.number(),
    kind: v.union(v.literal("gate.close"), v.literal("gate.resume")),
    scopeKey: v.string(),
    reason: v.string(),
    generationId: v.optional(v.id("generations")),
    operator: v.string(),
    recordedAt: v.number(),
  });
  const cases = [
    [
      closeGate,
      v.object({
        scopeKey: v.string(),
        reason: v.string(),
        operator: v.string(),
      }),
      v.null(),
    ],
    [
      resumeGate,
      v.object({ scopeKey: v.string(), operator: v.string() }),
      v.null(),
    ],
    [
      getGate,
      v.object({}),
      v.object({ restore: v.boolean(), closed: v.array(closed) }),
    ],
    [
      getGateAudit,
      v.object({
        scopeKey: v.string(),
        paginationOpts: paginationOptsValidator,
      }),
      paginationResultValidator(audit),
    ],
  ] as const;
  for (const [entry, args, returns] of cases) {
    const exported = entry as unknown as {
      exportArgs(): string;
      exportReturns(): string;
      isInternal: boolean;
    };
    expect(exported.isInternal).toBe(true);
    expect(JSON.parse(exported.exportArgs())).toEqual(
      (args as unknown as { json: unknown }).json,
    );
    expect(JSON.parse(exported.exportReturns())).toEqual(
      (returns as unknown as { json: unknown }).json,
    );
  }
});

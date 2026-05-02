import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { makeFunctionReference } from "convex/server";
import { createVerificationProof } from "../../../src/security/verificationProof.js";
import { generateTestId } from "../support/helpers";
import { testMutation, testQuery } from "../../../src/testing/integration-helpers.js";

declare const process: { env: Record<string, string | undefined> };

const recordPendingApprovalRef = makeFunctionReference<"mutation">(
  "testingFunctions:testRecordPendingApproval"
);
const approveWithProofRef = makeFunctionReference<"mutation">(
  "testingFunctions:testComponentApproveWithProof"
);
const rejectWithProofRef = makeFunctionReference<"mutation">(
  "testingFunctions:testComponentRejectWithProof"
);
const auditWithProofRef = makeFunctionReference<"mutation">(
  "testingFunctions:testComponentAuditRecordWithProof"
);
const commandWithProofRef = makeFunctionReference<"mutation">(
  "testingFunctions:testComponentCommandRecordWithProof"
);
const appendWithProofRef = makeFunctionReference<"mutation">(
  "testingFunctions:testComponentAppendToStreamWithProof"
);
const commitScopeWithProofRef = makeFunctionReference<"mutation">(
  "testingFunctions:testComponentCommitScopeWithProof"
);
const getApprovalByIdRef = makeFunctionReference<"query">("queries/agent:getApprovalById");
const getAuditByDecisionIdRef = makeFunctionReference<"query">(
  "testingFunctions:getAgentAuditEventByDecisionId"
);
const getCommandByDecisionIdRef = makeFunctionReference<"query">(
  "testingFunctions:getAgentCommandByDecisionId"
);
const getEventsForStreamRef = makeFunctionReference<"query">("testingFunctions:getEventsForStream");
const getScopeByKeyRef = makeFunctionReference<"query">("testingFunctions:getScopeByKey");

describe("Component-boundary authentication", () => {
  let t: ConvexTestingHelper;

  beforeEach(() => {
    t = new ConvexTestingHelper({
      backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
    });
  });

  afterEach(async () => {
    await t.close();
  });

  it("accepts a valid reviewer proof for approval", async () => {
    const approvalId = generateTestId("apr");
    const reviewerId = generateTestId("reviewer");

    await testMutation(t, recordPendingApprovalRef, {
      approvalId,
      agentId: generateTestId("agent"),
      decisionId: generateTestId("dec"),
      action: { type: "SuggestCustomerOutreach", payload: { customerId: generateTestId("cust") } },
      confidence: 0.72,
      reason: "Needs human review",
      triggeringEventIds: [generateTestId("evt")],
      expiresAt: Date.now() + 60_000,
    });

    const verificationProof = await createVerificationProof({
      target: "agentBC",
      issuer: "platform-core:test:component-boundary-auth",
      subjectId: reviewerId,
      subjectType: "reviewer",
      boundedContext: "agent",
    });

    const result = await testMutation(t, approveWithProofRef, {
      approvalId,
      reviewerId,
      reviewNote: "Looks good",
      verificationProof,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error);
    }
    expect(result.result.status).toBe("approved");

    const approval = await testQuery(t, getApprovalByIdRef, { approvalId });
    expect(approval?.status).toBe("approved");
    expect(approval?.reviewerId).toBe(reviewerId);
  });

  it("accepts valid proofs for audit, command recording, and appendToStream", async () => {
    const agentId = generateTestId("agent");
    const auditDecisionId = generateTestId("dec");
    const commandDecisionId = generateTestId("dec");
    const streamId = generateTestId("ord");

    const agentProof = await createVerificationProof({
      target: "agentBC",
      issuer: "platform-core:test:component-boundary-auth:agent",
      subjectId: agentId,
      subjectType: "agent",
      boundedContext: "agent",
    });

    const auditResult = await testMutation(t, auditWithProofRef, {
      eventType: "CommandEmitted",
      agentId,
      decisionId: auditDecisionId,
      timestamp: Date.now(),
      payload: { commandType: "SuggestCustomerOutreach" },
      verificationProof: agentProof,
    });

    expect(auditResult.success).toBe(true);
    const auditEvent = await testQuery(t, getAuditByDecisionIdRef, { decisionId: auditDecisionId });
    expect(auditEvent?.agentId).toBe(agentId);

    const commandResult = await testMutation(t, commandWithProofRef, {
      agentId,
      type: "SuggestCustomerOutreach",
      payload: { customerId: generateTestId("cust") },
      confidence: 0.93,
      reason: "High churn risk",
      triggeringEventIds: [generateTestId("evt")],
      decisionId: commandDecisionId,
      verificationProof: agentProof,
    });

    expect(commandResult.success).toBe(true);
    const command = await testQuery(t, getCommandByDecisionIdRef, {
      decisionId: commandDecisionId,
    });
    expect(command?.agentId).toBe(agentId);

    const appendProof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-core:test:component-boundary-auth:eventStore",
      subjectId: "orders",
      subjectType: "boundedContext",
      boundedContext: "orders",
    });

    const appendResult = await testMutation(t, appendWithProofRef, {
      streamType: "Order",
      streamId,
      expectedVersion: 0,
      boundedContext: "orders",
      events: [
        {
          eventId: generateTestId("evt"),
          eventType: "OrderCreated",
          payload: { orderId: streamId },
          metadata: { correlationId: generateTestId("corr") },
        },
      ],
      verificationProof: appendProof,
    });

    expect(appendResult.success).toBe(true);
    const events = await testQuery(t, getEventsForStreamRef, {
      streamType: "Order",
      streamId,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.boundedContext).toBe("orders");

    const scopeKey = `tenant:tenant-scope-a:reservation:${generateTestId("scope")}`;
    const scopeProof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-core:test:component-boundary-auth:commitScope",
      subjectId: "inventory",
      subjectType: "boundedContext",
      boundedContext: "inventory",
      tenantId: "tenant-scope-a",
    });

    const scopeResult = await testMutation(t, commitScopeWithProofRef, {
      scopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
      streamIds: [generateTestId("stream")],
      verificationProof: scopeProof,
    });

    expect(scopeResult.success).toBe(true);
    const scope = await testQuery(t, getScopeByKeyRef, { scopeKey });
    expect(scope?.boundedContext).toBe("inventory");
    expect(scope?.tenantId).toBe("tenant-scope-a");
    expect(scope?.scopeType).toBe("reservation");
    expect(scope?.currentVersion).toBe(1);
  });

  it("rejects commitScope when another bounded context reuses an existing scope key", async () => {
    const scopeKey = `tenant:tenant-owned-scope:reservation:${generateTestId("scope")}`;
    const createProof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-core:test:component-boundary-auth:commitScope:owner",
      subjectId: "inventory",
      subjectType: "boundedContext",
      boundedContext: "inventory",
      tenantId: "tenant-owned-scope",
    });

    const initial = await testMutation(t, commitScopeWithProofRef, {
      scopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
      streamIds: [generateTestId("stream")],
      verificationProof: createProof,
    });
    expect(initial.success).toBe(true);

    const reuseProof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-core:test:component-boundary-auth:commitScope:reuse",
      subjectId: "orders",
      subjectType: "boundedContext",
      boundedContext: "orders",
      tenantId: "tenant-owned-scope",
    });

    const result = await testMutation(t, commitScopeWithProofRef, {
      scopeKey,
      expectedVersion: 1,
      boundedContext: "orders",
      streamIds: [generateTestId("stream")],
      verificationProof: reuseProof,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected scope ownership mismatch to fail");
    }
    expect(result.error).toContain("belongs to bounded context inventory");

    const scope = await testQuery(t, getScopeByKeyRef, { scopeKey });
    expect(scope?.boundedContext).toBe("inventory");
    expect(scope?.currentVersion).toBe(1);
    expect(scope?.streamIds).toHaveLength(1);
  });

  it("rejects scoped append when another bounded context targets an existing scope", async () => {
    const scopeKey = `tenant:tenant-scoped-append:reservation:${generateTestId("scope")}`;
    const inventoryProof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-core:test:component-boundary-auth:scoped-append:owner",
      subjectId: "inventory",
      subjectType: "boundedContext",
      boundedContext: "inventory",
      tenantId: "tenant-scoped-append",
    });

    const created = await testMutation(t, commitScopeWithProofRef, {
      scopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
      streamIds: [generateTestId("stream")],
      verificationProof: inventoryProof,
    });
    expect(created.success).toBe(true);

    const ordersProof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-core:test:component-boundary-auth:scoped-append:foreign",
      subjectId: "orders",
      subjectType: "boundedContext",
      boundedContext: "orders",
      tenantId: "tenant-scoped-append",
    });
    const foreignStreamId = generateTestId("ord");

    const result = await testMutation(t, appendWithProofRef, {
      streamType: "Order",
      streamId: foreignStreamId,
      expectedVersion: 0,
      boundedContext: "orders",
      tenantId: "tenant-scoped-append",
      events: [
        {
          eventId: generateTestId("evt"),
          eventType: "OrderCreated",
          scopeKey,
          payload: { orderId: foreignStreamId },
          metadata: { correlationId: generateTestId("corr") },
        },
      ],
      verificationProof: ordersProof,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected scoped append ownership mismatch to fail");
    }
    expect(result.error).toContain("belongs to bounded context inventory");

    const scope = await testQuery(t, getScopeByKeyRef, { scopeKey });
    expect(scope?.boundedContext).toBe("inventory");
    expect(scope?.currentVersion).toBe(1);

    const events = await testQuery(t, getEventsForStreamRef, {
      streamType: "Order",
      streamId: foreignStreamId,
    });
    expect(events).toHaveLength(0);
  });

  it("rejects a forged commitScope proof and creates no scope", async () => {
    const scopeKey = `tenant:tenant-forged:reservation:${generateTestId("scope")}`;
    const proof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-core:test:component-boundary-auth:commitScope:forged",
      subjectId: "inventory",
      subjectType: "boundedContext",
      boundedContext: "inventory",
      tenantId: "tenant-forged",
    });

    const result = await testMutation(t, commitScopeWithProofRef, {
      scopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
      streamIds: [generateTestId("stream")],
      verificationProof: { ...proof, signature: `${proof.signature}-forged` },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected forged commitScope proof to fail");
    }
    expect(result.error).toContain("Verification proof rejected");

    const scope = await testQuery(t, getScopeByKeyRef, { scopeKey });
    expect(scope).toBeNull();
  });

  it("rejects commitScope with the wrong bounded context", async () => {
    const scopeKey = `tenant:tenant-wrong-bc:reservation:${generateTestId("scope")}`;
    const proof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-core:test:component-boundary-auth:commitScope:wrong-bc",
      subjectId: "inventory",
      subjectType: "boundedContext",
      boundedContext: "orders",
      tenantId: "tenant-wrong-bc",
    });

    const result = await testMutation(t, commitScopeWithProofRef, {
      scopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
      streamIds: [generateTestId("stream")],
      verificationProof: proof,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected wrong bounded context to fail");
    }
    expect(result.error).toContain("bounded context mismatch");

    const scope = await testQuery(t, getScopeByKeyRef, { scopeKey });
    expect(scope).toBeNull();
  });

  it("rejects commitScope with the wrong tenant", async () => {
    const scopeKey = `tenant:tenant-a:reservation:${generateTestId("scope")}`;
    const proof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-core:test:component-boundary-auth:commitScope:tenant",
      subjectId: "inventory",
      subjectType: "boundedContext",
      boundedContext: "inventory",
      tenantId: "tenant-b",
    });

    const result = await testMutation(t, commitScopeWithProofRef, {
      scopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
      streamIds: [generateTestId("stream")],
      verificationProof: proof,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected wrong tenant to fail");
    }
    expect(result.error).toContain("tenant mismatch");

    const scope = await testQuery(t, getScopeByKeyRef, { scopeKey });
    expect(scope).toBeNull();
  });

  it("rejects commitScope without a proof", async () => {
    const scopeKey = `tenant:tenant-missing-proof:reservation:${generateTestId("scope")}`;

    const result = await testMutation(t, commitScopeWithProofRef, {
      scopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
      streamIds: [generateTestId("stream")],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected missing proof to fail");
    }

    const scope = await testQuery(t, getScopeByKeyRef, { scopeKey });
    expect(scope).toBeNull();
  });

  it("rejects malformed scope keys before writing a scope", async () => {
    const proof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-core:test:component-boundary-auth:commitScope:malformed",
      subjectId: "inventory",
      subjectType: "boundedContext",
      boundedContext: "inventory",
      tenantId: "tenant-malformed",
    });

    const result = await testMutation(t, commitScopeWithProofRef, {
      scopeKey: "invalid_scope_key",
      expectedVersion: 0,
      boundedContext: "inventory",
      streamIds: [generateTestId("stream")],
      verificationProof: proof,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected malformed scope key to fail");
    }
    expect(result.error).toContain("Invalid scope key format");
  });

  it("rejects a forged proof and leaves no audit write behind", async () => {
    const decisionId = generateTestId("dec");
    const agentId = generateTestId("agent");

    const proof = await createVerificationProof({
      target: "agentBC",
      issuer: "platform-core:test:component-boundary-auth:forged",
      subjectId: agentId,
      subjectType: "agent",
      boundedContext: "agent",
    });

    const result = await testMutation(t, auditWithProofRef, {
      eventType: "CommandEmitted",
      agentId,
      decisionId,
      timestamp: Date.now(),
      payload: { commandType: "ForgedCommand" },
      verificationProof: {
        ...proof,
        signature: `${proof.signature}-forged`,
      },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected forged proof to fail");
    }
    expect(result.error).toContain("Verification proof rejected");

    const auditEvent = await testQuery(t, getAuditByDecisionIdRef, { decisionId });
    expect(auditEvent).toBeNull();
  });

  it("rejects the wrong bounded context and leaves the approval pending", async () => {
    const approvalId = generateTestId("apr");
    const reviewerId = generateTestId("reviewer");

    await testMutation(t, recordPendingApprovalRef, {
      approvalId,
      agentId: generateTestId("agent"),
      decisionId: generateTestId("dec"),
      action: { type: "FlagCustomerForReview", payload: { customerId: generateTestId("cust") } },
      confidence: 0.41,
      reason: "Unclear signal",
      triggeringEventIds: [generateTestId("evt")],
      expiresAt: Date.now() + 60_000,
    });

    const verificationProof = await createVerificationProof({
      target: "agentBC",
      issuer: "platform-core:test:component-boundary-auth:wrong-context",
      subjectId: reviewerId,
      subjectType: "reviewer",
      boundedContext: "inventory",
    });

    const result = await testMutation(t, rejectWithProofRef, {
      approvalId,
      reviewerId,
      reviewNote: "Wrong context should fail",
      verificationProof,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected wrong bounded context to fail");
    }
    expect(result.error).toContain("bounded context mismatch");

    const approval = await testQuery(t, getApprovalByIdRef, { approvalId });
    expect(approval?.status).toBe("pending");
    expect(approval?.reviewerId).toBeUndefined();
  });

  it("rejects the wrong tenant and writes no event", async () => {
    const streamId = generateTestId("ord");
    const verificationProof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-core:test:component-boundary-auth:tenant",
      subjectId: "orders",
      subjectType: "boundedContext",
      boundedContext: "orders",
      tenantId: "tenant-b",
    });

    const result = await testMutation(t, appendWithProofRef, {
      streamType: "Order",
      streamId,
      expectedVersion: 0,
      boundedContext: "orders",
      tenantId: "tenant-a",
      events: [
        {
          eventId: generateTestId("evt"),
          eventType: "OrderCreated",
          payload: { orderId: streamId },
          metadata: { correlationId: generateTestId("corr") },
        },
      ],
      verificationProof,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected wrong tenant to fail");
    }
    expect(result.error).toContain("tenant mismatch");

    const events = await testQuery(t, getEventsForStreamRef, {
      streamType: "Order",
      streamId,
    });
    expect(events).toHaveLength(0);
  });

  it("rejects a missing proof and records no command", async () => {
    const decisionId = generateTestId("dec");
    const result = await testMutation(t, commandWithProofRef, {
      agentId: generateTestId("agent"),
      type: "SuggestCustomerOutreach",
      payload: { customerId: generateTestId("cust") },
      confidence: 0.55,
      reason: "Missing proof should fail",
      triggeringEventIds: [generateTestId("evt")],
      decisionId,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected missing proof to fail");
    }

    const command = await testQuery(t, getCommandByDecisionIdRef, { decisionId });
    expect(command).toBeNull();
  });
});

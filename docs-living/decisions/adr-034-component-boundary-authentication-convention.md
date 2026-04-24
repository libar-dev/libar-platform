# ADR-034: ADR 034 Component Boundary Authentication Convention

**Purpose:** Architecture decision record for ADR 034 Component Boundary Authentication Convention

---

## Overview

| Property | Value        |
| -------- | ------------ |
| Status   | accepted     |
| Category | architecture |

## Context

| Constraint                                                     | Implication                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ctx.auth does not cross component boundaries                   | The parent must pass an explicit verification artifact                                 |
| Components cannot read process.env                             | Verification cannot depend on bearer tokens or env-backed secrets inside the component |
| Component writes participate in the parent mutation atomically | Verification must happen at the component mutation boundary before any state change    |

| Option                                                   | Pros                                                                              | Cons                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Pass bearer/JWT token into the component                 | Reuses existing auth token                                                        | Rejected: leaks bearer material across boundary and couples component code to token semantics |
| Trust caller-supplied IDs and annotate callers           | Minimal code churn                                                                | Rejected: this is the trust vacuum that created P11                                           |
| Verify inside the component with a signed proof (chosen) | Keeps boundary explicit, rejects tampering, composes with atomic parent mutations | Caller must mint a proof for each identity-bearing call                                       |

Convex component boundaries do not carry ctx.auth across the boundary, yet the caller and component still
    execute inside the same top-level transaction. The insecure gap is not transactionality; it is trust.

    The broken pattern is a component mutation accepting caller-supplied identity fields such as reviewerId,
    agentId, boundedContext, or tenantId as plain strings and treating them as authoritative.

    Authoritative constraints:


    Alternatives considered:

## Decision

| Field          | Required | Meaning                                                         |
| -------------- | -------- | --------------------------------------------------------------- |
| issuer         | yes      | App-level mutation or tool that minted the proof                |
| subjectId      | yes      | Claimed actor or scoped identity being bound to the call        |
| subjectType    | yes      | reviewer, agent, boundedContext, or system                      |
| boundedContext | yes      | Context the proof is valid for                                  |
| tenantId       | optional | Tenant scope when the boundary requires tenant binding          |
| issuedAt       | yes      | Proof creation timestamp                                        |
| expiresAt      | yes      | Proof expiration timestamp                                      |
| nonce          | yes      | Unique per-proof nonce to prevent accidental replay equivalence |
| signature      | yes      | Integrity field computed over the canonical payload             |

| Check                             | Result when failing |
| --------------------------------- | ------------------- |
| signature mismatch                | Reject              |
| issuedAt in the future            | Reject              |
| expiresAt in the past             | Reject              |
| boundedContext mismatch           | Reject              |
| tenantId mismatch (when expected) | Reject              |
| subjectId or subjectType mismatch | Reject              |

Every identity-bearing component mutation in scope accepts a canonical verificationProof object and calls
    verifyActor() inside the component mutation before reading or writing component state.

    Canonical verificationProof contract:


    verifyActor() contract:


    Enforcement rule: on success, the component must treat the verified proof as the source of truth for the
    trusted actor/context values. Raw caller-supplied reviewerId, agentId, boundedContext, and tenantId are
    only binding inputs to compare against the proof, never the trusted values that get persisted.

## Consequences

Positive outcomes:
    - Component-side verification closes the trust vacuum without passing bearer tokens into components
    - Wrong boundedContext, tenantId, reviewerId, or agentId claims are rejected before mutation writes
    - The parent app still owns end-user authentication, while the component owns boundary verification
    - The convention is reusable for future identity-bearing component mutations

    Negative outcomes:
    - Parent mutations and infrastructure clients must mint verificationProof objects for component calls
    - Component-local verification helpers duplicate the proof algorithm because component code cannot import the parent package implementation directly

## Rules

### Scope - The tranche-1 keystone packet migrates all targeted mutations together

| Surface              | Trusted binding enforced by verifyActor() |
| -------------------- | ----------------------------------------- |
| approve              | reviewerId + boundedContext=agent         |
| reject               | reviewerId + boundedContext=agent         |
| audit.record         | agentId + boundedContext=agent            |
| agentCommands.record | agentId + boundedContext=agent            |
| appendToStream       | boundedContext (+ tenantId when provided) |

P11 lands as one atomic packet across the currently targeted identity-bearing mutations:


    The packet must not leave a mixed state where some of the listed mutations still trust raw caller fields.

---

[← Back to All Decisions](../DECISIONS.md)

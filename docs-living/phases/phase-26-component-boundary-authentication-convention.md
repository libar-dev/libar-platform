# ComponentBoundaryAuthenticationConvention

**Purpose:** Detailed patterns for ComponentBoundaryAuthenticationConvention

---

## Summary

**Progress:** [░░░░░░░░░░░░░░░░░░░░] 0/1 (0%)

| Status      | Count |
| ----------- | ----- |
| ✅ Completed | 0     |
| 🚧 Active   | 0     |
| 📋 Planned  | 1     |
| **Total**   | 1     |

---

## 📋 Planned Patterns

### 📋 Component Boundary Authentication Convention

| Property       | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| Status         | planned                                                                   |
| Effort         | 1w                                                                        |
| Quarter        | Q2-2026                                                                   |
| Business Value | close the trust vacuum at component boundaries before later security work |

**Problem:** Identity-bearing component mutations still trust caller-provided actor fields
  without a canonical component-side proof contract. Fixing the affected mutations piecemeal would
  create drift and leave a mixed-trust window across approvals, audit, and event append flows.

  **Solution:** Plan P11 as one atomic remediation packet: ADR-034 defines the canonical
  `verificationProof` contract, the `verifyActor()` helper becomes the default component-side gate,
  and all listed mutation sites migrate in the same implementation session.

#### Dependencies

- Depends on: Tranche0ReadinessHarness
- Depends on: Tranche0ReleaseCiDocsProcessGuardrails

#### Acceptance Criteria

**Auth remediation is not split by mutation family**

- Given the component-boundary auth packet is in roadmap state
- When implementation begins
- Then all identity-bearing mutation sites listed in the remediation plan are in the same packet
- And ADR-034 is committed before the packet can complete

**Missing or forged proof is rejected by default**

- Given a component mutation requiring actor identity
- When the proof is missing, expired, mismatched, or forged
- Then the mutation is rejected before any write occurs

#### Business Rules

**P11 ships as one atomic packet**

The auth convention is the tranche-1 keystone. Approve, reject, audit, agent command recording,
    and event append migration stay in one packet so no component mutation remains on the old trust model.

_Verified by: Auth remediation is not split by mutation family_

**Verification is component-side and defaults to deny**

The proof contract is checked inside the component mutation boundary, not by parent-app trust alone.
    Evidence for this packet follows `.sisyphus/evidence/task-4-component-boundary-auth.{ext}`.

_Verified by: Missing or forged proof is rejected by default_

---

[← Back to Roadmap](../ROADMAP.md)

# ThemedDecisionArchitecture

**Purpose:** Active work details for ThemedDecisionArchitecture

---

## Progress

**Progress:** [██████████░░░░░░░░░░] 3/6 (50%)

| Status       | Count |
| ------------ | ----- |
| ✅ Completed | 3     |
| 🚧 Active    | 1     |
| 📋 Planned   | 2     |
| **Total**    | 6     |

---

## 🚧 Active Work

### 🚧 Process Enhancements

| Property       | Value                                   |
| -------------- | --------------------------------------- |
| Effort         | 4w                                      |
| Quarter        | Q1-2026                                 |
| Business Value | unify process enhancement opportunities |

**Vision:** Transform the delivery process from a documentation tool into a delivery operating system.

Enable code-driven, multi-workflow documentation where code + .feature
files are authoritative sources, and all artifacts are generated projections.

**Problem:** Current delivery process capabilities are limited to document generation.
The convergence roadmap identified 8 opportunities: Process Views as Projections,
DoD as Machine-Checkable, Earned-Value Tracking, Requirements-Tests Traceability,
Architecture Change Control, Progressive Governance, and Living Roadmap.

**Solution:** Incrementally implement convergence opportunities, starting with foundation
work (metadata tags) and progressing to validators, generators, and eventually
Convex-native live projections.

**Strategic Direction:**

- Package (@libar-dev/delivery-process): Document generation capabilities
- Monorepo: Eventually leverage Convex projections for live queryable views

**Architecture Decision (PDR-002):**
Specs (this file) capture requirements that can evolve independently.
TypeScript phase files link deliverables to phases/releases centrally.
This separation enables specs to be combined, split, or refined without
affecting release association.

See: deps/libar-dev-packages/packages/tooling/delivery-process/docs/ideation-convergence/

#### Acceptance Criteria

**Specs can evolve independently of phases**

- Given a spec file in delivery-process/specs/
- When the spec is refined, split, or combined
- Then TypeScript phase files maintain release association
- And no phase metadata needs updating in the spec

**TypeScript phase files link specs to releases**

- Given a TypeScript phase file in delivery-process/src/phases/
- Then it references the spec by pattern name
- And contains minimal metadata (phase, status, quarter, effort)
- And centralized location enables consistent release tracking

---

## ✅ Recently Completed

| Pattern                              | Description                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| ✅ Codec Driven Reference Generation | Reference documentation is specified via 11 recipe `.feature` files in `delivery-process/recipes/`.             |
| ✅ Process Metadata Expansion        | The monorepo's delivery process lacked metadata tags for variance tracking, governance, and hierarchical views. |
| ✅ Repo Level Docs Generation        | As a monorepo maintainer, I want unified documentation generation from multiple sources.                        |

---

<details>
<summary>📋 Upcoming (2)</summary>

| Pattern                         | Effort |
| ------------------------------- | ------ |
| 📋 Test Content Blocks          | -      |
| 📋 Themed Decision Architecture | -      |

</details>

---

[← Back to Current Work](../CURRENT-WORK.md)

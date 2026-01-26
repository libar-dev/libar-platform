# ✅ Process Metadata Expansion

**Purpose:** Detailed requirements for the Process Metadata Expansion feature

---

## Overview

| Property       | Value                                   |
| -------------- | --------------------------------------- |
| Status         | completed                               |
| Product Area   | DeliveryProcess                         |
| Business Value | enable variance and governance tracking |
| Phase          | 100                                     |

## Description

**Problem:**
The monorepo's delivery process lacked metadata tags for variance tracking, governance, and hierarchical views.
Missing tag categories included:

- Variance tracking (planned vs actual effort)
- Progressive governance (risk-based filtering)
- Backlog ordering (priority)
- Time distribution analysis (workflow types)
- Hierarchical roadmap views (epic→phase→task)

Without these tags, opportunities 2-8 from the convergence roadmap could not
be implemented. The tag registry needed expansion to enable future capabilities.

**Solution:**
Added 6 new metadata tags to delivery-process/tag-registry.json:

- @libar-process-risk:{low|medium|high} - Progressive governance (Opp 6)
- @libar-process-effort-actual:Nw - Variance tracking (Opp 3)
- @libar-process-workflow:{design|impl|docs|testing|discovery} - Time distribution
- @libar-process-priority:{high|medium|low} - Backlog ordering
- @libar-process-level:{epic|phase|task} - Hierarchy support (Opp 8)
- @libar-process-parent:PatternName - Hierarchy linking (Opp 8)

Updated PDR-003 with new tag conventions and acceptance criteria.

This work is foundation for Setup A (Framework Roadmap OS) from convergence docs.

## Acceptance Criteria

**New tags are defined in tag registry**

- Given the delivery-process/tag-registry.json file
- Then it should contain metadataTags for risk, effort-actual, workflow, priority, level, parent
- And each tag should have format, purpose, and example fields
- And enum tags should have values and default fields

**PDR-003 documents new tag conventions**

- Given the PDR-003 decision file
- Then it should document process metadata tags section
- And it should document hierarchy tags section

**Tags enable filtering in generated docs**

- Given TypeScript phase files with new metadata tags
- When generating roadmap documentation
- Then patterns can be filtered by risk, priority, workflow
- And hierarchy relationships are rendered

## Deliverables

- Risk tag in registry (Complete)
- Effort-actual tag in registry (Complete)
- Workflow tag in registry (Complete)
- Priority tag in registry (Complete)
- Level tag in registry (Complete)
- Parent tag in registry (Complete)
- PDR-003 tag conventions update (Complete)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)

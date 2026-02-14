# 📋 Pattern Executor — DS-4 Stub

**Purpose:** Detailed documentation for the Pattern Executor — DS-4 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

Pattern Executor — DS-4 Stub

Iterates an agent's pattern array, calling trigger() then analyze() for
each pattern. Short-circuits on the first detected match to avoid
unnecessary LLM calls. Returns a simplified execution summary for audit.

## Design Decisions

- AD-3: Iterate with short-circuit on first match
- Array order equals developer-controlled priority
- Trigger-only patterns (no analyze) produce rule-based decisions

See: PDR-012 (Agent Command Routing & Pattern Unification)
See: PatternDefinition (platform-core/src/agent/patterns.ts)
Since: DS-4 (Command Routing & Pattern Unification)

## Type Extensions

PatternAnalysisResult gains:
readonly command?: { readonly type: string; readonly payload: unknown };
Explicit command output from analyze(), decoupling the framework from
pattern-specific result.data structures. See buildDecisionFromAnalysis.

REMOVED (holistic review, item 3.2):

- onAnalyzeFailure: analyze() errors now propagate to Workpool for retry.
  No in-process fallback — errors are retried or dead-lettered.
- defaultCommand: no spec exercises trigger-only command emission.

---

[← Back to Pattern Registry](../PATTERNS.md)

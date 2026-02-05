# 🚧 Command Config Partition Key Validation

**Purpose:** Detailed documentation for the Command Config Partition Key Validation pattern

---

## Overview

| Property | Value      |
| -------- | ---------- |
| Status   | active     |
| Category | Implements |

## Description

Validates that all projection configurations in a command config
have explicit partition keys defined. This prevents runtime errors
and ensures intentional partition key selection.

### Validation Rules

1. Every projection config must have `getPartitionKey` defined
2. Partition key function must return valid `{ name, value }` shape
3. Value must be a non-empty string

### Error Handling

Validation collects all errors and throws a single comprehensive error.
This allows developers to fix all issues at once rather than iteratively.

## Use Cases

- When validating command configs have explicit partition keys

---

[← Back to Pattern Registry](../PATTERNS.md)

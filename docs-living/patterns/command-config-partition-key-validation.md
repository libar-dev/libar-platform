# 🚧 Command Config Partition Key Validation

**Purpose:** Detailed documentation for the Command Config Partition Key Validation pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | active  |
| Category | Command |

## Description

Validates that all projection configurations in a command config
have explicit partition keys defined. This prevents runtime errors
and ensures intentional partition key selection.

Known limitation: this validates partition-key selection and shape, but does not
make Workpool enforce FIFO ordering via a native `key:` option yet. That runtime
ordering contract remains planned/documented until upstream support exists.

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

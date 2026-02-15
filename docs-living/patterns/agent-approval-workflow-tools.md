# Agent Approval Workflow Tools

**Purpose:** Detailed documentation for the Agent Approval Workflow Tools pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Arch    |

## Description

Agent Approval Workflow Tools

Provides utilities for managing human-in-loop approval workflow for
low-confidence agent decisions.

## Workflow

1. Agent detects pattern with low confidence
2. Creates pending approval via `recordPendingApproval`
3. Human reviews and approves/rejects via `approveAgentAction`/`rejectAgentAction`
4. If approved, command is emitted to the command queue
5. Expired approvals are cleaned up via `expirePendingApprovals` cron

---

[← Back to Pattern Registry](../PATTERNS.md)

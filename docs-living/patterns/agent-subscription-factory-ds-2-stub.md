# 📋 Agent Subscription Factory — DS-2 Stub

**Purpose:** Detailed documentation for the Agent Subscription Factory — DS-2 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

Agent Subscription Factory — DS-2 Stub

Extends the existing `createAgentSubscription` factory to produce
`ActionSubscription` variants when an action handler is provided.

## Design Decisions

- AD-1: Unified action model — agent subscriptions produce ActionSubscription
- AD-2: EventSubscription discriminated union — factory sets handlerType
- AD-5: onComplete data contract — context carries AgentWorkpoolContext
- AD-8: Separate action + onComplete factories

## Merge Strategy

This stub defines NEW types to be added alongside the existing code.
The existing `CreateAgentSubscriptionOptions` and mutation-based
`createAgentSubscription` remain unchanged. New overloads extend
the factory to support both mutation and action variants.

See: PDR-011 (Agent Action Handler Architecture)
See: event-subscription-types.ts (ActionSubscription / MutationSubscription)
Since: DS-2 (Action/Mutation Handler Architecture)

---

[← Back to Pattern Registry](../PATTERNS.md)

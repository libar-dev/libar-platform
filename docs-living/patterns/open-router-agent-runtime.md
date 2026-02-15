# OpenRouter Agent Runtime

**Purpose:** Detailed documentation for the OpenRouter Agent Runtime pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Arch    |

## Description

OpenRouter Agent Runtime

Implements AgentRuntimeConfig using the Vercel AI SDK with OpenRouter.
Falls back to mock runtime when API key is not configured.

## Usage

```typescript
import { createOpenRouterAgentRuntime } from "./_llm/runtime.js";

// Pass the API key from Convex environment
const apiKey = process.env.OPENROUTER_API_KEY;
const handler = createAgentActionHandler({
  agentConfig: myAgentConfig,
  runtime: createOpenRouterAgentRuntime(apiKey),
  // ...
});
```

---

[← Back to Pattern Registry](../PATTERNS.md)

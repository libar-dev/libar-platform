/**
 * Shared AgentComponentAPI wiring for all agent handlers.
 *
 * Centralizes the component reference mapping so onComplete and routeCommand
 * don't duplicate the wiring. Cast via unknown per CLAUDE.md internal
 * visibility pattern.
 */
import { components } from "../../_generated/api.js";
import type { AgentComponentAPI } from "@libar-dev/platform-core";

export const agentComponent = {
  checkpoints: {
    loadOrCreate: components.agentBC.checkpoints.loadOrCreate,
    update: components.agentBC.checkpoints.update,
    transitionLifecycle: components.agentBC.checkpoints.transitionLifecycle,
    patchConfigOverrides: components.agentBC.checkpoints.patchConfigOverrides,
  },
  audit: { record: components.agentBC.audit.record },
  commands: {
    record: components.agentBC.commands.record,
    updateStatus: components.agentBC.commands.updateStatus,
  },
  approvals: { create: components.agentBC.approvals.create },
  deadLetters: { record: components.agentBC.deadLetters.record },
} as unknown as AgentComponentAPI;

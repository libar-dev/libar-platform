import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import {
  closeGate,
  resumeGate,
  getGate,
  getGateAudit,
} from "../../src/gate/index.js";

// Convex exposes _handler at runtime but omits it from RegisteredMutation's public type.
// Calling it lets a pure test stop at the first database access.
export function gateHandler(entry: "closeGate" | "resumeGate") {
  return (entry === "closeGate" ? closeGate : resumeGate) as unknown as {
    _handler: (
      ctx: GenericMutationCtx<GenericDataModel>,
      args: { scopeKey: string; operator: string; reason?: string },
    ) => Promise<null>;
  };
}

export function gateQueryHandler(entry: "getGate" | "getGateAudit") {
  return (entry === "getGate" ? getGate : getGateAudit) as unknown as {
    _handler: (
      ctx: GenericQueryCtx<GenericDataModel>,
      args: {
        scopeKey?: string;
        paginationOpts?: { numItems: number; cursor: string | null };
      },
    ) => Promise<unknown>;
  };
}

/**
 * App-level cron jobs.
 *
 * Cron jobs are registered at the app level (not in components) because:
 * - Components can't call app-level functions
 * - Orchestration (CommandOrchestrator, EventStore, Projections) lives at app level
 * - This ensures proper dual-write pattern compliance
 */
import { cronJobs, makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";

// =============================================================================
// Internal Function References (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 errors when accessing internal paths.
// =============================================================================
const expireReservationsRef = makeFunctionReference<"mutation">(
  "inventory:expireExpiredReservations"
) as unknown as FunctionReference<"mutation", "internal">;

const crons = cronJobs();

/**
 * Expire uncommitted reservations.
 *
 * Runs every 5 minutes to find and expire pending reservations
 * that have passed their expiresAt timestamp.
 *
 * This calls the app-level expireExpiredReservations which uses
 * CommandOrchestrator to properly emit events and trigger projections.
 *
 * Note: This uses CommandOrchestrator as a pragmatic solution. The ideal
 * abstraction would be a dedicated Process Manager (see ROADMAP Phase 9).
 */
crons.interval("expire-uncommitted-reservations", { minutes: 5 }, expireReservationsRef);

// =============================================================================
// ORPHAN INTENT DETECTION (Phase 18.5)
// =============================================================================
// Detect orphaned intents every 5 minutes.
// Intents in "pending" status past their timeoutMs are flagged as "abandoned".
// =============================================================================
const detectOrphansRef = makeFunctionReference<"mutation">(
  "admin/intents:detectOrphans"
) as unknown as FunctionReference<"mutation", "internal">;

crons.interval("detect-orphaned-intents", { minutes: 5 }, detectOrphansRef);

// =============================================================================
// AGENT APPROVAL EXPIRATION (Phase 22.4)
// =============================================================================
// Expire pending agent approvals that have passed their expiration time.
// Runs hourly to clean up stale approvals.
// =============================================================================
const expirePendingApprovalsRef = makeFunctionReference<"mutation">(
  "contexts/agent/tools/approval:expirePendingApprovals"
) as unknown as FunctionReference<"mutation", "internal">;

crons.interval("expire-pending-approvals", { hours: 1 }, expirePendingApprovalsRef);

export default crons;

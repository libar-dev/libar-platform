/**
 * Internal inventory functions.
 *
 * These are internal mutations/actions used by cron jobs and other internal processes.
 *
 * NOTE: Uses `mutation` (not `internalMutation`) because this is a component.
 * Component functions are automatically scoped as "internal" at the app level.
 */
import { mutation } from "../_generated/server";

const BATCH_SIZE = 100;

/**
 * Find expired pending reservations.
 *
 * This is a query-like mutation that finds reservations that have passed their
 * expiresAt timestamp and are still in pending status.
 *
 * NOTE: This function does NOT update CMS or emit events. The app-level
 * expireExpiredReservations function handles that via CommandOrchestrator
 * for proper dual-write pattern compliance.
 *
 * @returns Array of reservation IDs that have expired
 */
export const findExpiredReservations = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find pending reservations that have expired
    const expiredReservations = await ctx.db
      .query("reservationCMS")
      .withIndex("by_expiresAt", (q) => q.eq("status", "pending").lt("expiresAt", now))
      .take(BATCH_SIZE);

    // Return only the reservation IDs for app-level processing
    return expiredReservations.map((r) => ({
      reservationId: r.reservationId,
    }));
  },
});

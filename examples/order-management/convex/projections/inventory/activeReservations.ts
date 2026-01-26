/**
 * ActiveReservations projection handlers (app-level).
 *
 * Updates the activeReservations read model based on reservation events.
 * Also updates productCatalog and stockAvailability for stock level changes.
 *
 * CRITICAL: These handlers use EVENT DATA ONLY - no CMS access!
 * This is proper Event Sourcing: projections are built from events only.
 * The enriched events (with items array) enable this pattern.
 */
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { withCheckpoint, type MutationCtx } from "../_helpers";
import type { Doc } from "../../_generated/dataModel";

const PROJECTION_NAME = "activeReservations";

/**
 * Reservation item schema for event args.
 */
const reservationItemValidator = v.object({
  productId: v.string(),
  quantity: v.number(),
});

/**
 * Helper to get active reservation.
 * Throws if not found.
 */
async function getActiveReservationOrThrow(
  ctx: MutationCtx,
  reservationId: string
): Promise<Doc<"activeReservations">> {
  const reservation = await ctx.db
    .query("activeReservations")
    .withIndex("by_reservationId", (q) => q.eq("reservationId", reservationId))
    .first();

  if (!reservation) {
    throw new Error(`Active reservation not found for reservationId: ${reservationId}`);
  }

  return reservation;
}

/**
 * Helper to update stock levels in productCatalog and stockAvailability.
 */
async function updateStockLevels(
  ctx: MutationCtx,
  items: Array<{ productId: string; quantity: number }>,
  direction: "reserve" | "release"
): Promise<void> {
  const now = Date.now();
  const multiplier = direction === "reserve" ? -1 : 1;

  for (const item of items) {
    // Update product catalog
    const catalog = await ctx.db
      .query("productCatalog")
      .withIndex("by_productId", (q) => q.eq("productId", item.productId))
      .first();

    if (catalog) {
      await ctx.db.patch(catalog._id, {
        availableQuantity: catalog.availableQuantity + item.quantity * multiplier,
        reservedQuantity: catalog.reservedQuantity - item.quantity * multiplier,
        updatedAt: now,
      });
    }

    // Update stock availability
    const stockAvail = await ctx.db
      .query("stockAvailability")
      .withIndex("by_productId", (q) => q.eq("productId", item.productId))
      .first();

    if (stockAvail) {
      await ctx.db.patch(stockAvail._id, {
        availableQuantity: stockAvail.availableQuantity + item.quantity * multiplier,
        reservedQuantity: stockAvail.reservedQuantity - item.quantity * multiplier,
        updatedAt: now,
      });
    }
  }
}

/**
 * Handle StockReserved event.
 */
export const onStockReserved = internalMutation({
  args: {
    reservationId: v.string(),
    orderId: v.string(),
    items: v.array(reservationItemValidator),
    expiresAt: v.number(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { reservationId, orderId, items, expiresAt } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, reservationId, args, async () => {
      const now = Date.now();

      // Create active reservation entry (includes items for self-contained updates)
      await ctx.db.insert("activeReservations", {
        reservationId,
        orderId,
        status: "pending",
        itemCount: items.length,
        items, // Store items for later reference if needed
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });

      // Update stock levels (reserve = reduce available, increase reserved)
      await updateStockLevels(ctx, items, "reserve");
    });
  },
});

/**
 * Handle ReservationConfirmed event.
 */
export const onReservationConfirmed = internalMutation({
  args: {
    reservationId: v.string(),
    orderId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { reservationId } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, reservationId, args, async () => {
      const reservation = await getActiveReservationOrThrow(ctx, reservationId);
      await ctx.db.patch(reservation._id, {
        status: "confirmed",
        updatedAt: Date.now(),
      });
      // Note: Stock levels don't change on confirm - reserved stays reserved
    });
  },
});

/**
 * Handle ReservationReleased event.
 *
 * IMPORTANT: Uses items from the enriched event payload (not CMS access).
 */
export const onReservationReleased = internalMutation({
  args: {
    reservationId: v.string(),
    orderId: v.string(),
    reason: v.string(),
    items: v.array(reservationItemValidator), // Items from enriched event
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { reservationId, items } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, reservationId, args, async () => {
      const reservation = await getActiveReservationOrThrow(ctx, reservationId);

      // Update reservation status
      await ctx.db.patch(reservation._id, {
        status: "released",
        updatedAt: Date.now(),
      });

      // Return stock to available (release = increase available, decrease reserved)
      // Uses items from EVENT DATA, not CMS!
      await updateStockLevels(ctx, items, "release");
    });
  },
});

/**
 * Handle ReservationExpired event.
 *
 * IMPORTANT: Uses items from the enriched event payload (not CMS access).
 */
export const onReservationExpired = internalMutation({
  args: {
    reservationId: v.string(),
    orderId: v.string(),
    items: v.array(reservationItemValidator), // Items from enriched event
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { reservationId, items } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, reservationId, args, async () => {
      const reservation = await getActiveReservationOrThrow(ctx, reservationId);

      // Update reservation status
      await ctx.db.patch(reservation._id, {
        status: "expired",
        updatedAt: Date.now(),
      });

      // Return stock to available (expire = increase available, decrease reserved)
      // Uses items from EVENT DATA, not CMS!
      await updateStockLevels(ctx, items, "release");
    });
  },
});

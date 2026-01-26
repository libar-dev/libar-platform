/**
 * Inventory Repository Instances
 *
 * Provides typed CMS access for Inventory and Reservation aggregates,
 * eliminating the 5-line boilerplate pattern in command handlers.
 *
 * Usage:
 * ```typescript
 * // Load inventory (throws NotFoundError if missing)
 * const { cms, _id } = await inventoryRepo.load(ctx, productId);
 *
 * // Load reservation (throws NotFoundError if missing)
 * const { cms, _id } = await reservationRepo.load(ctx, reservationId);
 *
 * // Try load (returns null if missing - useful for existence checks)
 * const result = await inventoryRepo.tryLoad(ctx, productId);
 * if (result) { // handle found case }
 * ```
 */
import { createCMSRepository } from "@libar-dev/platform-core/repository";
import {
  type InventoryCMS,
  CURRENT_INVENTORY_CMS_VERSION,
  upcastInventoryCMS,
} from "./domain/inventory.js";
import {
  type ReservationCMS,
  CURRENT_RESERVATION_CMS_VERSION,
  upcastReservationCMS,
} from "./domain/reservation.js";

/**
 * Inventory repository for product stock CMS access.
 *
 * - `load(ctx, productId)` - Load inventory, throws NotFoundError if missing
 * - `tryLoad(ctx, productId)` - Load inventory, returns null if missing
 * - `insert(ctx, cms)` - Insert new inventory record
 * - `update(ctx, docId, updates, version)` - Update with OCC check
 */
export const inventoryRepo = createCMSRepository<InventoryCMS>({
  table: "inventoryCMS",
  idField: "productId",
  index: "by_productId",
  upcast: (raw) => {
    const record = raw as { stateVersion?: number };
    const originalStateVersion = record.stateVersion ?? 0;
    const wasUpcasted = originalStateVersion < CURRENT_INVENTORY_CMS_VERSION;
    const cms = upcastInventoryCMS(raw);
    return { cms, wasUpcasted, originalStateVersion };
  },
});

/**
 * Reservation repository for stock reservation CMS access.
 *
 * - `load(ctx, reservationId)` - Load reservation, throws NotFoundError if missing
 * - `tryLoad(ctx, reservationId)` - Load reservation, returns null if missing
 * - `insert(ctx, cms)` - Insert new reservation record
 * - `update(ctx, docId, updates, version)` - Update with OCC check
 */
export const reservationRepo = createCMSRepository<ReservationCMS>({
  table: "reservationCMS",
  idField: "reservationId",
  index: "by_reservationId",
  upcast: (raw) => {
    const record = raw as { stateVersion?: number };
    const originalStateVersion = record.stateVersion ?? 0;
    const wasUpcasted = originalStateVersion < CURRENT_RESERVATION_CMS_VERSION;
    const cms = upcastReservationCMS(raw);
    return { cms, wasUpcasted, originalStateVersion };
  },
});

/**
 * Unit tests for Reservation domain functions.
 *
 * These are pure unit tests that don't require Convex or mocking.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  calculateReservationItemCount,
  calculateTotalReservedQuantity,
  createInitialReservationCMS,
  isReservationExpired,
  upcastReservationCMS,
  CURRENT_RESERVATION_CMS_VERSION,
  DEFAULT_RESERVATION_TTL_MS,
  type ReservationCMS,
  type ReservationItem,
} from "../../../../convex/contexts/inventory/domain/reservation.js";

describe("calculateReservationItemCount", () => {
  it("returns correct count for single item", () => {
    const reservation: ReservationCMS = {
      reservationId: "res_1",
      orderId: "ord_1",
      items: [{ productId: "prod_1", quantity: 5 }],
      status: "pending",
      expiresAt: Date.now() + 3600000,
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(calculateReservationItemCount(reservation)).toBe(1);
  });

  it("returns correct count for multiple items", () => {
    const reservation: ReservationCMS = {
      reservationId: "res_1",
      orderId: "ord_1",
      items: [
        { productId: "prod_1", quantity: 5 },
        { productId: "prod_2", quantity: 3 },
        { productId: "prod_3", quantity: 10 },
      ],
      status: "pending",
      expiresAt: Date.now() + 3600000,
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(calculateReservationItemCount(reservation)).toBe(3);
  });

  it("returns 0 for empty items", () => {
    const reservation: ReservationCMS = {
      reservationId: "res_1",
      orderId: "ord_1",
      items: [],
      status: "pending",
      expiresAt: Date.now() + 3600000,
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(calculateReservationItemCount(reservation)).toBe(0);
  });
});

describe("calculateTotalReservedQuantity", () => {
  it("returns sum of all item quantities", () => {
    const items: ReservationItem[] = [
      { productId: "prod_1", quantity: 5 },
      { productId: "prod_2", quantity: 3 },
      { productId: "prod_3", quantity: 10 },
    ];
    expect(calculateTotalReservedQuantity(items)).toBe(18);
  });

  it("returns quantity for single item", () => {
    const items: ReservationItem[] = [{ productId: "prod_1", quantity: 7 }];
    expect(calculateTotalReservedQuantity(items)).toBe(7);
  });

  it("returns 0 for empty items", () => {
    expect(calculateTotalReservedQuantity([])).toBe(0);
  });
});

describe("createInitialReservationCMS", () => {
  let beforeTimestamp: number;

  beforeEach(() => {
    beforeTimestamp = Date.now();
  });

  it("creates CMS with correct reservationId and orderId", () => {
    const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
    const cms = createInitialReservationCMS("res_123", "ord_456", items);

    expect(cms.reservationId).toBe("res_123");
    expect(cms.orderId).toBe("ord_456");
  });

  it("initializes items array correctly", () => {
    const items: ReservationItem[] = [
      { productId: "prod_1", quantity: 5 },
      { productId: "prod_2", quantity: 3 },
    ];
    const cms = createInitialReservationCMS("res_123", "ord_456", items);

    expect(cms.items).toEqual(items);
    expect(cms.items).toHaveLength(2);
  });

  it("sets status to pending", () => {
    const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
    const cms = createInitialReservationCMS("res_123", "ord_456", items);

    expect(cms.status).toBe("pending");
  });

  it("sets expiresAt with default TTL", () => {
    const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
    const cms = createInitialReservationCMS("res_123", "ord_456", items);
    const afterTimestamp = Date.now();

    // expiresAt should be approximately now + 1 hour
    expect(cms.expiresAt).toBeGreaterThanOrEqual(beforeTimestamp + DEFAULT_RESERVATION_TTL_MS);
    expect(cms.expiresAt).toBeLessThanOrEqual(afterTimestamp + DEFAULT_RESERVATION_TTL_MS);
  });

  it("supports custom TTL", () => {
    const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
    const customTTL = 30 * 60 * 1000; // 30 minutes
    const cms = createInitialReservationCMS("res_123", "ord_456", items, customTTL);
    const afterTimestamp = Date.now();

    expect(cms.expiresAt).toBeGreaterThanOrEqual(beforeTimestamp + customTTL);
    expect(cms.expiresAt).toBeLessThanOrEqual(afterTimestamp + customTTL);
  });

  it("initializes version to 0", () => {
    const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
    const cms = createInitialReservationCMS("res_123", "ord_456", items);

    expect(cms.version).toBe(0);
  });

  it("initializes with current state version", () => {
    const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
    const cms = createInitialReservationCMS("res_123", "ord_456", items);

    expect(cms.stateVersion).toBe(CURRENT_RESERVATION_CMS_VERSION);
  });

  it("sets createdAt and updatedAt to current timestamp", () => {
    const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
    const cms = createInitialReservationCMS("res_123", "ord_456", items);
    const afterTimestamp = Date.now();

    expect(cms.createdAt).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(cms.createdAt).toBeLessThanOrEqual(afterTimestamp);
    expect(cms.updatedAt).toBe(cms.createdAt);
  });
});

describe("isReservationExpired", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when reservation has not expired", () => {
    const reservation: ReservationCMS = {
      reservationId: "res_1",
      orderId: "ord_1",
      items: [{ productId: "prod_1", quantity: 5 }],
      status: "pending",
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour in future
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(isReservationExpired(reservation)).toBe(false);
  });

  it("returns true when reservation has expired", () => {
    const reservation: ReservationCMS = {
      reservationId: "res_1",
      orderId: "ord_1",
      items: [{ productId: "prod_1", quantity: 5 }],
      status: "pending",
      expiresAt: Date.now() - 1000, // 1 second ago
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(isReservationExpired(reservation)).toBe(true);
  });

  it("returns false when reservation is confirmed (regardless of expiry)", () => {
    const reservation: ReservationCMS = {
      reservationId: "res_1",
      orderId: "ord_1",
      items: [{ productId: "prod_1", quantity: 5 }],
      status: "confirmed",
      expiresAt: Date.now() - 60 * 60 * 1000, // 1 hour ago
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(isReservationExpired(reservation)).toBe(false);
  });

  it("returns false when reservation is released (regardless of expiry)", () => {
    const reservation: ReservationCMS = {
      reservationId: "res_1",
      orderId: "ord_1",
      items: [{ productId: "prod_1", quantity: 5 }],
      status: "released",
      expiresAt: Date.now() - 60 * 60 * 1000,
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(isReservationExpired(reservation)).toBe(false);
  });

  it("handles exact boundary correctly", () => {
    vi.useFakeTimers();
    const now = 1000000000000;
    vi.setSystemTime(now);

    const reservation: ReservationCMS = {
      reservationId: "res_1",
      orderId: "ord_1",
      items: [{ productId: "prod_1", quantity: 5 }],
      status: "pending",
      expiresAt: now, // Exactly now
      version: 1,
      stateVersion: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    // At exact boundary, Date.now() > expiresAt is false
    expect(isReservationExpired(reservation)).toBe(false);

    // One ms later, it's expired
    vi.setSystemTime(now + 1);
    expect(isReservationExpired(reservation)).toBe(true);
  });
});

describe("upcastReservationCMS", () => {
  it("returns unchanged CMS when already at current version", () => {
    const originalCMS: ReservationCMS = {
      reservationId: "res_123",
      orderId: "ord_456",
      items: [{ productId: "prod_1", quantity: 5 }],
      status: "pending",
      expiresAt: 9999999999999,
      version: 2,
      stateVersion: CURRENT_RESERVATION_CMS_VERSION,
      createdAt: 1000,
      updatedAt: 2000,
    };

    const result = upcastReservationCMS(originalCMS);

    expect(result).toEqual(originalCMS);
    expect(result.stateVersion).toBe(CURRENT_RESERVATION_CMS_VERSION);
  });

  it("upgrades CMS with missing stateVersion to current version", () => {
    const oldCMS = {
      reservationId: "res_123",
      orderId: "ord_456",
      items: [{ productId: "prod_1", quantity: 5 }],
      status: "pending",
      expiresAt: 9999999999999,
      version: 2,
      // stateVersion missing
      createdAt: 1000,
      updatedAt: 2000,
    };

    const result = upcastReservationCMS(oldCMS);

    expect(result.stateVersion).toBe(CURRENT_RESERVATION_CMS_VERSION);
    expect(result.reservationId).toBe("res_123");
    expect(result.items).toHaveLength(1);
  });

  it("throws error for future versions", () => {
    const futureCMS = {
      reservationId: "res_123",
      orderId: "ord_456",
      items: [{ productId: "prod_1", quantity: 5 }],
      status: "pending",
      expiresAt: 9999999999999,
      version: 2,
      stateVersion: CURRENT_RESERVATION_CMS_VERSION + 10,
      createdAt: 1000,
      updatedAt: 2000,
    };

    expect(() => upcastReservationCMS(futureCMS)).toThrow();
    expect(() => upcastReservationCMS(futureCMS)).toThrow(/newer than supported version/);
  });

  it("preserves all fields during upcast", () => {
    const items: ReservationItem[] = [
      { productId: "prod_1", quantity: 5 },
      { productId: "prod_2", quantity: 3 },
    ];

    const oldCMS = {
      reservationId: "res_abc",
      orderId: "ord_xyz",
      items,
      status: "confirmed" as const,
      expiresAt: 8888888888888,
      version: 5,
      stateVersion: 0,
      createdAt: 5000,
      updatedAt: 6000,
    };

    const result = upcastReservationCMS(oldCMS);

    expect(result.reservationId).toBe("res_abc");
    expect(result.orderId).toBe("ord_xyz");
    expect(result.items).toEqual(items);
    expect(result.status).toBe("confirmed");
    expect(result.expiresAt).toBe(8888888888888);
    expect(result.version).toBe(5);
    expect(result.createdAt).toBe(5000);
    expect(result.updatedAt).toBe(6000);
  });
});

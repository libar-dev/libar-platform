/**
 * Mock Reservation Repository for Testing
 *
 * In-memory implementation of ReservationRepository for unit testing.
 * Since platform-core is a library package, we don't have access to an
 * actual Convex database. This mock provides deterministic test behavior.
 *
 * @since Phase 20 (ReservationPattern)
 */

import type {
  ReservationCMS,
  ReservationRepository,
  ReservationKey,
} from "../../../src/reservations/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Mock document type with ID.
 */
export interface MockReservationDoc extends ReservationCMS {
  _id: string;
}

/**
 * Mock context type (unused but required by interface).
 */
export type MockCtx = object;

// =============================================================================
// Mock Repository Implementation
// =============================================================================

/**
 * Create a mock reservation repository for testing.
 *
 * @returns Repository and helper functions for test setup/assertions
 */
export function createMockRepository(): {
  repository: ReservationRepository<MockCtx, string>;
  store: Map<string, MockReservationDoc>;
  clear: () => void;
  addReservation: (reservation: Omit<ReservationCMS, "version">) => string;
  getByKey: (key: ReservationKey) => MockReservationDoc | undefined;
  getById: (id: string) => MockReservationDoc | undefined;
  getAllReservations: () => MockReservationDoc[];
} {
  // In-memory storage
  const store = new Map<string, MockReservationDoc>();
  let nextId = 1;

  const repository: ReservationRepository<MockCtx, string> = {
    findById: async (_ctx: MockCtx, reservationId: string) => {
      for (const doc of store.values()) {
        if (doc.reservationId === reservationId) {
          return doc;
        }
      }
      return null;
    },

    findByKey: async (_ctx: MockCtx, key: ReservationKey) => {
      for (const doc of store.values()) {
        if (doc.key === key) {
          return doc;
        }
      }
      return null;
    },

    findActiveByKey: async (_ctx: MockCtx, key: ReservationKey, now: number) => {
      for (const doc of store.values()) {
        // Active requires: key match, status "reserved", and non-null expiresAt > now
        // Confirmed reservations have null expiresAt and are NOT active
        if (
          doc.key === key &&
          doc.status === "reserved" &&
          doc.expiresAt !== null &&
          doc.expiresAt > now
        ) {
          return doc;
        }
      }
      return null;
    },

    insert: async (_ctx: MockCtx, reservation: Omit<ReservationCMS, "version">) => {
      const _id = `mock_${nextId++}`;
      const doc: MockReservationDoc = {
        ...reservation,
        version: 1,
        _id,
      };
      store.set(_id, doc);
      return _id;
    },

    update: async (_ctx: MockCtx, _id: string, update: Partial<ReservationCMS>) => {
      const doc = store.get(_id);
      if (doc) {
        store.set(_id, { ...doc, ...update });
      }
    },

    findExpired: async (_ctx: MockCtx, now: number, limit: number) => {
      const expired: MockReservationDoc[] = [];
      for (const doc of store.values()) {
        // Only "reserved" status with non-null expiresAt can expire
        // Confirmed reservations have null expiresAt and cannot expire
        if (doc.status === "reserved" && doc.expiresAt !== null && doc.expiresAt <= now) {
          expired.push(doc);
          if (expired.length >= limit) {
            break;
          }
        }
      }
      return expired;
    },
  };

  return {
    repository,
    store,
    clear: () => {
      store.clear();
      nextId = 1;
    },
    addReservation: (reservation: Omit<ReservationCMS, "version">) => {
      const _id = `mock_${nextId++}`;
      const doc: MockReservationDoc = {
        ...reservation,
        version: 1,
        _id,
      };
      store.set(_id, doc);
      return _id;
    },
    getByKey: (key: ReservationKey) => {
      for (const doc of store.values()) {
        if (doc.key === key) {
          return doc;
        }
      }
      return undefined;
    },
    getById: (id: string) => {
      for (const doc of store.values()) {
        if (doc.reservationId === id) {
          return doc;
        }
      }
      return undefined;
    },
    getAllReservations: () => Array.from(store.values()),
  };
}

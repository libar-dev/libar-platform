/**
 * Unit Tests for CMS Upcaster Utilities
 *
 * Tests the schema evolution utilities:
 * - createUpcaster: Chain-based migration
 * - upcastIfNeeded: Simple single-version migration
 * - CMSUpcasterError: Error handling
 */
import { describe, it, expect } from "vitest";
import {
  createUpcaster,
  upcastIfNeeded,
  CMSUpcasterError,
  addCMSFieldMigration,
  renameCMSFieldMigration,
  removeCMSFieldMigration,
} from "../../../src/cms/upcaster";
import type { BaseCMS } from "../../../src/cms/types";

// Test CMS types for schema evolution scenarios
interface TestCMSv1 extends BaseCMS {
  id: string;
  name: string;
  stateVersion: 1;
  version: number;
}

interface TestCMSv2 extends BaseCMS {
  id: string;
  name: string;
  description: string;
  stateVersion: 2;
  version: number;
}

interface TestCMSv3 extends BaseCMS {
  id: string;
  name: string;
  description: string;
  priority: "low" | "medium" | "high";
  stateVersion: 3;
  version: number;
}

describe("createUpcaster", () => {
  describe("when state is at current version", () => {
    it("returns state as-is without migration", () => {
      const upcaster = createUpcaster<TestCMSv2>({
        currentVersion: 2,
        migrations: {
          1: (v1: unknown) => ({
            ...(v1 as TestCMSv1),
            description: "",
            stateVersion: 2,
          }),
        },
      });

      const state: TestCMSv2 = {
        id: "test_1",
        name: "Test",
        description: "Already at v2",
        stateVersion: 2,
        version: 1,
      };

      const result = upcaster(state);

      expect(result.wasUpcasted).toBe(false);
      expect(result.originalStateVersion).toBe(2);
      expect(result.cms).toEqual(state);
    });
  });

  describe("when state needs single migration", () => {
    it("applies migration from v1 to v2", () => {
      const upcaster = createUpcaster<TestCMSv2>({
        currentVersion: 2,
        migrations: {
          1: (v1: unknown) => ({
            ...(v1 as TestCMSv1),
            description: "Migrated from v1",
            stateVersion: 2,
          }),
        },
      });

      const state: TestCMSv1 = {
        id: "test_1",
        name: "Test",
        stateVersion: 1,
        version: 1,
      };

      const result = upcaster(state);

      expect(result.wasUpcasted).toBe(true);
      expect(result.originalStateVersion).toBe(1);
      expect(result.cms.stateVersion).toBe(2);
      expect(result.cms.description).toBe("Migrated from v1");
    });
  });

  describe("when state needs multiple migrations", () => {
    it("applies migrations in order from v1 to v3", () => {
      const upcaster = createUpcaster<TestCMSv3>({
        currentVersion: 3,
        migrations: {
          1: (v1: unknown) => ({
            ...(v1 as TestCMSv1),
            description: "Added in v2",
            stateVersion: 2,
          }),
          2: (v2: unknown) => ({
            ...(v2 as TestCMSv2),
            priority: "medium" as const,
            stateVersion: 3,
          }),
        },
      });

      const state: TestCMSv1 = {
        id: "test_1",
        name: "Test",
        stateVersion: 1,
        version: 1,
      };

      const result = upcaster(state);

      expect(result.wasUpcasted).toBe(true);
      expect(result.originalStateVersion).toBe(1);
      expect(result.cms.stateVersion).toBe(3);
      expect(result.cms.description).toBe("Added in v2");
      expect(result.cms.priority).toBe("medium");
    });
  });

  describe("when state has version 0 (legacy)", () => {
    it("treats version 0 as needing all migrations", () => {
      const upcaster = createUpcaster<TestCMSv2>({
        currentVersion: 2,
        migrations: {
          0: (v0: unknown) => ({
            ...(v0 as Record<string, unknown>),
            stateVersion: 1,
          }),
          1: (v1: unknown) => ({
            ...(v1 as TestCMSv1),
            description: "Migrated from v0 to v2",
            stateVersion: 2,
          }),
        },
      });

      const state = {
        id: "legacy_1",
        name: "Legacy",
        version: 1,
        // No stateVersion field
      };

      const result = upcaster(state);

      expect(result.wasUpcasted).toBe(true);
      expect(result.originalStateVersion).toBe(0);
      expect(result.cms.stateVersion).toBe(2);
    });
  });

  describe("error cases", () => {
    it("throws NULL_STATE for null input", () => {
      // Use currentVersion: 1 so no migrations are required
      const upcaster = createUpcaster<TestCMSv1>({
        currentVersion: 1,
        migrations: {},
      });

      expect(() => upcaster(null)).toThrow(CMSUpcasterError);
      expect(() => upcaster(null)).toThrow("Cannot upcast null");
    });

    it("throws NULL_STATE for undefined input", () => {
      // Use currentVersion: 1 so no migrations are required
      const upcaster = createUpcaster<TestCMSv1>({
        currentVersion: 1,
        migrations: {},
      });

      expect(() => upcaster(undefined)).toThrow(CMSUpcasterError);
      expect(() => upcaster(undefined)).toThrow("Cannot upcast null or undefined");
    });

    it("throws at creation time when migration chain is incomplete", () => {
      // Migration chain validation now happens at creation time
      expect(() =>
        createUpcaster<TestCMSv3>({
          currentVersion: 3,
          migrations: {
            1: (v1: unknown) => ({
              ...(v1 as TestCMSv1),
              description: "",
              stateVersion: 2,
            }),
            // Missing migration from v2 to v3
          },
        })
      ).toThrow("Missing migration for version 2");
    });

    it("throws INVALID_STATE for future state version", () => {
      // Use currentVersion: 1 so no migrations are required
      // but provide a state with stateVersion: 5
      const upcaster = createUpcaster<TestCMSv1>({
        currentVersion: 1,
        migrations: {},
      });

      const state = {
        id: "future_1",
        name: "Future",
        stateVersion: 5,
        version: 1,
      };

      expect(() => upcaster(state)).toThrow(CMSUpcasterError);
      expect(() => upcaster(state)).toThrow(
        "State version 5 is newer than current schema version 1"
      );
    });

    it("propagates error when migration function throws mid-chain", () => {
      const upcaster = createUpcaster<TestCMSv3>({
        currentVersion: 3,
        migrations: {
          1: (v1: unknown) => ({
            ...(v1 as TestCMSv1),
            description: "Migrated to v2",
            stateVersion: 2,
          }),
          2: () => {
            throw new Error("Migration v2->v3 failed: data corruption detected");
          },
        },
      });

      const state: TestCMSv1 = {
        id: "test_1",
        name: "Test",
        stateVersion: 1,
        version: 1,
      };

      expect(() => upcaster(state)).toThrow("Migration v2->v3 failed: data corruption detected");
    });

    it("propagates error when first migration throws", () => {
      const upcaster = createUpcaster<TestCMSv2>({
        currentVersion: 2,
        migrations: {
          1: () => {
            throw new Error("Invalid v1 state structure");
          },
        },
      });

      const state: TestCMSv1 = {
        id: "test_1",
        name: "Test",
        stateVersion: 1,
        version: 1,
      };

      expect(() => upcaster(state)).toThrow("Invalid v1 state structure");
    });
  });
});

describe("upcastIfNeeded", () => {
  describe("when state is at current version", () => {
    it("returns state as-is without migration", () => {
      const state: TestCMSv2 = {
        id: "test_1",
        name: "Test",
        description: "Current version",
        stateVersion: 2,
        version: 1,
      };

      const result = upcastIfNeeded<TestCMSv1, TestCMSv2>(state, 2, (old) => ({
        ...old,
        description: "Should not be called",
        stateVersion: 2,
      }));

      expect(result.wasUpcasted).toBe(false);
      expect(result.originalStateVersion).toBe(2);
      expect(result.cms.description).toBe("Current version");
    });
  });

  describe("when state needs migration", () => {
    it("applies migration function", () => {
      const state: TestCMSv1 = {
        id: "test_1",
        name: "Test",
        stateVersion: 1,
        version: 1,
      };

      const result = upcastIfNeeded<TestCMSv1, TestCMSv2>(state, 2, (old) => ({
        ...old,
        description: "Migrated",
        stateVersion: 2,
      }));

      expect(result.wasUpcasted).toBe(true);
      expect(result.originalStateVersion).toBe(1);
      expect(result.cms.description).toBe("Migrated");
      expect(result.cms.stateVersion).toBe(2);
    });
  });

  describe("with validation function", () => {
    it("passes when validation succeeds", () => {
      const state: TestCMSv2 = {
        id: "test_1",
        name: "Test",
        description: "Valid",
        stateVersion: 2,
        version: 1,
      };

      const isValid = (s: unknown): s is TestCMSv2 =>
        s !== null &&
        typeof s === "object" &&
        "description" in s &&
        typeof (s as TestCMSv2).description === "string";

      const result = upcastIfNeeded<TestCMSv1, TestCMSv2>(
        state,
        2,
        (old) => ({ ...old, description: "", stateVersion: 2 }),
        isValid
      );

      expect(result.wasUpcasted).toBe(false);
      expect(result.cms).toEqual(state);
    });

    it("throws INVALID_STATE when validation fails", () => {
      const state = {
        id: "test_1",
        name: "Test",
        // Missing description field
        stateVersion: 2,
        version: 1,
      };

      const isValid = (s: unknown): s is TestCMSv2 =>
        s !== null &&
        typeof s === "object" &&
        "description" in s &&
        typeof (s as TestCMSv2).description === "string";

      expect(() =>
        upcastIfNeeded<TestCMSv1, TestCMSv2>(
          state,
          2,
          (old) => ({ ...old, description: "", stateVersion: 2 }),
          isValid
        )
      ).toThrow(CMSUpcasterError);
      expect(() =>
        upcastIfNeeded<TestCMSv1, TestCMSv2>(
          state,
          2,
          (old) => ({ ...old, description: "", stateVersion: 2 }),
          isValid
        )
      ).toThrow("fails validation");
    });
  });

  describe("error cases", () => {
    it("throws INVALID_STATE for future state version", () => {
      const state = {
        id: "future_1",
        name: "Future",
        stateVersion: 5,
        version: 1,
      };

      expect(() =>
        upcastIfNeeded<TestCMSv1, TestCMSv2>(state, 2, (old) => ({
          ...old,
          description: "",
          stateVersion: 2,
        }))
      ).toThrow(CMSUpcasterError);
      expect(() =>
        upcastIfNeeded<TestCMSv1, TestCMSv2>(state, 2, (old) => ({
          ...old,
          description: "",
          stateVersion: 2,
        }))
      ).toThrow("is newer than expected version");
    });
  });
});

describe("CMSUpcasterError", () => {
  it("has correct name", () => {
    const error = new CMSUpcasterError("NULL_STATE", "Test error");
    expect(error.name).toBe("CMSUpcasterError");
  });

  it("has correct code", () => {
    const error = new CMSUpcasterError("MISSING_MIGRATION", "Test error");
    expect(error.code).toBe("MISSING_MIGRATION");
  });

  it("has correct message", () => {
    const error = new CMSUpcasterError("INVALID_STATE", "Custom message");
    expect(error.message).toBe("Custom message");
  });

  it("stores context when provided", () => {
    const error = new CMSUpcasterError("INVALID_STATE", "Error", {
      stateVersion: 5,
      expectedVersion: 2,
    });
    expect(error.context).toEqual({
      stateVersion: 5,
      expectedVersion: 2,
    });
  });

  it("has undefined context when not provided", () => {
    const error = new CMSUpcasterError("NULL_STATE", "Error");
    expect(error.context).toBeUndefined();
  });

  it("is instanceof Error", () => {
    const error = new CMSUpcasterError("NULL_STATE", "Error");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("createUpcaster with validate", () => {
  it("passes validation when state is at current version and valid", () => {
    const isValidV2 = (s: unknown): s is TestCMSv2 =>
      s !== null &&
      typeof s === "object" &&
      "description" in s &&
      typeof (s as TestCMSv2).description === "string";

    const upcaster = createUpcaster<TestCMSv2>({
      currentVersion: 2,
      migrations: {
        1: (v1: unknown) => ({
          ...(v1 as TestCMSv1),
          description: "Migrated",
          stateVersion: 2,
        }),
      },
      validate: isValidV2,
    });

    const state: TestCMSv2 = {
      id: "test_1",
      name: "Test",
      description: "Valid",
      stateVersion: 2,
      version: 1,
    };

    const result = upcaster(state);
    expect(result.wasUpcasted).toBe(false);
    expect(result.cms).toEqual(state);
  });

  it("throws INVALID_STATE when current version state fails validation", () => {
    const isValidV2 = (s: unknown): s is TestCMSv2 =>
      s !== null &&
      typeof s === "object" &&
      "description" in s &&
      typeof (s as TestCMSv2).description === "string" &&
      (s as TestCMSv2).description.length > 0; // Must have non-empty description

    const upcaster = createUpcaster<TestCMSv2>({
      currentVersion: 2,
      migrations: {
        1: (v1: unknown) => ({
          ...(v1 as TestCMSv1),
          description: "",
          stateVersion: 2,
        }),
      },
      validate: isValidV2,
    });

    const state = {
      id: "test_1",
      name: "Test",
      description: "", // Empty description - fails validation
      stateVersion: 2,
      version: 1,
    };

    expect(() => upcaster(state)).toThrow(CMSUpcasterError);
    expect(() => upcaster(state)).toThrow("fails validation");
  });

  it("validates after upcasting migrations", () => {
    const isValidV2 = (s: unknown): s is TestCMSv2 =>
      s !== null &&
      typeof s === "object" &&
      "description" in s &&
      typeof (s as TestCMSv2).description === "string";

    const upcaster = createUpcaster<TestCMSv2>({
      currentVersion: 2,
      migrations: {
        1: (v1: unknown) => ({
          ...(v1 as TestCMSv1),
          description: "Migrated successfully",
          stateVersion: 2,
        }),
      },
      validate: isValidV2,
    });

    const state: TestCMSv1 = {
      id: "test_1",
      name: "Test",
      stateVersion: 1,
      version: 1,
    };

    const result = upcaster(state);
    expect(result.wasUpcasted).toBe(true);
    expect(result.cms.description).toBe("Migrated successfully");
  });

  it("throws INVALID_STATE when upcasted state fails validation", () => {
    const isValidV2 = (s: unknown): s is TestCMSv2 =>
      s !== null &&
      typeof s === "object" &&
      "description" in s &&
      typeof (s as TestCMSv2).description === "string" &&
      (s as TestCMSv2).description.length > 0;

    const upcaster = createUpcaster<TestCMSv2>({
      currentVersion: 2,
      migrations: {
        1: (v1: unknown) => ({
          ...(v1 as TestCMSv1),
          description: "", // Empty - fails validation
          stateVersion: 2,
        }),
      },
      validate: isValidV2,
    });

    const state: TestCMSv1 = {
      id: "test_1",
      name: "Test",
      stateVersion: 1,
      version: 1,
    };

    expect(() => upcaster(state)).toThrow(CMSUpcasterError);
    expect(() => upcaster(state)).toThrow("Upcasted CMS failed validation");
  });
});

describe("addCMSFieldMigration", () => {
  it("adds field with static default value", () => {
    const migration = addCMSFieldMigration("priority", "standard", 2);

    const state: BaseCMS = {
      id: "test_1",
      name: "Test",
      stateVersion: 1,
      version: 1,
    };

    const result = migration(state);

    expect(result.stateVersion).toBe(2);
    expect((result as Record<string, unknown>).priority).toBe("standard");
    expect((result as Record<string, unknown>).name).toBe("Test");
  });

  it("adds field with computed default value", () => {
    const migration = addCMSFieldMigration(
      "createdAt",
      () => 1704067200000, // Fixed timestamp for test
      2
    );

    const state: BaseCMS = {
      id: "test_1",
      stateVersion: 1,
      version: 1,
    };

    const result = migration(state);

    expect(result.stateVersion).toBe(2);
    expect((result as Record<string, unknown>).createdAt).toBe(1704067200000);
  });

  it("allows computed default to access state", () => {
    const migration = addCMSFieldMigration(
      "displayName",
      (state) => `Order ${(state as { orderId?: string }).orderId ?? "unknown"}`,
      2
    );

    const state = {
      orderId: "order_123",
      stateVersion: 1,
      version: 1,
    } as BaseCMS;

    const result = migration(state);

    expect((result as Record<string, unknown>).displayName).toBe("Order order_123");
  });

  it("preserves existing fields", () => {
    const migration = addCMSFieldMigration("newField", "value", 2);

    const state = {
      existingField: "existing",
      anotherField: 42,
      stateVersion: 1,
      version: 5,
    } as BaseCMS;

    const result = migration(state);

    expect((result as Record<string, unknown>).existingField).toBe("existing");
    expect((result as Record<string, unknown>).anotherField).toBe(42);
    expect(result.version).toBe(5);
  });
});

describe("renameCMSFieldMigration", () => {
  it("renames field from old name to new name", () => {
    const migration = renameCMSFieldMigration("userId", "customerId", 2);

    const state = {
      userId: "user_123",
      name: "Test",
      stateVersion: 1,
      version: 1,
    } as BaseCMS;

    const result = migration(state);

    expect((result as Record<string, unknown>).customerId).toBe("user_123");
    expect((result as Record<string, unknown>).userId).toBeUndefined();
    expect((result as Record<string, unknown>).name).toBe("Test");
    expect(result.stateVersion).toBe(2);
  });

  it("preserves other fields", () => {
    const migration = renameCMSFieldMigration("oldName", "newName", 2);

    const state = {
      oldName: "value",
      otherField1: "keep1",
      otherField2: 42,
      stateVersion: 1,
      version: 3,
    } as BaseCMS;

    const result = migration(state);

    expect((result as Record<string, unknown>).otherField1).toBe("keep1");
    expect((result as Record<string, unknown>).otherField2).toBe(42);
    expect(result.version).toBe(3);
  });

  it("handles undefined value in renamed field", () => {
    const migration = renameCMSFieldMigration("optionalField", "renamedOptional", 2);

    const state = {
      stateVersion: 1,
      version: 1,
    } as BaseCMS;

    const result = migration(state);

    expect((result as Record<string, unknown>).renamedOptional).toBeUndefined();
    expect(result.stateVersion).toBe(2);
  });
});

describe("removeCMSFieldMigration", () => {
  it("removes specified field", () => {
    const migration = removeCMSFieldMigration("deprecatedField", 2);

    const state = {
      deprecatedField: "old value",
      keepField: "keep me",
      stateVersion: 1,
      version: 1,
    } as BaseCMS;

    const result = migration(state);

    expect((result as Record<string, unknown>).deprecatedField).toBeUndefined();
    expect((result as Record<string, unknown>).keepField).toBe("keep me");
    expect(result.stateVersion).toBe(2);
  });

  it("preserves other fields", () => {
    const migration = removeCMSFieldMigration("toRemove", 2);

    const state = {
      toRemove: "bye",
      field1: "a",
      field2: "b",
      nested: { data: 123 },
      stateVersion: 1,
      version: 5,
    } as BaseCMS;

    const result = migration(state);

    expect((result as Record<string, unknown>).field1).toBe("a");
    expect((result as Record<string, unknown>).field2).toBe("b");
    expect((result as Record<string, unknown>).nested).toEqual({ data: 123 });
    expect(result.version).toBe(5);
  });

  it("handles non-existent field gracefully", () => {
    const migration = removeCMSFieldMigration("nonExistent", 2);

    const state = {
      existingField: "value",
      stateVersion: 1,
      version: 1,
    } as BaseCMS;

    const result = migration(state);

    expect((result as Record<string, unknown>).existingField).toBe("value");
    expect(result.stateVersion).toBe(2);
  });
});

describe("helper migrations integration with createUpcaster", () => {
  it("works with addCMSFieldMigration in migration chain", () => {
    const upcaster = createUpcaster<TestCMSv2>({
      currentVersion: 2,
      migrations: {
        1: addCMSFieldMigration("description", "Added via helper", 2),
      },
    });

    const state: TestCMSv1 = {
      id: "test_1",
      name: "Test",
      stateVersion: 1,
      version: 1,
    };

    const result = upcaster(state);

    expect(result.wasUpcasted).toBe(true);
    expect(result.cms.description).toBe("Added via helper");
    expect(result.cms.stateVersion).toBe(2);
  });

  it("chains multiple helper migrations", () => {
    interface CMSv3 extends BaseCMS {
      id: string;
      customerId: string; // renamed from userId
      priority: string; // added
      stateVersion: 3;
      version: number;
    }

    const upcaster = createUpcaster<CMSv3>({
      currentVersion: 3,
      migrations: {
        1: renameCMSFieldMigration("userId", "customerId", 2),
        2: addCMSFieldMigration("priority", "normal", 3),
      },
    });

    const state = {
      id: "test_1",
      userId: "user_456",
      stateVersion: 1,
      version: 1,
    } as BaseCMS;

    const result = upcaster(state);

    expect(result.wasUpcasted).toBe(true);
    expect(result.originalStateVersion).toBe(1);
    expect((result.cms as Record<string, unknown>).customerId).toBe("user_456");
    expect((result.cms as Record<string, unknown>).userId).toBeUndefined();
    expect((result.cms as Record<string, unknown>).priority).toBe("normal");
    expect(result.cms.stateVersion).toBe(3);
  });
});

/**
 * Unit Tests for CMS Repository
 *
 * Tests the repository factory and error types:
 * - createCMSRepository: Factory for typed repositories
 * - NotFoundError: Entity not found errors
 * - VersionConflictError: OCC failures
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCMSRepository, NotFoundError, VersionConflictError } from "../../../src/repository";
import type { BaseCMS, CMSLoadResult } from "../../../src/cms/types";

// Test CMS type
interface TestCMS extends BaseCMS {
  testId: string;
  name: string;
  stateVersion: number;
  version: number;
}

// Mock database helper
function createMockDb() {
  const mockFirst = vi.fn<[], Promise<Record<string, unknown> | null>>();
  const mockWithIndex = vi.fn().mockReturnValue({ first: mockFirst });
  const mockQuery = vi.fn().mockReturnValue({ withIndex: mockWithIndex });
  const mockInsert = vi.fn<[string, Record<string, unknown>], Promise<string>>();
  const mockPatch = vi.fn<[unknown, Record<string, unknown>], Promise<void>>();
  const mockGet = vi.fn<[unknown], Promise<Record<string, unknown> | null>>();

  return {
    db: {
      query: mockQuery,
      insert: mockInsert,
      patch: mockPatch,
      get: mockGet,
    },
    mocks: {
      query: mockQuery,
      withIndex: mockWithIndex,
      first: mockFirst,
      insert: mockInsert,
      patch: mockPatch,
      get: mockGet,
    },
  };
}

// Mock upcast function
function createMockUpcast() {
  return vi.fn<[unknown], CMSLoadResult<TestCMS>>().mockImplementation((raw) => ({
    cms: raw as TestCMS,
    wasUpcasted: false,
    originalStateVersion: (raw as TestCMS).stateVersion ?? 1,
  }));
}

describe("createCMSRepository", () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let mockUpcast: ReturnType<typeof createMockUpcast>;
  let repo: ReturnType<typeof createCMSRepository<TestCMS>>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockUpcast = createMockUpcast();
    repo = createCMSRepository<TestCMS>({
      table: "testCMS",
      idField: "testId",
      index: "by_testId",
      upcast: mockUpcast,
    });
  });

  describe("load", () => {
    it("loads and upcasts CMS by entity ID", async () => {
      const rawCMS = {
        _id: "doc_123",
        testId: "test_456",
        name: "Test Entity",
        stateVersion: 1,
        version: 5,
      };
      mockDb.mocks.first.mockResolvedValue(rawCMS);

      const result = await repo.load(mockDb, "test_456");

      expect(mockDb.mocks.query).toHaveBeenCalledWith("testCMS");
      expect(mockDb.mocks.withIndex).toHaveBeenCalledWith("by_testId", expect.any(Function));
      expect(mockUpcast).toHaveBeenCalledWith(rawCMS);
      expect(result._id).toBe("doc_123");
      expect(result.cms.testId).toBe("test_456");
    });

    it("throws NotFoundError when entity does not exist", async () => {
      mockDb.mocks.first.mockResolvedValue(null);

      await expect(repo.load(mockDb, "nonexistent")).rejects.toThrow(NotFoundError);
      await expect(repo.load(mockDb, "nonexistent")).rejects.toThrow(
        "testCMS not found: nonexistent"
      );
    });

    it("returns upcast metadata", async () => {
      const rawCMS = {
        _id: "doc_123",
        testId: "test_456",
        name: "Test",
        stateVersion: 1,
        version: 1,
      };
      mockDb.mocks.first.mockResolvedValue(rawCMS);
      mockUpcast.mockReturnValue({
        cms: { ...rawCMS, stateVersion: 2 } as TestCMS,
        wasUpcasted: true,
        originalStateVersion: 1,
      });

      const result = await repo.load(mockDb, "test_456");

      expect(result.wasUpcasted).toBe(true);
      expect(result.originalStateVersion).toBe(1);
    });

    it("propagates error when upcast function throws", async () => {
      const rawCMS = {
        _id: "doc_123",
        testId: "test_456",
        name: "Test Entity",
        stateVersion: 1,
        version: 5,
      };
      mockDb.mocks.first.mockResolvedValue(rawCMS);
      mockUpcast.mockImplementation(() => {
        throw new Error("Upcast failed: invalid state");
      });

      await expect(repo.load(mockDb, "test_456")).rejects.toThrow("Upcast failed: invalid state");
    });
  });

  describe("tryLoad", () => {
    it("returns CMS when entity exists", async () => {
      const rawCMS = {
        _id: "doc_123",
        testId: "test_456",
        name: "Test Entity",
        stateVersion: 1,
        version: 3,
      };
      mockDb.mocks.first.mockResolvedValue(rawCMS);

      const result = await repo.tryLoad(mockDb, "test_456");

      expect(result).not.toBeNull();
      expect(result?._id).toBe("doc_123");
      expect(result?.cms.testId).toBe("test_456");
    });

    it("returns null when entity does not exist", async () => {
      mockDb.mocks.first.mockResolvedValue(null);

      const result = await repo.tryLoad(mockDb, "nonexistent");

      expect(result).toBeNull();
    });

    it("does not throw when entity does not exist", async () => {
      mockDb.mocks.first.mockResolvedValue(null);

      await expect(repo.tryLoad(mockDb, "nonexistent")).resolves.toBeNull();
    });

    it("propagates error when upcast function throws", async () => {
      const rawCMS = {
        _id: "doc_123",
        testId: "test_456",
        name: "Test Entity",
        stateVersion: 1,
        version: 1,
      };
      mockDb.mocks.first.mockResolvedValue(rawCMS);
      mockUpcast.mockImplementation(() => {
        throw new Error("Invalid CMS state during upcast");
      });

      await expect(repo.tryLoad(mockDb, "test_456")).rejects.toThrow(
        "Invalid CMS state during upcast"
      );
    });
  });

  describe("exists", () => {
    it("returns true when entity exists", async () => {
      const rawCMS = {
        _id: "doc_123",
        testId: "test_456",
        name: "Test Entity",
        stateVersion: 1,
        version: 1,
      };
      mockDb.mocks.first.mockResolvedValue(rawCMS);

      const result = await repo.exists(mockDb, "test_456");

      expect(result).toBe(true);
      expect(mockDb.mocks.query).toHaveBeenCalledWith("testCMS");
      expect(mockDb.mocks.withIndex).toHaveBeenCalledWith("by_testId", expect.any(Function));
    });

    it("returns false when entity does not exist", async () => {
      mockDb.mocks.first.mockResolvedValue(null);

      const result = await repo.exists(mockDb, "nonexistent");

      expect(result).toBe(false);
    });

    it("does not call upcast function (more efficient)", async () => {
      const rawCMS = {
        _id: "doc_123",
        testId: "test_456",
        name: "Test Entity",
        stateVersion: 1,
        version: 1,
      };
      mockDb.mocks.first.mockResolvedValue(rawCMS);

      await repo.exists(mockDb, "test_456");

      // exists() should NOT call upcast for efficiency
      expect(mockUpcast).not.toHaveBeenCalled();
    });
  });

  describe("loadMany", () => {
    it("loads multiple entities in parallel", async () => {
      const rawCMS1 = {
        _id: "doc_1",
        testId: "test_1",
        name: "Entity 1",
        stateVersion: 1,
        version: 1,
      };
      const rawCMS2 = {
        _id: "doc_2",
        testId: "test_2",
        name: "Entity 2",
        stateVersion: 1,
        version: 2,
      };
      // Mock first to return different values based on call order
      mockDb.mocks.first.mockResolvedValueOnce(rawCMS1).mockResolvedValueOnce(rawCMS2);

      const results = await repo.loadMany(mockDb, ["test_1", "test_2"]);

      expect(results).toHaveLength(2);
      expect(results[0]?._id).toBe("doc_1");
      expect(results[0]?.cms.testId).toBe("test_1");
      expect(results[1]?._id).toBe("doc_2");
      expect(results[1]?.cms.testId).toBe("test_2");
    });

    it("returns null for missing entities", async () => {
      const rawCMS = {
        _id: "doc_1",
        testId: "test_1",
        name: "Entity 1",
        stateVersion: 1,
        version: 1,
      };
      mockDb.mocks.first
        .mockResolvedValueOnce(rawCMS)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(rawCMS);

      const results = await repo.loadMany(mockDb, ["test_1", "missing", "test_3"]);

      expect(results).toHaveLength(3);
      expect(results[0]).not.toBeNull();
      expect(results[1]).toBeNull();
      expect(results[2]).not.toBeNull();
    });

    it("returns empty array for empty input", async () => {
      const results = await repo.loadMany(mockDb, []);

      expect(results).toEqual([]);
      expect(mockDb.mocks.query).not.toHaveBeenCalled();
    });

    it("upcasts all loaded entities", async () => {
      const rawCMS1 = {
        _id: "doc_1",
        testId: "test_1",
        name: "Entity 1",
        stateVersion: 1,
        version: 1,
      };
      const rawCMS2 = {
        _id: "doc_2",
        testId: "test_2",
        name: "Entity 2",
        stateVersion: 1,
        version: 2,
      };
      mockDb.mocks.first.mockResolvedValueOnce(rawCMS1).mockResolvedValueOnce(rawCMS2);

      await repo.loadMany(mockDb, ["test_1", "test_2"]);

      expect(mockUpcast).toHaveBeenCalledTimes(2);
      expect(mockUpcast).toHaveBeenCalledWith(rawCMS1);
      expect(mockUpcast).toHaveBeenCalledWith(rawCMS2);
    });

    it("preserves order of input IDs", async () => {
      const rawCMS1 = { _id: "doc_a", testId: "a", name: "A", stateVersion: 1, version: 1 };
      const rawCMS2 = { _id: "doc_b", testId: "b", name: "B", stateVersion: 1, version: 1 };
      const rawCMS3 = { _id: "doc_c", testId: "c", name: "C", stateVersion: 1, version: 1 };

      mockDb.mocks.first
        .mockResolvedValueOnce(rawCMS1)
        .mockResolvedValueOnce(rawCMS2)
        .mockResolvedValueOnce(rawCMS3);

      const results = await repo.loadMany(mockDb, ["a", "b", "c"]);

      expect(results[0]?.cms.testId).toBe("a");
      expect(results[1]?.cms.testId).toBe("b");
      expect(results[2]?.cms.testId).toBe("c");
    });

    it("propagates error when upcast function throws for any entity", async () => {
      const rawCMS1 = {
        _id: "doc_1",
        testId: "test_1",
        name: "Entity 1",
        stateVersion: 1,
        version: 1,
      };
      const rawCMS2 = {
        _id: "doc_2",
        testId: "test_2",
        name: "Entity 2",
        stateVersion: 1,
        version: 2,
      };
      mockDb.mocks.first.mockResolvedValueOnce(rawCMS1).mockResolvedValueOnce(rawCMS2);
      mockUpcast
        .mockReturnValueOnce({
          cms: rawCMS1 as TestCMS,
          wasUpcasted: false,
          originalStateVersion: 1,
        })
        .mockImplementationOnce(() => {
          throw new Error("Upcast failed for second entity");
        });

      await expect(repo.loadMany(mockDb, ["test_1", "test_2"])).rejects.toThrow(
        "Upcast failed for second entity"
      );
    });
  });

  describe("insert", () => {
    it("inserts CMS record and returns document ID", async () => {
      const cms: TestCMS = {
        testId: "test_789",
        name: "New Entity",
        stateVersion: 1,
        version: 0,
      };
      mockDb.mocks.insert.mockResolvedValue("doc_789");

      const result = await repo.insert(mockDb, cms);

      expect(mockDb.mocks.insert).toHaveBeenCalledWith("testCMS", cms);
      expect(result).toBe("doc_789");
    });
  });

  describe("update", () => {
    it("updates CMS when version matches", async () => {
      mockDb.mocks.get.mockResolvedValue({
        _id: "doc_123",
        testId: "test_456",
        version: 5,
      });

      await repo.update(mockDb, "doc_123", { name: "Updated" }, 5);

      expect(mockDb.mocks.patch).toHaveBeenCalledWith("doc_123", { name: "Updated" });
    });

    it("throws NotFoundError when document does not exist", async () => {
      mockDb.mocks.get.mockResolvedValue(null);

      await expect(repo.update(mockDb, "nonexistent", {}, 1)).rejects.toThrow(NotFoundError);
    });

    it("throws VersionConflictError when version mismatch", async () => {
      mockDb.mocks.get.mockResolvedValue({
        _id: "doc_123",
        testId: "test_456",
        version: 10,
      });

      await expect(repo.update(mockDb, "doc_123", {}, 5)).rejects.toThrow(VersionConflictError);
      await expect(repo.update(mockDb, "doc_123", {}, 5)).rejects.toThrow("expected 5, got 10");
    });
  });
});

describe("NotFoundError", () => {
  it("has correct properties", () => {
    const error = new NotFoundError("orderCMS", "order_123");

    expect(error.name).toBe("NotFoundError");
    expect(error.table).toBe("orderCMS");
    expect(error.id).toBe("order_123");
    expect(error.message).toBe("orderCMS not found: order_123");
  });

  it("is instanceof Error", () => {
    const error = new NotFoundError("testCMS", "test_1");
    expect(error).toBeInstanceOf(Error);
  });

  describe("isNotFoundError type guard", () => {
    it("returns true for NotFoundError", () => {
      const error = new NotFoundError("testCMS", "test_1");
      expect(NotFoundError.isNotFoundError(error)).toBe(true);
    });

    it("returns false for regular Error", () => {
      expect(NotFoundError.isNotFoundError(new Error("msg"))).toBe(false);
    });

    it("returns false for non-error values", () => {
      expect(NotFoundError.isNotFoundError(null)).toBe(false);
      expect(NotFoundError.isNotFoundError("error")).toBe(false);
    });
  });
});

describe("VersionConflictError", () => {
  it("has correct properties", () => {
    const error = new VersionConflictError("orderCMS", "order_123", 5, 10);

    expect(error.name).toBe("VersionConflictError");
    expect(error.table).toBe("orderCMS");
    expect(error.id).toBe("order_123");
    expect(error.expectedVersion).toBe(5);
    expect(error.actualVersion).toBe(10);
    expect(error.message).toBe("Version conflict for orderCMS order_123: expected 5, got 10");
  });

  it("is instanceof Error", () => {
    const error = new VersionConflictError("testCMS", "test_1", 1, 2);
    expect(error).toBeInstanceOf(Error);
  });

  describe("isVersionConflictError type guard", () => {
    it("returns true for VersionConflictError", () => {
      const error = new VersionConflictError("testCMS", "test_1", 1, 2);
      expect(VersionConflictError.isVersionConflictError(error)).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(VersionConflictError.isVersionConflictError(new Error("msg"))).toBe(false);
      expect(VersionConflictError.isVersionConflictError(new NotFoundError("t", "1"))).toBe(false);
    });
  });
});

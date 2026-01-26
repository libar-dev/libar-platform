/**
 * Unit tests for Pagination helpers.
 *
 * Tests cursor-based pagination utilities for read model queries.
 */
import { describe, it, expect } from "vitest";
import {
  normalizePaginationOptions,
  createEmptyPage,
  createPagedResult,
  encodeCursor,
  decodeCursor,
  isValidPageSize,
  getEffectivePageSize,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../../../src/queries/pagination";

describe("Pagination Helpers", () => {
  describe("Constants", () => {
    it("has reasonable default page size", () => {
      expect(DEFAULT_PAGE_SIZE).toBe(20);
    });

    it("has reasonable max page size", () => {
      expect(MAX_PAGE_SIZE).toBe(100);
    });
  });

  describe("normalizePaginationOptions", () => {
    const config = { defaultPageSize: 20, maxPageSize: 100 };

    it("returns defaults when no options provided", () => {
      const result = normalizePaginationOptions(undefined, config);

      expect(result.pageSize).toBe(20);
      expect(result.cursor).toBeUndefined();
    });

    it("uses provided page size within limits", () => {
      const result = normalizePaginationOptions({ pageSize: 50 }, config);

      expect(result.pageSize).toBe(50);
    });

    it("caps page size at max", () => {
      const result = normalizePaginationOptions({ pageSize: 200 }, config);

      expect(result.pageSize).toBe(100);
    });

    it("enforces minimum page size of 1", () => {
      const result = normalizePaginationOptions({ pageSize: 0 }, config);

      expect(result.pageSize).toBe(1);
    });

    it("handles negative page size", () => {
      const result = normalizePaginationOptions({ pageSize: -5 }, config);

      expect(result.pageSize).toBe(1);
    });

    it("passes through cursor", () => {
      const result = normalizePaginationOptions({ cursor: "abc123" }, config);

      expect(result.cursor).toBe("abc123");
    });

    it("works with custom config values", () => {
      const customConfig = { defaultPageSize: 10, maxPageSize: 50 };

      const result = normalizePaginationOptions(undefined, customConfig);
      expect(result.pageSize).toBe(10);

      const capped = normalizePaginationOptions({ pageSize: 100 }, customConfig);
      expect(capped.pageSize).toBe(50);
    });

    it("rounds floating-point page sizes down", () => {
      const result = normalizePaginationOptions({ pageSize: 10.5 }, config);
      expect(result.pageSize).toBe(10);
    });

    it("handles very small floats", () => {
      const result = normalizePaginationOptions({ pageSize: 1.1 }, config);
      expect(result.pageSize).toBe(1);
    });

    it("rounds floats near boundaries", () => {
      const result = normalizePaginationOptions({ pageSize: 99.9 }, config);
      expect(result.pageSize).toBe(99);
    });
  });

  describe("createEmptyPage", () => {
    it("creates an empty page with correct structure", () => {
      const page = createEmptyPage<{ id: string }>();

      expect(page.page).toEqual([]);
      expect(page.continueCursor).toBeNull();
      expect(page.isDone).toBe(true);
    });

    it("preserves type information", () => {
      interface Order {
        id: string;
        status: string;
      }

      const page = createEmptyPage<Order>();

      // TypeScript should infer page.page as Order[]
      expect(Array.isArray(page.page)).toBe(true);
      expect(page.page).toHaveLength(0);
    });
  });

  describe("createPagedResult", () => {
    it("creates a page with items and cursor", () => {
      const items = [{ id: "1" }, { id: "2" }, { id: "3" }];

      const page = createPagedResult(items, 3, "next-cursor");

      expect(page.page).toEqual(items);
      expect(page.continueCursor).toBe("next-cursor");
      expect(page.isDone).toBe(false);
    });

    it("creates a done page when cursor is null", () => {
      const items = [{ id: "1" }, { id: "2" }];

      const page = createPagedResult(items, 3, null);

      expect(page.page).toEqual(items);
      expect(page.continueCursor).toBeNull();
      expect(page.isDone).toBe(true);
    });

    it("handles empty items array", () => {
      const page = createPagedResult([], 10, null);

      expect(page.page).toEqual([]);
      expect(page.isDone).toBe(true);
    });
  });

  describe("encodeCursor / decodeCursor", () => {
    it("encodes and decodes position data", () => {
      const position = { offset: 20, lastId: "abc123" };

      const cursor = encodeCursor(position);
      const decoded = decodeCursor<typeof position>(cursor);

      expect(decoded).toEqual(position);
    });

    it("handles complex position data", () => {
      const position = {
        globalPosition: 12345678,
        streamId: "order-123",
        timestamp: Date.now(),
      };

      const cursor = encodeCursor(position);
      const decoded = decodeCursor<typeof position>(cursor);

      expect(decoded).toEqual(position);
    });

    it("produces base64-encoded string", () => {
      const cursor = encodeCursor({ offset: 0 });

      // Should be valid base64
      expect(() => Buffer.from(cursor, "base64")).not.toThrow();
    });

    it("returns null for undefined cursor", () => {
      const decoded = decodeCursor(undefined);

      expect(decoded).toBeNull();
    });

    it("returns null for empty string cursor", () => {
      const decoded = decodeCursor("");

      expect(decoded).toBeNull();
    });

    it("returns null for invalid base64 length", () => {
      // After padding removal, length % 4 cannot equal 1
      // 'X' is a single character which is invalid base64 length
      const decoded = decodeCursor("X");

      expect(decoded).toBeNull();
    });

    it("returns null for invalid base64", () => {
      const decoded = decodeCursor("not-valid-base64!@#$");

      expect(decoded).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      // Valid base64 but not valid JSON
      const invalidJson = Buffer.from("not json").toString("base64");

      const decoded = decodeCursor(invalidJson);

      expect(decoded).toBeNull();
    });

    it("handles empty object", () => {
      const cursor = encodeCursor({});
      const decoded = decodeCursor(cursor);

      expect(decoded).toEqual({});
    });

    it("handles nested objects", () => {
      const position = {
        page: { offset: 10 },
        filter: { status: "active" },
      };

      const cursor = encodeCursor(position);
      const decoded = decodeCursor<typeof position>(cursor);

      expect(decoded).toEqual(position);
    });

    it("handles arrays in position data", () => {
      const position = {
        ids: ["a", "b", "c"],
        offset: 5,
      };

      const cursor = encodeCursor(position);
      const decoded = decodeCursor<typeof position>(cursor);

      expect(decoded).toEqual(position);
    });

    it("handles special characters and Unicode in cursor data", () => {
      const position = {
        key: "value with spaces & special <chars>",
        emoji: "🎉",
        unicode: "日本語テスト",
        quotes: "\"quoted\" and 'single'",
        symbols: "!@#$%^&*()",
      };

      const cursor = encodeCursor(position);
      const decoded = decodeCursor<typeof position>(cursor);

      expect(decoded).toEqual(position);
    });

    it("returns null for base64 with invalid characters in middle", () => {
      // Create a valid-looking cursor but with an invalid character in position 3
      const invalidCursor = "eyJ!ZXkiOiJ2YWx1ZSJ9"; // '!' is not valid base64

      const decoded = decodeCursor(invalidCursor);

      expect(decoded).toBeNull();
    });

    it("returns null for base64 with invalid characters at end", () => {
      // Valid base64 prefix but invalid character at end
      const invalidCursor = "eyJrZXkiOiJ2YWx1ZSJ!";

      const decoded = decodeCursor(invalidCursor);

      expect(decoded).toBeNull();
    });

    it("returns null for truncated UTF-8 sequences", () => {
      // Create base64 that decodes to truncated UTF-8
      // 0xC0 (192) is a 2-byte UTF-8 lead byte, but we only provide 1 byte
      // Base64 encode a single byte 0xC0 = "wA=="
      const truncatedUtf8Cursor = "wA==";

      const decoded = decodeCursor(truncatedUtf8Cursor);

      expect(decoded).toBeNull();
    });
  });

  describe("isValidPageSize", () => {
    it("returns true for valid page sizes", () => {
      expect(isValidPageSize(1)).toBe(true);
      expect(isValidPageSize(20)).toBe(true);
      expect(isValidPageSize(100)).toBe(true);
    });

    it("returns false for zero", () => {
      expect(isValidPageSize(0)).toBe(false);
    });

    it("returns false for negative numbers", () => {
      expect(isValidPageSize(-1)).toBe(false);
      expect(isValidPageSize(-100)).toBe(false);
    });

    it("returns false for values exceeding max", () => {
      expect(isValidPageSize(101)).toBe(false);
      expect(isValidPageSize(1000)).toBe(false);
    });

    it("respects custom max page size", () => {
      expect(isValidPageSize(50, 50)).toBe(true);
      expect(isValidPageSize(51, 50)).toBe(false);
    });

    it("returns false for non-integers", () => {
      expect(isValidPageSize(10.5)).toBe(false);
      expect(isValidPageSize(NaN)).toBe(false);
    });
  });

  describe("getEffectivePageSize", () => {
    it("returns requested size when valid", () => {
      expect(getEffectivePageSize(50)).toBe(50);
    });

    it("returns default when not specified", () => {
      expect(getEffectivePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    });

    it("caps at max page size", () => {
      expect(getEffectivePageSize(200)).toBe(MAX_PAGE_SIZE);
    });

    it("enforces minimum of 1", () => {
      expect(getEffectivePageSize(0)).toBe(1);
      expect(getEffectivePageSize(-10)).toBe(1);
    });

    it("uses custom default size", () => {
      expect(getEffectivePageSize(undefined, 30)).toBe(30);
    });

    it("uses custom max size", () => {
      expect(getEffectivePageSize(100, 20, 50)).toBe(50);
    });

    it("works with all custom values", () => {
      expect(getEffectivePageSize(undefined, 15, 75)).toBe(15);
      expect(getEffectivePageSize(100, 15, 75)).toBe(75);
      expect(getEffectivePageSize(30, 15, 75)).toBe(30);
    });

    it("rounds floating-point sizes down", () => {
      expect(getEffectivePageSize(10.5)).toBe(10);
      expect(getEffectivePageSize(10.9)).toBe(10);
      expect(getEffectivePageSize(1.1)).toBe(1);
    });
  });

  describe("Pagination Workflow", () => {
    it("simulates complete pagination flow", () => {
      // First page
      const items1 = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const cursor1 = encodeCursor({ offset: 3 });
      const page1 = createPagedResult(items1, 3, cursor1);

      expect(page1.isDone).toBe(false);
      expect(page1.continueCursor).toBe(cursor1);

      // Decode cursor for next page
      const position = decodeCursor<{ offset: number }>(page1.continueCursor!);
      expect(position?.offset).toBe(3);

      // Last page
      const items2 = [{ id: "4" }];
      const page2 = createPagedResult(items2, 3, null);

      expect(page2.isDone).toBe(true);
      expect(page2.continueCursor).toBeNull();
    });

    it("handles empty result set", () => {
      // Query returns no results
      const page = createEmptyPage<{ id: string }>();

      expect(page.page).toHaveLength(0);
      expect(page.isDone).toBe(true);
    });

    it("handles exact page size match", () => {
      // When items exactly match page size, still need cursor for next check
      const items = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const cursor = encodeCursor({ offset: 3 });
      const page = createPagedResult(items, 3, cursor);

      expect(page.page).toHaveLength(3);
      expect(page.isDone).toBe(false);
    });
  });
});

/**
 * Pagination helpers for read model queries.
 *
 * Provides utilities for cursor-based pagination following
 * Convex's native pagination patterns.
 */

import type { ZodSchema } from "zod";
import type { PagedQueryResult, PaginationOptions, NormalizedPaginationOptions } from "./types.js";

/**
 * Default page size when not specified.
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Maximum allowed page size to prevent unbounded queries.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * Clamps a page size value to be within valid bounds.
 *
 * @param requested - The requested page size
 * @param min - Minimum allowed page size (typically 1)
 * @param max - Maximum allowed page size
 * @returns Page size clamped to [min, max] range, floored to integer
 * @internal
 */
function clampPageSize(requested: number, min: number, max: number): number {
  return Math.min(Math.max(min, Math.floor(requested)), max);
}

/**
 * Validates and normalizes pagination options.
 *
 * Ensures page size is within bounds and provides defaults.
 *
 * @param options - Pagination options from caller
 * @param config - Query configuration with defaults and limits
 * @returns Normalized pagination options
 *
 * @example
 * ```typescript
 * const normalized = normalizePaginationOptions(
 *   { pageSize: 500 },
 *   { defaultPageSize: 20, maxPageSize: 100 }
 * );
 * // normalized.pageSize === 100 (capped at max)
 * ```
 */
export function normalizePaginationOptions(
  options: PaginationOptions | undefined,
  config: { defaultPageSize: number; maxPageSize: number }
): NormalizedPaginationOptions {
  const requestedSize = options?.pageSize ?? config.defaultPageSize;
  const pageSize = clampPageSize(requestedSize, 1, config.maxPageSize);

  return {
    pageSize,
    cursor: options?.cursor,
  };
}

/**
 * Creates an empty paged result.
 *
 * Useful for returning empty results from queries.
 *
 * @template T - Type of items
 * @returns Empty paged result with isDone: true
 *
 * @example
 * ```typescript
 * if (filters.isEmpty) {
 *   return createEmptyPage<Order>();
 * }
 * ```
 */
export function createEmptyPage<T>(): PagedQueryResult<T> {
  return {
    page: [],
    continueCursor: null,
    isDone: true,
  };
}

/**
 * Creates a paged result from items.
 *
 * Determines if there are more pages based on whether
 * we received more items than requested (fetch N+1 pattern).
 *
 * @template T - Type of items
 * @param items - Items to include in the page
 * @param pageSize - Number of items requested
 * @param cursor - Cursor for the next page (if any)
 * @returns Paged result
 *
 * @example
 * ```typescript
 * // Fetch pageSize + 1 to detect if there's more
 * const items = await fetchItems(pageSize + 1);
 * const hasMore = items.length > pageSize;
 * const pageItems = hasMore ? items.slice(0, pageSize) : items;
 * return createPagedResult(pageItems, pageSize, hasMore ? nextCursor : null);
 * ```
 */
export function createPagedResult<T>(
  items: T[],
  pageSize: number,
  cursor: string | null
): PagedQueryResult<T> {
  return {
    page: items,
    continueCursor: cursor,
    isDone: cursor === null,
  };
}

// URL-safe base64 (base64url) character set - uses - and _ instead of + and /
// This avoids URL encoding issues when cursors appear in query strings
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Encodes a string as UTF-8 bytes represented as a string of single-byte characters.
 * This allows the base64 encoder to handle Unicode characters correctly.
 * @internal
 */
function utf8Encode(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);

    if (code < 0x80) {
      // Single byte (ASCII)
      result += String.fromCharCode(code);
    } else if (code < 0x800) {
      // Two bytes
      result += String.fromCharCode(0xc0 | (code >> 6));
      result += String.fromCharCode(0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      // Surrogate pair (4 bytes for code points > 0xFFFF like emoji)
      const nextCode = str.charCodeAt(i + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        const codePoint = 0x10000 + ((code - 0xd800) << 10) + (nextCode - 0xdc00);
        result += String.fromCharCode(0xf0 | (codePoint >> 18));
        result += String.fromCharCode(0x80 | ((codePoint >> 12) & 0x3f));
        result += String.fromCharCode(0x80 | ((codePoint >> 6) & 0x3f));
        result += String.fromCharCode(0x80 | (codePoint & 0x3f));
        i++; // Skip the next surrogate
        continue;
      }
      // Invalid surrogate, treat as 3-byte encoding
      result += String.fromCharCode(0xe0 | (code >> 12));
      result += String.fromCharCode(0x80 | ((code >> 6) & 0x3f));
      result += String.fromCharCode(0x80 | (code & 0x3f));
    } else {
      // Three bytes (most Unicode characters including CJK)
      result += String.fromCharCode(0xe0 | (code >> 12));
      result += String.fromCharCode(0x80 | ((code >> 6) & 0x3f));
      result += String.fromCharCode(0x80 | (code & 0x3f));
    }
  }
  return result;
}

/**
 * Decodes UTF-8 bytes (represented as single-byte character string) back to a Unicode string.
 * @internal
 * @throws {Error} If the byte sequence is truncated or invalid
 */
function utf8Decode(bytes: string): string {
  let result = "";
  let i = 0;
  const len = bytes.length;

  while (i < len) {
    const byte1 = bytes.charCodeAt(i);

    if (byte1 < 0x80) {
      // Single byte (ASCII)
      result += String.fromCharCode(byte1);
      i++;
    } else if ((byte1 & 0xe0) === 0xc0) {
      // Two bytes - verify continuation byte exists
      if (i + 1 >= len) {
        throw new Error(`Truncated UTF-8 sequence at position ${i}: expected 2 bytes`);
      }
      const byte2 = bytes.charCodeAt(i + 1);
      const codePoint = ((byte1 & 0x1f) << 6) | (byte2 & 0x3f);
      result += String.fromCharCode(codePoint);
      i += 2;
    } else if ((byte1 & 0xf0) === 0xe0) {
      // Three bytes - verify continuation bytes exist
      if (i + 2 >= len) {
        throw new Error(`Truncated UTF-8 sequence at position ${i}: expected 3 bytes`);
      }
      const byte2 = bytes.charCodeAt(i + 1);
      const byte3 = bytes.charCodeAt(i + 2);
      const codePoint = ((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f);
      result += String.fromCharCode(codePoint);
      i += 3;
    } else if ((byte1 & 0xf8) === 0xf0) {
      // Four bytes (emoji and other supplementary characters) - verify continuation bytes exist
      if (i + 3 >= len) {
        throw new Error(`Truncated UTF-8 sequence at position ${i}: expected 4 bytes`);
      }
      const byte2 = bytes.charCodeAt(i + 1);
      const byte3 = bytes.charCodeAt(i + 2);
      const byte4 = bytes.charCodeAt(i + 3);
      const codePoint =
        ((byte1 & 0x07) << 18) | ((byte2 & 0x3f) << 12) | ((byte3 & 0x3f) << 6) | (byte4 & 0x3f);
      // Convert to surrogate pair for JavaScript string
      const adjusted = codePoint - 0x10000;
      result += String.fromCharCode(0xd800 + (adjusted >> 10));
      result += String.fromCharCode(0xdc00 + (adjusted & 0x3ff));
      i += 4;
    } else {
      // Invalid UTF-8 byte - throw rather than silently corrupting data
      throw new Error(`Invalid UTF-8 byte at position ${i}: 0x${byte1.toString(16)}`);
    }
  }

  return result;
}

/**
 * Simple base64 encoder that works in all environments.
 * Handles Unicode by first encoding to UTF-8.
 * @internal
 */
function toBase64(str: string): string {
  // First encode as UTF-8
  const utf8 = utf8Encode(str);

  let result = "";
  const len = utf8.length;

  for (let i = 0; i < len; i += 3) {
    const a = utf8.charCodeAt(i);
    const b = i + 1 < len ? utf8.charCodeAt(i + 1) : 0;
    const c = i + 2 < len ? utf8.charCodeAt(i + 2) : 0;

    const triplet = (a << 16) | (b << 8) | c;

    result += BASE64_CHARS[(triplet >> 18) & 0x3f];
    result += BASE64_CHARS[(triplet >> 12) & 0x3f];
    result += i + 1 < len ? BASE64_CHARS[(triplet >> 6) & 0x3f] : "=";
    result += i + 2 < len ? BASE64_CHARS[triplet & 0x3f] : "=";
  }

  return result;
}

/**
 * Simple base64 decoder that works in all environments.
 * Decodes UTF-8 back to Unicode string.
 * @internal
 * @throws {Error} If the input is not valid base64
 */
function fromBase64(str: string): string {
  // Remove padding and get clean string
  const cleanStr = str.replace(/=+$/, "");
  const len = cleanStr.length;

  // Validate base64 length (after padding removal, length % 4 cannot equal 1)
  if (len % 4 === 1) {
    throw new Error("Invalid base64 length");
  }

  let bytes = "";

  for (let i = 0; i < len; i += 4) {
    const charA = cleanStr[i];
    const charB = cleanStr[i + 1];
    const charC = cleanStr[i + 2];
    const charD = cleanStr[i + 3];

    const a = charA !== undefined ? BASE64_CHARS.indexOf(charA) : 0;
    const b = charB !== undefined ? BASE64_CHARS.indexOf(charB) : 0;
    const c = charC !== undefined ? BASE64_CHARS.indexOf(charC) : 0;
    const d = charD !== undefined ? BASE64_CHARS.indexOf(charD) : 0;

    if (
      a === -1 ||
      b === -1 ||
      (charC !== undefined && c === -1) ||
      (charD !== undefined && d === -1)
    ) {
      throw new Error("Invalid base64");
    }

    const triplet = (a << 18) | (b << 12) | (c << 6) | d;

    bytes += String.fromCharCode((triplet >> 16) & 0xff);
    if (charC !== undefined) bytes += String.fromCharCode((triplet >> 8) & 0xff);
    if (charD !== undefined) bytes += String.fromCharCode(triplet & 0xff);
  }

  // Decode UTF-8 back to Unicode
  return utf8Decode(bytes);
}

/**
 * Encodes a cursor from position data.
 *
 * Creates an opaque cursor string from internal position data.
 * Uses base64 encoding for URL safety.
 *
 * @param position - Position data to encode
 * @returns Opaque cursor string
 *
 * @example
 * ```typescript
 * const cursor = encodeCursor({ offset: 20, lastId: "abc123" });
 * // Returns base64-encoded string
 * ```
 */
export function encodeCursor(position: Record<string, unknown>): string {
  return toBase64(JSON.stringify(position));
}

/**
 * Decodes a cursor to position data.
 *
 * Parses an opaque cursor string back to position data.
 * Returns null for invalid cursors instead of throwing.
 *
 * For security-critical use cases, pass a Zod schema to validate the cursor
 * structure at runtime. If validation fails, the function returns null.
 *
 * @template T - Expected type of position data
 * @param cursor - Opaque cursor string
 * @param schema - Optional Zod schema to validate the decoded data
 * @returns Decoded and optionally validated position data, or null if invalid
 *
 * @example
 * ```typescript
 * // Without validation (caller must validate)
 * const position = decodeCursor<{ offset: number }>(cursor);
 *
 * // With schema validation (recommended for untrusted cursors)
 * import { z } from "zod";
 * const CursorSchema = z.object({ offset: z.number(), streamId: z.string() });
 * const position = decodeCursor(cursor, CursorSchema);
 * // position is guaranteed to match the schema or be null
 * ```
 */
export function decodeCursor<T = Record<string, unknown>>(
  cursor: string | undefined,
  schema?: ZodSchema<T>
): T | null {
  if (!cursor) return null;

  try {
    const decoded = fromBase64(cursor);
    const parsed = JSON.parse(decoded);

    // If schema provided, validate the parsed data
    if (schema) {
      const result = schema.safeParse(parsed);
      return result.success ? result.data : null;
    }

    // Legacy behavior: return without validation
    return parsed as T;
  } catch {
    return null;
  }
}

/**
 * Validates that a page size is within acceptable bounds.
 *
 * @param pageSize - Requested page size
 * @param maxPageSize - Maximum allowed page size
 * @returns True if page size is valid
 */
export function isValidPageSize(pageSize: number, maxPageSize: number = MAX_PAGE_SIZE): boolean {
  return Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= maxPageSize;
}

/**
 * Gets the effective page size, capped at maximum.
 *
 * @param requestedSize - Requested page size
 * @param defaultSize - Default page size
 * @param maxSize - Maximum allowed page size
 * @returns Effective page size
 */
export function getEffectivePageSize(
  requestedSize: number | undefined,
  defaultSize: number = DEFAULT_PAGE_SIZE,
  maxSize: number = MAX_PAGE_SIZE
): number {
  if (requestedSize === undefined) return defaultSize;
  return clampPageSize(requestedSize, 1, maxSize);
}

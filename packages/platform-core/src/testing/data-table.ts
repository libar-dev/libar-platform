/**
 * DataTable Parsing Utilities for BDD Tests
 *
 * Provides utilities for parsing vitest-cucumber DataTable structures
 * into usable JavaScript objects.
 *
 * ## DataTable Format (vitest-cucumber)
 *
 * DataTables in Gherkin use horizontal column format (first row = headers):
 *
 * ```gherkin
 * | field    | value      |
 * | orderId  | ord_123    |
 * | status   | draft      |
 * | total    | 100.00     |
 * ```
 *
 * This is parsed by vitest-cucumber as an array of row objects.
 *
 * @module @libar-dev/platform-core/testing
 */

/**
 * Standard field/value DataTable row structure.
 *
 * Used for tables with "field" and "value" columns.
 *
 * @example
 * ```gherkin
 * | field    | value   |
 * | orderId  | ord_123 |
 * | status   | draft   |
 * ```
 */
export type DataTableRow = { field: string; value: string };

/**
 * Generic DataTable row (any columns).
 *
 * Used for tables with custom column headers.
 *
 * @example
 * ```gherkin
 * | productId | quantity | unitPrice |
 * | prod_1    | 5        | 10.00     |
 * | prod_2    | 3        | 25.00     |
 * ```
 */
export type GenericTableRow = Record<string, string>;

/**
 * Convert a field/value DataTable to a key-value object.
 *
 * @param rows - Array of DataTableRow with field and value columns
 * @returns Object mapping field names to their string values
 *
 * @example
 * ```typescript
 * const rows = [
 *   { field: "orderId", value: "ord_123" },
 *   { field: "status", value: "draft" }
 * ];
 * const obj = tableRowsToObject(rows);
 * // { orderId: "ord_123", status: "draft" }
 * ```
 */
export function tableRowsToObject(rows: DataTableRow[]): Record<string, string> {
  return rows.reduce(
    (acc, row) => {
      acc[row.field] = row.value;
      return acc;
    },
    {} as Record<string, string>
  );
}

/**
 * Parse a string value to a typed value.
 *
 * @param value - The string value to parse
 * @param type - The target type
 * @returns The parsed value
 * @throws Error if parsing fails
 *
 * @example
 * ```typescript
 * parseTableValue("42", "int")        // 42
 * parseTableValue("3.14", "float")    // 3.14
 * parseTableValue("true", "boolean")  // true
 * parseTableValue("hello", "string")  // "hello"
 * ```
 */
export function parseTableValue(value: string, type: "int"): number;
export function parseTableValue(value: string, type: "float"): number;
export function parseTableValue(value: string, type: "boolean"): boolean;
export function parseTableValue(value: string, type: "string"): string;
export function parseTableValue(
  value: string,
  type: "int" | "float" | "boolean" | "string"
): number | boolean | string {
  switch (type) {
    case "int": {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error(`Invalid integer value: "${value}"`);
      }
      return parsed;
    }
    case "float": {
      const parsed = parseFloat(value);
      if (isNaN(parsed)) {
        throw new Error(`Invalid float value: "${value}"`);
      }
      return parsed;
    }
    case "boolean": {
      const lower = value.toLowerCase();
      if (lower === "true" || lower === "yes" || lower === "1") return true;
      if (lower === "false" || lower === "no" || lower === "0") return false;
      throw new Error(`Invalid boolean value: "${value}"`);
    }
    case "string":
      return value;
  }
}

/**
 * Safely get a required field from a DataTable object.
 *
 * @param data - The parsed DataTable object
 * @param field - The field name to retrieve
 * @returns The field value
 * @throws Error if the field is missing
 *
 * @example
 * ```typescript
 * const data = { orderId: "ord_123", status: "draft" };
 * getRequiredField(data, "orderId"); // "ord_123"
 * getRequiredField(data, "missing"); // throws Error
 * ```
 */
export function getRequiredField(data: Record<string, string>, field: string): string {
  const value = data[field];
  if (value === undefined) {
    throw new Error(`Required field "${field}" not found in DataTable`);
  }
  return value;
}

/**
 * Get an optional field from a DataTable object with a default value.
 *
 * @param data - The parsed DataTable object
 * @param field - The field name to retrieve
 * @param defaultValue - Value to return if field is missing
 * @returns The field value or the default
 *
 * @example
 * ```typescript
 * const data = { orderId: "ord_123" };
 * getOptionalField(data, "status", "draft"); // "draft"
 * getOptionalField(data, "orderId", "default"); // "ord_123"
 * ```
 */
export function getOptionalField(
  data: Record<string, string>,
  field: string,
  defaultValue: string
): string {
  return data[field] ?? defaultValue;
}

/**
 * Shared DataTable helper for vitest-cucumber step definitions.
 *
 * vitest-cucumber v6 passes DataTables as raw 2D string arrays (header row + data rows).
 * This helper normalizes them into typed record arrays for use in step assertions.
 *
 * IMPORTANT: vitest-cucumber step callbacks receive (ctx: TestContext, ...params).
 * Always use the 2-arg pattern: (_ctx: unknown, dataTable: unknown) => { ... }
 * Using a 1-arg pattern receives TestContext as the "dataTable", not the actual table.
 */

/**
 * Parse a vitest-cucumber DataTable into typed row objects.
 *
 * Handles three input formats:
 * 1. Raw 2D array (string[][]) — header row + data rows from vitest-cucumber
 * 2. Already-parsed array of objects (T[]) — passed through
 * 3. Anything else — returns empty array
 *
 * @example
 * ```typescript
 * Then("the output contains:", (_ctx: unknown, dataTable: unknown) => {
 *   const rows = getDataTableRows<{ name: string; value: string }>(dataTable);
 *   for (const row of rows) {
 *     expect(state.output[row.name]).toBe(row.value);
 *   }
 * });
 * ```
 */
export function getDataTableRows<T extends Record<string, string>>(dataTable: unknown): T[] {
  if (!dataTable) return [];
  if (Array.isArray(dataTable)) {
    if (dataTable.length > 0 && Array.isArray(dataTable[0])) {
      // Raw 2D array format (header row + data rows)
      const raw = dataTable as string[][];
      if (raw.length < 2) return [];
      const headers = raw[0] as string[];
      const rows: T[] = [];
      for (let i = 1; i < raw.length; i++) {
        const rowData: Record<string, string> = {};
        const rawRow = raw[i];
        if (rawRow) {
          for (let j = 0; j < headers.length; j++) {
            const header = headers[j];
            if (header !== undefined && rawRow[j] !== undefined) {
              rowData[header] = rawRow[j];
            }
          }
          rows.push(rowData as T);
        }
      }
      return rows;
    }
    return dataTable as T[];
  }
  return [];
}

/**
 * Extract DataTable rows from vitest-cucumber step rest arguments.
 *
 * Use this when a step callback accepts `(...args: unknown[])` instead of
 * the explicit `(_ctx: unknown, dataTable: unknown)` two-arg pattern.
 * Scans all arguments to find the first array and delegates to getDataTableRows.
 *
 * @example
 * ```typescript
 * And("transitions include:", (...args: unknown[]) => {
 *   const rows = extractDataTable<{ from: string; to: string }>(...args);
 * });
 * ```
 */
export function extractDataTable<T extends Record<string, string>>(...args: unknown[]): T[] {
  for (const arg of args) {
    if (Array.isArray(arg)) {
      return getDataTableRows<T>(arg);
    }
  }
  return [];
}

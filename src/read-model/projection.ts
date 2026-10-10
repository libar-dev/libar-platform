// The projection contract of spec:application.projection-contract for a per-entity read model: its
// declaration, its projection, and applyProjection, the one writer of its rows.
import { getConvexSize, type Value } from "convex/values";
import type { GenericDataModel } from "convex/server";
import type { StreamVersion } from "../kernel/index.js";
import { rowWriter, rowsOf, type RowWriter } from "./tables.js";
// The pure, versioned rules that turn a context's DTO into a row, or into no row.
export type Projection<D, Row extends Record<string, Value>> = {
  version: number;
  keyOf(tenantId: string, dto: D): string;
  project(tenantId: string, dto: D, versions: StreamVersion[]): Row | null;
};
// A read model: its name in the registry, the parent table that holds its rows, the largest row it
// writes, and the projection that maintains it.
export type ReadModel<D, Row extends Record<string, Value>> = {
  name: string;
  table: string;
  rowBudgetBytes: number;
  projections: readonly [Projection<D, Row>, ...Projection<D, Row>[]];
};
// The declared projection for one generation's version.
export function projectionOf<D, Row extends Record<string, Value>>(
  readModel: ReadModel<D, Row>,
  version: number,
): Projection<D, Row> {
  const projection = readModel.projections.find(
    (item) => item.version === version,
  );
  if (projection === undefined)
    throw new Error(
      `Read model ${readModel.name} declares no projection of version ${version}`,
    );
  return projection;
}
// A read model of any DTO and row. Both are read and written, so only any fits all.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyReadModel = ReadModel<any, any>;
export const defaultRowBudgetBytes = 16384;
// The ceiling a declared row budget may not pass.
export const limitRowBudgetBytes = 65536;
// One generation a command writes, with the role the write rule decides by.
export type WritableGeneration = {
  role: "active" | "building" | "verifying";
  generation: number;
  projectionVersion: number;
};
export type ApplyMode = "live-created" | "live-updated" | "backfill";
export type ApplyResult =
  | "inserted"
  | "updated"
  | "deleted"
  | "skipped-missing"
  | "skipped-newer"
  | "unchanged";
export type ApplyInput<D> = {
  tenantId: string;
  dto: D;
  versions: StreamVersion[];
  mode: ApplyMode;
  generations: readonly WritableGeneration[];
};
// Writes the row in each generation given, in that order, and returns one result per generation. The
// row carries the version of the projection that wrote it.
export async function applyProjection<
  DataModel extends GenericDataModel,
  D,
  Row extends Record<string, Value>,
>(
  ctx: RowWriter<DataModel>,
  readModel: ReadModel<D, Row>,
  input: ApplyInput<D>,
): Promise<ApplyResult[]> {
  const { name, rowBudgetBytes } = readModel;
  if (rowBudgetBytes > limitRowBudgetBytes)
    throw new Error(
      `Read model ${name} declares a row budget of ${rowBudgetBytes} bytes, above ${limitRowBudgetBytes}`,
    );
  const db = rowWriter(ctx);
  const table = rowsOf(readModel.table);
  const { tenantId, versions } = input;
  const results: ApplyResult[] = [];
  for (const { role, generation, projectionVersion } of input.generations) {
    const projection = projectionOf(readModel, projectionVersion);
    const key = projection.keyOf(tenantId, input.dto);
    const fields = projection.project(tenantId, input.dto, versions);
    const existing = await db
      .query(table)
      .withIndex("by_key", (q) =>
        q.eq("tenantId", tenantId).eq("generation", generation).eq("key", key),
      )
      .unique();
    if (
      input.mode === "backfill" &&
      existing !== null &&
      !versions.some((inputVersion) => {
        const recorded = existing.sourceVersions.find(
          (version) =>
            version.tenantId === inputVersion.tenantId &&
            version.contextId === inputVersion.contextId &&
            version.streamType === inputVersion.streamType &&
            version.streamId === inputVersion.streamId,
        );
        return (
          recorded === undefined || recorded.version < inputVersion.version
        );
      })
    ) {
      results.push("skipped-newer");
      continue;
    }
    if (fields === null) {
      if (existing === null) results.push("unchanged");
      else {
        await db.delete(existing._id);
        results.push("deleted");
      }
      continue;
    }
    // A building generation takes an update only on a row its backfill has written.
    if (
      role === "building" &&
      input.mode === "live-updated" &&
      existing === null
    ) {
      results.push("skipped-missing");
      continue;
    }
    const row = {
      ...fields,
      tenantId,
      generation,
      key,
      projectionVersion: projection.version,
      sourceVersions: versions,
    };
    const bytes = getConvexSize(row);
    if (bytes > rowBudgetBytes)
      throw new Error(
        `Row ${key} of read model ${name} would be saved at ${bytes} bytes, above its budget of ${rowBudgetBytes}`,
      );
    if (existing === null) {
      await db.insert(table, row);
      results.push("inserted");
    } else {
      await db.replace(existing._id, row);
      results.push("updated");
    }
  }
  return results;
}

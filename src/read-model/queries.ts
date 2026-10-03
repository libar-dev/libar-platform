// What a parent query over a read model returns, and the bound on a list page of one
// (spec:application.read-models).
import {
  limitListBytes,
  limitListPage,
  type PageLimit,
} from "../context/queries.js";
import type { PaginationOptions } from "convex/server";
import type { Value } from "convex/values";
import type { AnyReadModel } from "./projection.js";
// A read-model row as a query returns it: the document ID, its creation time and the generation stay
// in the parent.
export function readModelView<
  Row extends { _id: unknown; _creationTime: number; generation: number },
>(row: Row): Omit<Row, "_id" | "_creationTime" | "generation"> {
  const { _id, _creationTime, generation, ...view } = row;
  void [_id, _creationTime, generation];
  return view;
}
// The options a list over the read model's table passes to boundedPage, from its row budget.
export const limitReadModelList = (readModel: AnyReadModel): PageLimit => ({
  items: limitListPage(readModel.rowBudgetBytes),
  bytes: limitListBytes,
});
// A client's page options with each cursor moved into the generation now active. A cursor of
// paginator is the JSON of a row's index key. Its equality prefix must be the query's, apart from the
// generation at the second place, which is replaced; a key of the index's fields plus two also carries
// that document's _creationTime and _id, which are dropped. A cursor already moved keeps its length, so
// moving it again replaces the generation alone. Any other cursor is refused before a read.
export function pageInGeneration(
  opts: PaginationOptions,
  prefix: readonly Value[],
  indexFields: number,
): PaginationOptions {
  const moved = {
    ...opts,
    cursor: moveCursor(opts.cursor, prefix, indexFields),
  };
  if (opts.endCursor !== undefined && opts.endCursor !== null)
    moved.endCursor = moveCursor(opts.endCursor, prefix, indexFields);
  return moved;
}
const generationAt = 1;
function moveCursor(
  cursor: string | null,
  prefix: readonly Value[],
  indexFields: number,
) {
  // null starts the list; "[]" is paginator's end of the list.
  if (cursor === null || cursor === "[]") return cursor;
  let key: unknown;
  try {
    key = JSON.parse(cursor);
  } catch {
    key = undefined;
  }
  if (
    !Array.isArray(key) ||
    (key.length !== indexFields && key.length !== indexFields + 2) ||
    typeof key[generationAt] !== "number" ||
    prefix.some(
      (value, i) =>
        i !== generationAt && JSON.stringify(key[i]) !== JSON.stringify(value),
    )
  )
    throw new Error("The cursor is not from this list");
  return JSON.stringify([...prefix, ...key.slice(prefix.length, indexFields)]);
}

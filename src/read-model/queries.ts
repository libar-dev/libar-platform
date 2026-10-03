// What a parent query over a read model returns, and the bound on a list page of one
// (spec:application.read-models).
import {
  limitListBytes,
  limitListPage,
  type PageLimit,
} from "../context/queries.js";
import type { PaginationOptions } from "convex/server";
import { convexToJson, jsonToConvex, type Value } from "convex/values";
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
// paginator's own cursor codec, which it does not export (convex-helpers 0.1.124,
// server/stream.js:1419 to :1441): undefined is written as the string "undefined", a string that ends
// in "undefined" gains one leading underscore, and the key goes through convexToJson. The two below
// read and write a key exactly so, and the comparison and the generation's replacement happen on the
// decoded values.
export function decodeCursorKey(cursor: string): Value[] {
  const json: unknown = JSON.parse(cursor);
  if (!Array.isArray(json)) throw new Error("not a key");
  return (jsonToConvex(json) as Value[]).map((value) =>
    typeof value === "string" && value.endsWith("undefined")
      ? value === "undefined"
        ? (undefined as unknown as Value)
        : value.slice(1)
      : value,
  );
}
export function encodeCursorKey(key: readonly Value[]): string {
  return JSON.stringify(
    convexToJson(
      key.map((value) =>
        value === undefined
          ? "undefined"
          : typeof value === "string" && value.endsWith("undefined")
            ? "_" + value
            : value,
      ),
    ),
  );
}
const sameValue = (a: Value | undefined, b: Value | undefined) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    JSON.stringify(convexToJson(a)) === JSON.stringify(convexToJson(b)));
function moveCursor(
  cursor: string | null,
  prefix: readonly Value[],
  indexFields: number,
) {
  // null starts the list; "[]" is paginator's end of the list, and as a start it reads from the first row.
  if (cursor === null || cursor === "[]") return cursor;
  let key: Value[] | undefined;
  try {
    key = decodeCursorKey(cursor);
  } catch {
    key = undefined;
  }
  if (
    key === undefined ||
    (key.length !== indexFields && key.length !== indexFields + 2) ||
    typeof key[generationAt] !== "number" ||
    prefix.some((value, i) => i !== generationAt && !sameValue(key[i], value))
  )
    throw new Error("The cursor is not from this list");
  return encodeCursorKey([...prefix, ...key.slice(prefix.length, indexFields)]);
}

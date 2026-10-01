// The depot's sanctioned operations. Each takes a list, so a parent use case makes one call.
import { ConvexError, v, type Infer, type ObjectType } from "convex/values";
import {
  defineOperation,
  planned,
  type StreamResult,
} from "../../../src/context/index.js";
import type { Rejection } from "../../../src/kernel/index.js";
import {
  isQuantity,
  type DocumentResult,
  type ReferenceResult,
  type StockResult,
} from "../../domain/index.js";
import {
  documentStatusValidator,
  documentStream,
  journal,
  referenceStream,
  stockStream,
  titleCopies,
  type DepotDocumentCommand,
} from "./streams.js";
const maxStreams = 100;
// Items on one document become one command on its stream, in the order documents first appear. An
// item equal to an earlier one adds nothing. One that names the same document with another field
// refuses the call as invalidInput, because a call makes one command on each stream it touches.
function byDocument<T extends { documentId: string }>(
  items: readonly T[],
): T[] {
  const first = new Map<string, T>();
  for (const item of items) {
    const earlier = first.get(item.documentId);
    if (earlier === undefined) {
      first.set(item.documentId, item);
      continue;
    }
    const fields = new Set([...Object.keys(earlier), ...Object.keys(item)]);
    if (
      [...fields].some(
        (field) =>
          (earlier as Record<string, unknown>)[field] !==
          (item as Record<string, unknown>)[field],
      )
    )
      throw new ConvexError<Rejection>({
        code: "invalidInput",
        message: `Document ${item.documentId} is listed twice with different commands`,
        details: { documentId: item.documentId },
      });
  }
  return [...first.values()];
}
const documentsResult = v.object({
  documents: v.array(
    v.object({ documentId: v.string(), status: documentStatusValidator }),
  ),
});
type DocumentsResult = Infer<typeof documentsResult>;
function combineDocuments(
  results: readonly StreamResult<unknown>[],
): DocumentsResult {
  return {
    documents: results
      .filter((result) => result.version.streamType === "document")
      .map((result) => ({
        documentId: result.version.streamId,
        status: (result.result as DocumentResult).status,
      })),
  };
}
// One command per listed document, at the version the caller reviewed when it names one.
const documentsInput = {
  documents: v.array(
    v.object({
      documentId: v.string(),
      expectedVersion: v.optional(v.number()),
    }),
  ),
};
function documentOperation(name: string, command: DepotDocumentCommand) {
  return defineOperation<ObjectType<typeof documentsInput>, DocumentsResult>(
    journal,
    {
      name,
      streams: [documentStream],
      input: documentsInput,
      returns: documentsResult,
      plan: ({ documents }) =>
        byDocument(documents).map(({ documentId, expectedVersion }) =>
          planned(documentStream, documentId, command, expectedVersion),
        ),
      combine: combineDocuments,
      maxStreams,
    },
  );
}
const createDocumentsInput = {
  documents: v.array(v.object({ documentId: v.string(), title: v.string() })),
};
const createPlans = (documents: { documentId: string; title: string }[]) =>
  byDocument(documents).map(({ documentId, title }) =>
    planned(documentStream, documentId, { commandType: "create", title }, 0),
  );
// A create names expected version 0, so a second create of the same ID is answered entityExists.
export const createDocuments = defineOperation<
  ObjectType<typeof createDocumentsInput>,
  DocumentsResult
>(journal, {
  name: "createDocuments",
  streams: [documentStream],
  input: createDocumentsInput,
  returns: documentsResult,
  plan: ({ documents }) => createPlans(documents),
  combine: combineDocuments,
  maxStreams,
});
const copyTitlesResult = v.object({ titles: v.array(v.string()) });
// A create whose result repeats each document's title titleCopies times, so an operation that writes
// little can return more than the library's bound on what a call returns.
export const copyTitles = defineOperation<
  ObjectType<typeof createDocumentsInput>,
  Infer<typeof copyTitlesResult>
>(journal, {
  name: "copyTitles",
  streams: [documentStream],
  input: createDocumentsInput,
  returns: copyTitlesResult,
  plan: ({ documents }) => createPlans(documents),
  combine: (results) => ({
    titles: results.flatMap((result) =>
      Array.from(
        { length: titleCopies },
        () => (result.dto as { title: string }).title,
      ),
    ),
  }),
  maxStreams,
});
export const submitDocuments = documentOperation("submitDocuments", {
  commandType: "submit",
});
export const shipDocuments = documentOperation("shipDocuments", {
  commandType: "ship",
});
export const failIfDecided = documentOperation("failIfDecided", {
  commandType: "failIfDecided",
});
const amendDocumentsInput = {
  documents: v.array(
    v.object({
      documentId: v.string(),
      title: v.string(),
      expectedVersion: v.optional(v.number()),
    }),
  ),
};
export const amendDocuments = defineOperation<
  ObjectType<typeof amendDocumentsInput>,
  DocumentsResult
>(journal, {
  name: "amendDocuments",
  streams: [documentStream],
  input: amendDocumentsInput,
  returns: documentsResult,
  plan: ({ documents }) =>
    byDocument(documents).map(({ documentId, title, expectedVersion }) =>
      planned(
        documentStream,
        documentId,
        { commandType: "amend", title },
        expectedVersion,
      ),
    ),
  combine: combineDocuments,
  maxStreams,
});
const stockLines = {
  lines: v.array(v.object({ productId: v.string(), quantity: v.number() })),
};
const stockResult = v.object({
  lines: v.array(v.object({ productId: v.string(), quantity: v.number() })),
});
type StockLine = { productId: string; quantity: number };
// Lines on one product become one command on its stream, in the order products first appear. Each
// line's quantity is checked before the sum: a line the decider would refuse is planned alone, so
// the call is refused with the decider's invalidQuantity, and the decider checks each sum again.
function byProduct(lines: readonly StockLine[]): [string, number][] {
  const invalid = lines.find(({ quantity }) => !isQuantity(quantity));
  if (invalid !== undefined) return [[invalid.productId, invalid.quantity]];
  const totals = new Map<string, number>();
  for (const { productId, quantity } of lines)
    totals.set(productId, (totals.get(productId) ?? 0) + quantity);
  return [...totals];
}
const stockPlans = (
  lines: readonly StockLine[],
  commandType: "addStock" | "claim",
) =>
  byProduct(lines).map(([productId, quantity]) =>
    planned(stockStream, productId, { commandType, quantity }),
  );
function combineStock(results: readonly StreamResult<unknown>[]) {
  return results
    .filter((result) => result.version.streamType === "stock")
    .map((result) => ({
      productId: result.version.streamId,
      quantity: (result.result as StockResult).quantity,
    }));
}
function stockOperation(name: string, commandType: "addStock" | "claim") {
  return defineOperation<
    ObjectType<typeof stockLines>,
    Infer<typeof stockResult>
  >(journal, {
    name,
    streams: [stockStream],
    input: stockLines,
    returns: stockResult,
    plan: ({ lines }) => stockPlans(lines, commandType),
    combine: (results) => ({ lines: combineStock(results) }),
    maxStreams,
  });
}
export const addStock = stockOperation("addStock", "addStock");
export const claimStock = stockOperation("claimStock", "claim");
const registerDocumentsInput = {
  documents: v.array(
    v.object({
      documentId: v.string(),
      reference: v.string(),
      title: v.string(),
    }),
  ),
};
const registerDocumentsResult = v.object({
  documents: v.array(
    v.object({ documentId: v.string(), reference: v.string() }),
  ),
});
// Claims each document's unique reference at expected version 0, then creates the document, so two
// competing registrations race on the reference stream and no document exists without its claim.
export const registerDocuments = defineOperation<
  ObjectType<typeof registerDocumentsInput>,
  Infer<typeof registerDocumentsResult>
>(journal, {
  name: "registerDocuments",
  streams: [referenceStream, documentStream],
  input: registerDocumentsInput,
  returns: registerDocumentsResult,
  plan: ({ documents }) =>
    byDocument(documents).flatMap(({ documentId, reference, title }) => [
      planned(
        referenceStream,
        reference,
        { commandType: "claim", holder: documentId },
        0,
      ),
      planned(documentStream, documentId, { commandType: "create", title }, 0),
    ]),
  combine: (results) => ({
    documents: results
      .filter((result) => result.version.streamType === "reference")
      .map((result) => ({
        documentId: (result.result as ReferenceResult).holder,
        reference: result.version.streamId,
      })),
  }),
  maxStreams,
});
const placeOrdersInput = { ...createDocumentsInput, ...stockLines };
const placeOrdersResult = v.object({
  documents: documentsResult.fields.documents,
  lines: stockResult.fields.lines,
});
// Creates the order documents at expected version 0, then claims the stock lines, so a use case that
// places an order makes one call. The creates come first, so a second submit of the same order is
// answered entityExists even when the first submit took the last units.
export const placeOrders = defineOperation<
  ObjectType<typeof placeOrdersInput>,
  Infer<typeof placeOrdersResult>
>(journal, {
  name: "placeOrders",
  streams: [documentStream, stockStream],
  input: placeOrdersInput,
  returns: placeOrdersResult,
  plan: ({ documents, lines }) => [
    ...createPlans(documents),
    ...stockPlans(lines, "claim"),
  ],
  combine: (results) => ({
    ...combineDocuments(results),
    lines: combineStock(results),
  }),
  // An order's document and a stream for each of up to maxStreams products.
  maxStreams: maxStreams + 1,
});

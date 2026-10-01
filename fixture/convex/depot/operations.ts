// The depot's sanctioned operations. Each takes a list, so a parent use case makes one call.
import { v, type Infer, type ObjectType } from "convex/values";
import {
  defineOperation,
  planned,
  type StreamResult,
} from "../../../src/context/index.js";
import type {
  DocumentResult,
  ReferenceResult,
  StockResult,
} from "../../domain/index.js";
import {
  documentStatusValidator,
  documentStream,
  journal,
  referenceStream,
  stockStream,
  type DepotDocumentCommand,
} from "./streams.js";
const maxStreams = 100;
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
        documents.map(({ documentId, expectedVersion }) =>
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
// A create names expected version 0, so a second create of the same ID is answered entityExists.
export const createDocuments = defineOperation<
  ObjectType<typeof createDocumentsInput>,
  DocumentsResult
>(journal, {
  name: "createDocuments",
  streams: [documentStream],
  input: createDocumentsInput,
  returns: documentsResult,
  plan: ({ documents }) =>
    documents.map(({ documentId, title }) =>
      planned(documentStream, documentId, { commandType: "create", title }, 0),
    ),
  combine: combineDocuments,
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
    documents.map(({ documentId, title, expectedVersion }) =>
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
// Lines on one product become one command on its stream, in the order products first appear.
function byProduct(lines: readonly { productId: string; quantity: number }[]) {
  const totals = new Map<string, number>();
  for (const { productId, quantity } of lines)
    totals.set(productId, (totals.get(productId) ?? 0) + quantity);
  return [...totals];
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
    plan: ({ lines }) =>
      byProduct(lines).map(([productId, quantity]) =>
        planned(stockStream, productId, { commandType, quantity }),
      ),
    combine: (results) => ({
      lines: results.map((result) => ({
        productId: result.version.streamId,
        quantity: (result.result as StockResult).quantity,
      })),
    }),
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
    documents.flatMap(({ documentId, reference, title }) => [
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

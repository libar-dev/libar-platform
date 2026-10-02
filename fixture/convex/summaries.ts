// The fixture composition's document summary: a summary row per depot document, written by
// CreateSummarizedDocument and CreateTwiceSummarizedDocument at the pipeline's step 9 from the
// document's DTO.
import { v, type Infer } from "convex/values";
import type { StreamVersion } from "../../src/kernel/index.js";
import {
  defaultRowBudgetBytes,
  type ReadModel,
} from "../../src/read-model/index.js";
export const documentSummaryStatus = v.union(
  v.literal("none"),
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("shipped"),
);
// The projected fields, which the table and the list's view both spread.
export const documentSummaryFields = {
  documentId: v.string(),
  status: documentSummaryStatus,
  title: v.string(),
};
type DocumentSummaryFields = {
  [Field in keyof typeof documentSummaryFields]: Infer<
    (typeof documentSummaryFields)[Field]
  >;
};
// What the depot returns for a document, as its document stream's dto validator declares it.
type DocumentDto = DocumentSummaryFields & {
  amendments: number;
  version: StreamVersion;
};
export const documentSummary: ReadModel<DocumentDto, DocumentSummaryFields> = {
  name: "documentSummary",
  table: "documentSummaries",
  rowBudgetBytes: defaultRowBudgetBytes,
  projection: {
    version: 1,
    keyOf: (_tenantId, document) => document.documentId,
    project: (_tenantId, { documentId, status, title }) => ({
      documentId,
      status,
      title,
    }),
  },
};

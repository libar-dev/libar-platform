// The fixture composition's second read model: a title row per depot document. Only
// CreateTwiceSummarizedDocument binds it, after the document summary, and its projection throws for
// the fault title, so a failure after step 9 has written the summary row runs on the fixture
// composition and no other command meets the fault.
import { v, type Infer } from "convex/values";
import {
  defaultRowBudgetBytes,
  type ReadModel,
} from "../../src/read-model/index.js";
import { deletedTitle } from "./depot/streams.js";
// A document created under this title makes the title projection throw.
export const projectionFaultTitle = "fault: in the documentTitle projection";
// The projected fields, which the table spreads.
export const documentTitleFields = {
  documentId: v.string(),
  title: v.string(),
};
type DocumentTitleFields = {
  [Field in keyof typeof documentTitleFields]: Infer<
    (typeof documentTitleFields)[Field]
  >;
};
// The part of the depot's document DTO the projection reads.
type DocumentDto = DocumentTitleFields;
export const documentTitle: ReadModel<DocumentDto, DocumentTitleFields> = {
  name: "documentTitle",
  table: "documentTitles",
  rowBudgetBytes: defaultRowBudgetBytes,
  projections: [
    {
      version: 2,
      keyOf: (_tenantId, document) => document.documentId,
      project: (_tenantId, { documentId, title }) => {
        if (title === projectionFaultTitle)
          throw new Error(
            `Fault injected: ${projectionFaultTitle}, projecting document ${documentId}`,
          );
        if (title === deletedTitle) return null;
        return { documentId, title };
      },
    },
    {
      version: 1,
      keyOf: (_tenantId, document) => document.documentId,
      project: (_tenantId, { documentId, title }) => {
        if (title === projectionFaultTitle)
          throw new Error(
            `Fault injected: ${projectionFaultTitle}, projecting document ${documentId}`,
          );
        return { documentId, title };
      },
    },
  ],
};

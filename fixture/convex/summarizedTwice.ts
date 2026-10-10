// CreateTwiceSummarizedDocument: CreateDocument with two read models, the document summary and then
// the document title, whose projection throws for its fault title. Step 9 writes the summary row
// before it reaches the title, so the fault shows that step 9's writes roll back with the command.
import { v, type Infer } from "convex/values";
import {
  internalCommand,
  publicCommand,
  type CommandDeclaration,
} from "../../src/command/index.js";
import { components } from "./_generated/api.js";
import { permissions } from "./depotCommands.js";
import { documentTitle } from "./documentTitles.js";
import { documentSummary } from "./summaries.js";
export const documentSource = { contextId: "depot", streamType: "document" };
const createInput = v.object({ documentId: v.string(), title: v.string() });
const createResult = v.object({ documentId: v.string() });
export const createTwiceSummarizedDocumentDeclaration: CommandDeclaration<
  Infer<typeof createInput>,
  Infer<typeof createResult>
> = {
  name: "CreateTwiceSummarizedDocument",
  contractVersion: 1,
  input: createInput,
  output: createResult,
  permission: {
    permission: permissions.documents,
    subjectFrom: ({ documentId }) => ({
      ...documentSource,
      streamId: documentId,
    }),
  },
  writes: [documentSource],
  readModels: [
    { readModel: documentSummary, source: documentSource },
    { readModel: documentTitle, source: documentSource },
  ],
  rejections: ["titleRequired"],
  executor: async (ctx, { tenantId, actor, operation, input }) => {
    const created = await ctx.runMutation(
      components.depot.operations.createDocuments,
      { tenantId, actor, operation, input: { documents: [input] } },
    );
    // The depot records no business failure for a create.
    if (created.kind !== "applied")
      throw new Error(`The depot answered ${created.kind} for a create`);
    return {
      kind: "applied",
      result: { documentId: input.documentId },
      versions: created.versions,
      streams: created.streams,
    };
  },
};
export const createTwiceSummarizedDocument = publicCommand(
  createTwiceSummarizedDocumentDeclaration,
);
export const createTwiceSummarizedDocumentInternal = internalCommand(
  createTwiceSummarizedDocumentDeclaration,
);

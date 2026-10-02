// FileDocument, the fixture's use case over two contexts: it creates a document in the depot and then
// files a copy of it in the yard, in one mutation with one receipt and one outcome. The depot comes
// first because it creates the document, and the yard's copy names the depot version the depot's
// call returned. A rejection or a throw in the yard rolls back the depot's call with the whole
// mutation, so the executor catches nothing.
import { v, type Infer } from "convex/values";
import {
  internalCommand,
  publicCommand,
  type CommandDeclaration,
} from "../../src/command/index.js";
import { components } from "./_generated/api.js";
import { permissions } from "./depotCommands.js";
const fileDocumentInput = v.object({
  documentId: v.string(),
  title: v.string(),
});
const fileDocumentResult = v.object({
  documentId: v.string(),
  depotVersion: v.number(),
});
const fileDocumentDeclaration: CommandDeclaration<
  Infer<typeof fileDocumentInput>,
  Infer<typeof fileDocumentResult>
> = {
  name: "FileDocument",
  contractVersion: 1,
  input: fileDocumentInput,
  output: fileDocumentResult,
  permission: {
    permission: permissions.documents,
    subjectFrom: ({ documentId }) => ({
      contextId: "depot",
      streamType: "document",
      streamId: documentId,
    }),
  },
  writes: [
    { contextId: "depot", streamType: "document" },
    { contextId: "yard", streamType: "copy" },
  ],
  rejections: ["titleRequired"],
  executor: async (ctx, { tenantId, actor, operation, input }) => {
    const { documentId, title } = input;
    const created = await ctx.runMutation(
      components.depot.operations.createDocuments,
      { tenantId, actor, operation, input: { documents: [input] } },
    );
    const document = created.versions.find(
      (version) =>
        version.streamType === "document" && version.streamId === documentId,
    );
    // The depot records no business failure for a create.
    if (created.kind !== "applied" || document === undefined)
      throw new Error(
        `The depot answered ${created.kind} without document ${documentId}`,
      );
    const filed = await ctx.runMutation(components.yard.operations.fileCopies, {
      tenantId,
      actor,
      operation,
      input: {
        copies: [{ documentId, title, depotVersion: document.version }],
      },
    });
    if (filed.kind !== "applied")
      throw new Error(`The yard answered ${filed.kind} for a copy`);
    return {
      kind: "applied",
      result: { documentId, depotVersion: document.version },
      versions: [...created.versions, ...filed.versions],
      streams: [...created.streams, ...filed.streams],
    };
  },
};
export const fileDocument = publicCommand(fileDocumentDeclaration);
export const fileDocumentInternal = internalCommand(fileDocumentDeclaration);

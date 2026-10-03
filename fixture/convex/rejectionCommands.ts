// Commands whose rejections are invalid on purpose, so a test sees the boundary turn each into a
// technical failure. Each writes a document first, so the test also sees that write roll back.
import { ConvexError, v } from "convex/values";
import {
  internalCommand,
  publicCommand,
  type CommandDeclaration,
} from "../../src/command/index.js";
import { components } from "./_generated/api.js";
import { listDetailsTitle } from "./depot/streams.js";
const { operations } = components.depot;
const writesDocument = [{ contextId: "depot", streamType: "document" }];
// Its executor throws a rejection in the wire shape that is invalid twice over: its code is one the
// declaration does not list, and it names another entry.
const createRejectedDocumentDeclaration: CommandDeclaration<
  { documentId: string },
  null
> = {
  name: "CreateRejectedDocument",
  contractVersion: 1,
  input: v.object({ documentId: v.string() }),
  output: v.null(),
  permission: { permission: "depot.documents" },
  writes: writesDocument,
  rejections: [],
  executor: async (ctx, { tenantId, actor, operation, input }) => {
    await ctx.runMutation(operations.createDocuments, {
      tenantId,
      actor,
      operation,
      input: { documents: [{ documentId: input.documentId, title: "Report" }] },
    });
    throw new ConvexError({
      kind: "rejection",
      code: "notDeclared",
      entry: "SomeOtherCommand",
      message: "x",
    });
  },
};
export const createRejectedDocument = publicCommand(
  createRejectedDocumentDeclaration,
);
export const createRejectedDocumentInternal = internalCommand(
  createRejectedDocumentDeclaration,
);
// Its second call to the depot creates a document whose title makes the depot's decider throw a bare
// rejection whose details are a list, the wrong shape, though its code is a platform code.
const createListRejectedDocumentsDeclaration: CommandDeclaration<
  { documentId: string; refusedId: string },
  null
> = {
  name: "CreateListRejectedDocuments",
  contractVersion: 1,
  input: v.object({ documentId: v.string(), refusedId: v.string() }),
  output: v.null(),
  permission: { permission: "depot.documents" },
  writes: writesDocument,
  rejections: [],
  executor: async (ctx, { tenantId, actor, operation, input }) => {
    const call = (documentId: string, title: string) =>
      ctx.runMutation(operations.createDocuments, {
        tenantId,
        actor,
        operation,
        input: { documents: [{ documentId, title }] },
      });
    await call(input.documentId, "Report");
    await call(input.refusedId, listDetailsTitle);
    throw new Error("The depot created a document it must refuse");
  },
};
export const createListRejectedDocuments = publicCommand(
  createListRejectedDocumentsDeclaration,
);
export const createListRejectedDocumentsInternal = internalCommand(
  createListRejectedDocumentsDeclaration,
);

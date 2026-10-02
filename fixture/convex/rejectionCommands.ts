// A command that writes a document, then throws a rejection in the wire shape.
import { ConvexError, v } from "convex/values";
import {
  publicCommand,
  type CommandDeclaration,
} from "../../src/command/index.js";
import { components } from "./_generated/api.js";
const declaration: CommandDeclaration<{ documentId: string }, null> = {
  name: "CreateRejectedDocument",
  contractVersion: 1,
  input: v.object({ documentId: v.string() }),
  output: v.null(),
  permission: { permission: "depot.documents" },
  writes: [{ contextId: "depot", streamType: "document" }],
  rejections: [],
  executor: async (ctx, { tenantId, actor, operation, input }) => {
    await ctx.runMutation(components.depot.operations.createDocuments, {
      tenantId,
      actor,
      operation,
      input: { documents: [{ documentId: input.documentId, title: "Report" }] },
    });
    throw new ConvexError({
      kind: "rejection",
      code: "notDeclared",
      commandType: "SomeOtherCommand",
      message: "x",
    });
  },
};
export const createRejectedDocument = publicCommand(declaration);

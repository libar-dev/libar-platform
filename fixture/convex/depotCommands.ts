// The fixture composition's commands over the depot context. Each is one declaration and the two static
// exports the command library builds from it; each makes one call to a depot operation.
import { v, type Infer } from "convex/values";
import {
  internalCommand,
  publicCommand,
  type CommandDeclaration,
  type ExecutorResult,
  type MutationCtx,
} from "../../src/command/index.js";
import type { StreamDto } from "../../src/context/index.js";
import type { StreamVersion } from "../../src/kernel/index.js";
import { components } from "./_generated/api.js";
import { failBeforeReceiptIfSwitched, switchedAdmission } from "./switches.js";
const { operations } = components.depot;
// The permissions a grant names. Document commands also name the document as the grant's subject.
export const permissions = {
  documents: "depot.documents",
  stock: "depot.stock",
} as const;
const documentSubject = ({ documentId }: { documentId: string }) => ({
  contextId: "depot",
  streamType: "document",
  streamId: documentId,
});
type ContextOutcome<O> = {
  kind: "applied" | "businessFailure";
  result: O;
  versions: StreamVersion[];
  streams: StreamDto[];
};
// What every executor does once its one context call returned.
async function settle<O, R>(
  ctx: MutationCtx,
  tenantId: string,
  commandType: string,
  outcome: ContextOutcome<O>,
  result: (depotResult: O) => R,
): Promise<ExecutorResult<R>> {
  await failBeforeReceiptIfSwitched(ctx, tenantId, commandType);
  return {
    kind: outcome.kind,
    result: result(outcome.result),
    versions: outcome.versions,
    streams: outcome.streams,
  };
}
const documentStatus = v.union(
  v.literal("none"),
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("shipped"),
);
const documentResult = v.object({
  documentId: v.string(),
  status: documentStatus,
});
type DocumentResult = Infer<typeof documentResult>;
function onlyDocument(result: { documents: DocumentResult[] }): DocumentResult {
  const [document] = result.documents;
  if (document === undefined || result.documents.length !== 1)
    throw new Error(
      `The depot answered ${result.documents.length} documents for one`,
    );
  return document;
}
const maxTitle = 200;
const titleRefinement = ({ title }: { title: string }) =>
  title.length > maxTitle
    ? {
        message: `A title has at most ${maxTitle} characters`,
        details: { path: "title", max: maxTitle, length: title.length },
      }
    : null;
const createDocumentInput = v.object({
  documentId: v.string(),
  title: v.string(),
});
// The documentId is the client-generated entity ID, created at expected version 0.
const createDocumentDeclaration: CommandDeclaration<
  Infer<typeof createDocumentInput>,
  DocumentResult
> = {
  name: "CreateDocument",
  contractVersion: 1,
  input: createDocumentInput,
  refine: titleRefinement,
  output: documentResult,
  permission: {
    permission: permissions.documents,
    subjectFrom: documentSubject,
  },
  rejections: ["titleRequired"],
  admission: switchedAdmission("CreateDocument"),
  bounds: { maxBytes: 4096 },
  executor: async (ctx, { tenantId, actor, operation, input }) =>
    settle(
      ctx,
      tenantId,
      "CreateDocument",
      await ctx.runMutation(operations.createDocuments, {
        tenantId,
        actor,
        operation,
        input: { documents: [input] },
      }),
      onlyDocument,
    ),
};
export const createDocument = publicCommand(createDocumentDeclaration);
export const createDocumentInternal = internalCommand(
  createDocumentDeclaration,
);
const documentStepInput = v.object({
  documentId: v.string(),
  expectedVersion: v.optional(v.number()),
});
type DocumentStepInput = Infer<typeof documentStepInput>;
type DocumentStep =
  | typeof operations.submitDocuments
  | typeof operations.shipDocuments
  | typeof operations.failIfDecided;
// A command that moves one document a step, at the version the caller reviewed when it names one.
function documentStep(
  name: string,
  operation: DocumentStep,
  rejections: readonly string[],
): CommandDeclaration<DocumentStepInput, DocumentResult> {
  return {
    name,
    contractVersion: 1,
    input: documentStepInput,
    output: documentResult,
    permission: {
      permission: permissions.documents,
      subjectFrom: documentSubject,
    },
    rejections,
    admission: switchedAdmission(name),
    executor: async (ctx, call) =>
      settle(
        ctx,
        call.tenantId,
        name,
        await ctx.runMutation(operation, {
          tenantId: call.tenantId,
          actor: call.actor,
          operation: call.operation,
          input: { documents: [call.input] },
        }),
        onlyDocument,
      ),
  };
}
const submitDocumentDeclaration = documentStep(
  "SubmitDocument",
  operations.submitDocuments,
  ["invalidTransition"],
);
export const submitDocument = publicCommand(submitDocumentDeclaration);
export const submitDocumentInternal = internalCommand(
  submitDocumentDeclaration,
);
const shipDocumentDeclaration = documentStep(
  "ShipDocument",
  operations.shipDocuments,
  ["invalidTransition"],
);
export const shipDocument = publicCommand(shipDocumentDeclaration);
export const shipDocumentInternal = internalCommand(shipDocumentDeclaration);
// Its decide throws a plain error if it is reached, so a rejection shows that decide did not run.
const failIfDecidedDeclaration = documentStep(
  "FailIfDecided",
  operations.failIfDecided,
  [],
);
export const failIfDecided = publicCommand(failIfDecidedDeclaration);
export const failIfDecidedInternal = internalCommand(failIfDecidedDeclaration);
const amendDocumentInput = v.object({
  documentId: v.string(),
  title: v.string(),
  expectedVersion: v.optional(v.number()),
});
// The depot's fault titles reach the depot through this command's title.
const amendDocumentDeclaration: CommandDeclaration<
  Infer<typeof amendDocumentInput>,
  DocumentResult
> = {
  name: "AmendDocument",
  contractVersion: 1,
  input: amendDocumentInput,
  refine: titleRefinement,
  output: documentResult,
  permission: {
    permission: permissions.documents,
    subjectFrom: documentSubject,
  },
  rejections: ["invalidTransition", "titleRequired"],
  admission: switchedAdmission("AmendDocument"),
  executor: async (ctx, { tenantId, actor, operation, input }) =>
    settle(
      ctx,
      tenantId,
      "AmendDocument",
      await ctx.runMutation(operations.amendDocuments, {
        tenantId,
        actor,
        operation,
        input: { documents: [input] },
      }),
      onlyDocument,
    ),
};
export const amendDocument = publicCommand(amendDocumentDeclaration);
export const amendDocumentInternal = internalCommand(amendDocumentDeclaration);
const registerDocumentInput = v.object({
  documentId: v.string(),
  reference: v.string(),
  title: v.string(),
});
const registerDocumentResult = v.object({
  documentId: v.string(),
  reference: v.string(),
});
// Claims a unique reference for the document and creates it, both at expected version 0.
const registerDocumentDeclaration: CommandDeclaration<
  Infer<typeof registerDocumentInput>,
  Infer<typeof registerDocumentResult>
> = {
  name: "RegisterDocument",
  contractVersion: 1,
  input: registerDocumentInput,
  refine: titleRefinement,
  output: registerDocumentResult,
  permission: {
    permission: permissions.documents,
    subjectFrom: documentSubject,
  },
  rejections: ["referenceTaken", "holderRequired", "titleRequired"],
  admission: switchedAdmission("RegisterDocument"),
  executor: async (ctx, { tenantId, actor, operation, input }) =>
    settle(
      ctx,
      tenantId,
      "RegisterDocument",
      await ctx.runMutation(operations.registerDocuments, {
        tenantId,
        actor,
        operation,
        input: { documents: [input] },
      }),
      ({ documents }) => {
        const [document] = documents;
        if (document === undefined)
          throw new Error("The depot answered no registered document");
        return document;
      },
    ),
};
export const registerDocument = publicCommand(registerDocumentDeclaration);
export const registerDocumentInternal = internalCommand(
  registerDocumentDeclaration,
);
const stockLines = v.object({
  lines: v.array(v.object({ productId: v.string(), quantity: v.number() })),
});
type StockLines = Infer<typeof stockLines>;
function stockCommand(
  name: string,
  operation: typeof operations.addStock | typeof operations.claimStock,
  rejections: readonly string[],
): CommandDeclaration<StockLines, StockLines> {
  return {
    name,
    contractVersion: 1,
    input: stockLines,
    output: stockLines,
    permission: { permission: permissions.stock },
    rejections,
    admission: switchedAdmission(name),
    bounds: { maxItems: 100 },
    executor: async (ctx, call) =>
      settle(
        ctx,
        call.tenantId,
        name,
        await ctx.runMutation(operation, {
          tenantId: call.tenantId,
          actor: call.actor,
          operation: call.operation,
          input: call.input,
        }),
        (result) => result,
      ),
  };
}
const addStockDeclaration = stockCommand("AddStock", operations.addStock, [
  "invalidQuantity",
]);
export const addStock = publicCommand(addStockDeclaration);
export const addStockInternal = internalCommand(addStockDeclaration);
const claimStockDeclaration = stockCommand(
  "ClaimStock",
  operations.claimStock,
  ["insufficientStock", "invalidQuantity"],
);
export const claimStock = publicCommand(claimStockDeclaration);
export const claimStockInternal = internalCommand(claimStockDeclaration);

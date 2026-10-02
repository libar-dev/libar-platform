// The yard's one sanctioned operation. It takes a list, so a parent use case makes one call.
import { v, type Infer, type ObjectType } from "convex/values";
import { defineOperation, planned } from "../../../src/context/index.js";
import type { CopyResult } from "../../domain/copy.js";
import { copyStream, journal } from "./streams.js";
const maxStreams = 100;
const fileCopiesInput = {
  copies: v.array(
    v.object({
      documentId: v.string(),
      title: v.string(),
      depotVersion: v.number(),
    }),
  ),
};
const fileCopiesResult = v.object({
  copies: v.array(
    v.object({ documentId: v.string(), depotVersion: v.number() }),
  ),
});
// Files each copy under its document's ID at expected version 0, so a copy is filed once.
export const fileCopies = defineOperation<
  ObjectType<typeof fileCopiesInput>,
  Infer<typeof fileCopiesResult>
>(journal, {
  name: "fileCopies",
  streams: [copyStream],
  input: fileCopiesInput,
  returns: fileCopiesResult,
  plan: ({ copies }) =>
    copies.map(({ documentId, title, depotVersion }) =>
      planned(
        copyStream,
        documentId,
        { commandType: "file", title, depotVersion },
        0,
      ),
    ),
  combine: (results) => ({
    copies: results.map((result) => ({
      documentId: result.version.streamId,
      depotVersion: (result.result as CopyResult).depotVersion,
    })),
  }),
  maxStreams,
});

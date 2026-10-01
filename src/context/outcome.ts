// The validators of the kernel's outcome model (spec:kernel.outcome-model), which the kernel may not
// hold because it imports nothing from Convex at run time, and the operation outcome's validator of
// spec:context.persistence-adapter.
import { v, type Validator } from "convex/values";
import { eventEnvelopeValidator } from "./envelope.js";
export const affectedRefValidator = v.object({
  contextId: v.string(),
  streamType: v.string(),
  streamId: v.string(),
});
export const streamVersionValidator = v.object({
  tenantId: v.string(),
  contextId: v.string(),
  streamType: v.string(),
  streamId: v.string(),
  version: v.number(),
});
export const rejectionValidator = v.object({
  code: v.string(),
  message: v.string(),
  details: v.optional(v.record(v.string(), v.any())),
});
export const committedOutcomeValidator = v.object({
  kind: v.union(v.literal("applied"), v.literal("businessFailure")),
  result: v.any(),
  versions: v.array(streamVersionValidator),
});
export const operationOutcomeValidator = (
  result: Validator<unknown, "required", string>,
) =>
  v.object({
    kind: v.union(v.literal("applied"), v.literal("businessFailure")),
    result,
    versions: v.array(streamVersionValidator),
    streams: v.array(
      v.object({
        dto: v.any(),
        version: streamVersionValidator,
        appended: v.number(),
        created: v.boolean(),
        events: v.array(eventEnvelopeValidator),
      }),
    ),
  });

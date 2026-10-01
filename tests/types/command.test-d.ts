import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { Infer } from "convex/values";
import { expectTypeOf, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import {
  authorityValidator,
  commandResponseValidator,
  errorDataValidator,
  subjectRefValidator,
  tenantScopeValidator,
  type Actor,
  type Authority,
  type CallerNamespace,
  type CommandResponse,
  type RejectionData,
  type SubjectRef,
  type TenantScope,
  type TransientData,
} from "../../src/command/index.js";
import type { CausedBy } from "../../src/context/index.js";
test("compiled: each validator infers exactly its pinned type", () => {
  expectTypeOf<
    Infer<typeof tenantScopeValidator>
  >().toEqualTypeOf<TenantScope>();
  expectTypeOf<Infer<typeof authorityValidator>>().toEqualTypeOf<Authority>();
  expectTypeOf<Infer<typeof subjectRefValidator>>().toEqualTypeOf<SubjectRef>();
  // details is Record<string, any> at the validator and Record<string, Value> at the type.
  expectTypeOf<Infer<typeof errorDataValidator>>().toExtend<
    RejectionData | TransientData
  >();
  expectTypeOf<RejectionData | TransientData>().toExtend<
    Infer<typeof errorDataValidator>
  >();
  type Response = Infer<
    ReturnType<typeof commandResponseValidator<{ id: string }>>
  >;
  // The validator's two members are the type's intersection, distributed.
  expectTypeOf<Response>().toExtend<CommandResponse<{ id: string }>>();
  expectTypeOf<CommandResponse<{ id: string }>>().toExtend<Response>();
});
test("compiled: the two entries of a command carry the pinned argument and return types", () => {
  type Result = {
    documentId: string;
    status: "none" | "draft" | "submitted" | "shipped";
  };
  type Input = { documentId: string; title: string };
  expectTypeOf<
    FunctionArgs<typeof api.depotCommands.createDocument>
  >().toEqualTypeOf<{
    tenantId: string;
    requestKey?: string;
    correlationId?: string;
    input: Input;
  }>();
  expectTypeOf<
    FunctionArgs<typeof internal.depotCommands.createDocumentInternal>
  >().toEqualTypeOf<{
    tenantId: string;
    namespace: CallerNamespace;
    actor: Actor;
    requestKey: string;
    correlationId?: string;
    causedBy?: CausedBy;
    input: Input;
  }>();
  expectTypeOf<
    FunctionReturnType<typeof api.depotCommands.createDocument>
  >().toEqualTypeOf<CommandResponse<Result>>();
});

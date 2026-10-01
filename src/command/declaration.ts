// The command declaration of spec:command.command-declaration and its two composition helpers, which
// turn one declaration into the pipeline's public and internal entries.
import {
  internalMutationGeneric,
  mutationGeneric,
  type MutationBuilder,
  type RegisteredMutation,
} from "convex/server";
import { v, type Validator } from "convex/values";
import { causedByValidator, type CausedBy } from "../context/envelope.js";
import type { OperationRef } from "../context/envelope.js";
import type { StreamDto } from "../context/adapter.js";
import type { CommittedOutcome, Rejection } from "../kernel/index.js";
import {
  actorValidator,
  callerNamespaceValidator,
  type Actor,
  type CallerNamespace,
  type SubjectRef,
} from "./actor-and-scope.js";
import { establishActor } from "./authority.js";
import { normalizeThrown, reject } from "./outcome-boundary.js";
import {
  commandResponseValidator,
  runPipeline,
  type CommandResponse,
  type PipelineCall,
} from "./pipeline.js";
import type { Retention } from "./receipts.js";
import type { CommandDataModel, MutationCtx } from "./tables.js";
// Read models, writes, audit and irreversible are later slices' fields: nothing in this slice reads them.
export type CommandDeclaration<I, R> = {
  name: string;
  contractVersion: number;
  // Field paths are string, not the default never, so that object validators fit.
  input: Validator<I, "required", string>;
  refine?: (input: I) => Omit<Rejection, "code"> | null;
  output: Validator<R, "required", string>;
  permission: PermissionPolicy<I>;
  executor: Executor<I, R>;
  rejections: readonly string[];
  admission?: AdmissionPolicy<I>;
  bounds?: Bounds;
  retention?: Retention;
};
export type PermissionPolicy<I> = {
  permission: string;
  subjectFrom?: (input: I) => SubjectRef;
};
export type Executor<I, R> = (
  ctx: MutationCtx,
  call: { tenantId: string; actor: Actor; operation: OperationRef; input: I },
) => Promise<ExecutorResult<R>>;
// streams concatenates the streams of every context call the executor made.
export type ExecutorResult<R> = CommittedOutcome<R> & { streams: StreamDto[] };
export type AdmissionPolicy<I> = (
  ctx: MutationCtx,
  call: PipelineCall<I>,
) => Promise<
  | { admitted: true }
  | {
      admitted: false;
      code: "rateLimited" | "capacity";
      retryAfterMs?: number;
    }
>;
// maxItems counts the elements of the input's top-level arrays; maxBytes is the input's Convex size.
export type Bounds = { maxItems?: number; maxBytes?: number };
export type PublicCommandArgs<I> = {
  tenantId: string;
  requestKey?: string;
  correlationId?: string;
  input: I;
};
export type InternalCommandArgs<I> = {
  tenantId: string;
  namespace: CallerNamespace;
  actor: Actor;
  requestKey: string;
  correlationId?: string;
  causedBy?: CausedBy;
  input: I;
};
// The builders the app's generated server exports are these, typed with the app's data model. The
// library types them with the tables it owns, which the app's schema holds.
const mutation: MutationBuilder<CommandDataModel, "public"> = mutationGeneric;
const internalMutation: MutationBuilder<CommandDataModel, "internal"> =
  internalMutationGeneric;
const noServiceIssuers: ReadonlySet<string> = new Set();
// The public entry: the one place ctx.auth is read, and the namespace is public in code.
export function publicCommand<I, R>(
  decl: CommandDeclaration<I, R>,
  serviceIssuers: ReadonlySet<string> = noServiceIssuers,
): RegisteredMutation<"public", PublicCommandArgs<I>, CommandResponse<R>> {
  return mutation({
    args: {
      tenantId: v.string(),
      requestKey: v.optional(v.string()),
      correlationId: v.optional(v.string()),
      input: decl.input,
    },
    returns: commandResponseValidator(decl.output),
    handler: async (ctx, args) => {
      const { tenantId, requestKey, correlationId, input } =
        args as PublicCommandArgs<I>;
      try {
        // Step 2, authenticate.
        const actor = await establishActor(ctx, serviceIssuers);
        if (actor === null)
          reject({
            code: "unauthenticated",
            commandType: decl.name,
            message: `${decl.name} needs an authenticated caller`,
          });
        return await runPipeline(ctx, decl, {
          tenantId,
          namespace: "public",
          actor,
          input,
          ...(requestKey === undefined ? {} : { requestKey }),
          ...(correlationId === undefined ? {} : { correlationId }),
        });
      } catch (error) {
        normalizeThrown(error, decl.name);
      }
    },
  }) as RegisteredMutation<"public", PublicCommandArgs<I>, CommandResponse<R>>;
}
// The internal entry: its trusted server caller states the actor and the namespace, and a request key.
export function internalCommand<I, R>(
  decl: CommandDeclaration<I, R>,
): RegisteredMutation<"internal", InternalCommandArgs<I>, CommandResponse<R>> {
  return internalMutation({
    args: {
      tenantId: v.string(),
      namespace: callerNamespaceValidator,
      actor: actorValidator,
      requestKey: v.string(),
      correlationId: v.optional(v.string()),
      causedBy: v.optional(causedByValidator),
      input: decl.input,
    },
    returns: commandResponseValidator(decl.output),
    handler: async (ctx, args) => {
      const call = args as InternalCommandArgs<I>;
      try {
        return await runPipeline(ctx, decl, call);
      } catch (error) {
        normalizeThrown(error, decl.name);
      }
    },
  }) as RegisteredMutation<
    "internal",
    InternalCommandArgs<I>,
    CommandResponse<R>
  >;
}

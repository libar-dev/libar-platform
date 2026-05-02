/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      appendToStream: FunctionReference<
        "mutation",
        "internal",
        {
          boundedContext: string;
          events: Array<{
            category?: "domain" | "integration" | "trigger" | "fat";
            eventId: string;
            eventType: string;
            idempotencyKey?: string;
            metadata?: {
              causationId?: string;
              correlationId: string;
              schemaVersion?: number;
              userId?: string;
            };
            payload: any;
            schemaVersion?: number;
            scopeKey?: string;
          }>;
          expectedVersion: number;
          streamId: string;
          streamType: string;
          tenantId?: string;
          verificationProof: {
            boundedContext: string;
            expiresAt: number;
            issuedAt: number;
            issuer: string;
            nonce: string;
            signature: string;
            subjectId: string;
            subjectType: "reviewer" | "agent" | "boundedContext" | "system";
            tenantId?: string;
          };
        },
        | {
            eventIds: Array<string>;
            globalPositions: Array<number | bigint>;
            newVersion: number;
            status: "success";
          }
        | {
            eventIds: Array<string>;
            globalPositions: Array<number | bigint>;
            newVersion: number;
            status: "duplicate";
          }
        | { currentVersion: number; status: "conflict" }
        | {
            auditId: string;
            currentVersion: number;
            existingEventId: string;
            status: "idempotency_conflict";
          },
        Name
      >;
      checkScopeVersion: FunctionReference<
        "query",
        "internal",
        { expectedVersion: number; scopeKey: string },
        | { status: "match" }
        | { currentVersion: number; status: "mismatch" }
        | { status: "not_found" },
        Name
      >;
      commitScope: FunctionReference<
        "mutation",
        "internal",
        {
          boundedContext: string;
          expectedVersion: number;
          scopeKey: string;
          streamIds?: Array<string>;
          verificationProof: {
            boundedContext: string;
            expiresAt: number;
            issuedAt: number;
            issuer: string;
            nonce: string;
            signature: string;
            subjectId: string;
            subjectType: "reviewer" | "agent" | "boundedContext" | "system";
            tenantId?: string;
          };
        },
        | { newVersion: number; status: "success" }
        | { currentVersion: number; status: "conflict" },
        Name
      >;
      getByCorrelation: FunctionReference<
        "query",
        "internal",
        { correlationId: string; cursor?: number | bigint; limit?: number },
        {
          events: Array<{
            boundedContext: string;
            category: "domain" | "integration" | "trigger" | "fat";
            causationId?: string;
            correlationId: string;
            eventId: string;
            eventType: string;
            globalPosition: number | bigint;
            schemaVersion: number;
            scopeKey?: string;
            streamId: string;
            streamType: string;
            tenantId?: string;
            timestamp: number;
            version: number;
          }>;
          hasMore: boolean;
          nextCursor: number | bigint | null;
        },
        Name
      >;
      getByIdempotencyKey: FunctionReference<
        "query",
        "internal",
        { idempotencyKey: string },
        {
          boundedContext: string;
          category: "domain" | "integration" | "trigger" | "fat";
          causationId?: string;
          correlationId: string;
          eventId: string;
          eventType: string;
          globalPosition: number | bigint;
          idempotencyKey?: string;
          metadata?: any;
          payload: any;
          schemaVersion: number;
          scopeKey?: string;
          streamId: string;
          streamType: string;
          tenantId?: string;
          timestamp: number;
          version: number;
        } | null,
        Name
      >;
      getGlobalPosition: FunctionReference<
        "query",
        "internal",
        {},
        number | bigint,
        Name
      >;
      getIdempotencyConflictAudits: FunctionReference<
        "query",
        "internal",
        { idempotencyKey: string },
        Array<{
          attemptedAt: number;
          auditId: string;
          boundedContext: string;
          conflictReason: string;
          existingEventId: string;
          existingEventType: string;
          existingFingerprint: string;
          existingPayload: any;
          idempotencyKey: string;
          incomingEventType: string;
          incomingFingerprint: string;
          incomingPayload: any;
          streamId: string;
          streamType: string;
          tenantId?: string;
        }>,
        Name
      >;
      getOrCreatePMState: FunctionReference<
        "mutation",
        "internal",
        {
          instanceId: string;
          options?: {
            correlationId?: string;
            customState?: any;
            resetIfTerminal?: boolean;
            stateVersion?: number;
            triggerEventId?: string;
          };
          processManagerName: string;
        },
        {
          commandsEmitted: number;
          commandsFailed: number;
          correlationId?: string;
          createdAt: number;
          customState?: any;
          errorMessage?: string;
          instanceId: string;
          isNew: boolean;
          lastGlobalPosition: number | bigint;
          lastUpdatedAt: number;
          processManagerName: string;
          stateVersion: number;
          status: "idle" | "processing" | "completed" | "failed";
          triggerEventId?: string;
        },
        Name
      >;
      getOrCreateScope: FunctionReference<
        "mutation",
        "internal",
        {
          boundedContext: string;
          scopeKey: string;
          verificationProof: {
            boundedContext: string;
            expiresAt: number;
            issuedAt: number;
            issuer: string;
            nonce: string;
            signature: string;
            subjectId: string;
            subjectType: "reviewer" | "agent" | "boundedContext" | "system";
            tenantId?: string;
          };
        },
        {
          boundedContext: string;
          currentVersion: number;
          isNew: boolean;
          scopeId: string;
          scopeKey: string;
          scopeType: string;
          tenantId: string;
        },
        Name
      >;
      getPMState: FunctionReference<
        "query",
        "internal",
        { instanceId: string; processManagerName: string },
        {
          commandsEmitted: number;
          commandsFailed: number;
          correlationId?: string;
          createdAt: number;
          customState?: any;
          errorMessage?: string;
          instanceId: string;
          lastGlobalPosition: number | bigint;
          lastUpdatedAt: number;
          processManagerName: string;
          stateVersion: number;
          status: "idle" | "processing" | "completed" | "failed";
          triggerEventId?: string;
        } | null,
        Name
      >;
      getScope: FunctionReference<
        "query",
        "internal",
        { scopeKey: string },
        {
          boundedContext: string;
          createdAt: number;
          currentVersion: number;
          lastUpdatedAt: number;
          scopeId: string;
          scopeKey: string;
          scopeType: string;
          streamIds?: Array<string>;
          tenantId: string;
        } | null,
        Name
      >;
      getScopeLatestPosition: FunctionReference<
        "query",
        "internal",
        { scopeKey: string },
        number | bigint,
        Name
      >;
      getStreamVersion: FunctionReference<
        "query",
        "internal",
        { streamId: string; streamType: string },
        number,
        Name
      >;
      listPMDeadLetters: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          processManagerName?: string;
          status?: "pending" | "replayed" | "ignored";
        },
        Array<{
          attemptCount: number;
          context?: any;
          error: string;
          eventId?: string;
          failedAt: number;
          failedCommand?: { commandType: string; payload: any };
          instanceId: string;
          processManagerName: string;
          status: "pending" | "replayed" | "ignored";
        }>,
        Name
      >;
      listPMStates: FunctionReference<
        "query",
        "internal",
        {
          correlationId?: string;
          limit?: number;
          processManagerName?: string;
          status?: "idle" | "processing" | "completed" | "failed";
        },
        Array<{
          commandsEmitted: number;
          commandsFailed: number;
          correlationId?: string;
          createdAt: number;
          customState?: any;
          errorMessage?: string;
          instanceId: string;
          lastGlobalPosition: number | bigint;
          lastUpdatedAt: number;
          processManagerName: string;
          stateVersion: number;
          status: "idle" | "processing" | "completed" | "failed";
          triggerEventId?: string;
        }>,
        Name
      >;
      listScopesByTenant: FunctionReference<
        "query",
        "internal",
        { limit?: number; scopeType?: string; tenantId: string },
        Array<{
          boundedContext: string;
          createdAt: number;
          currentVersion: number;
          lastUpdatedAt: number;
          scopeId: string;
          scopeKey: string;
          scopeType: string;
          streamIds?: Array<string>;
          tenantId: string;
        }>,
        Name
      >;
      readFromPosition: FunctionReference<
        "query",
        "internal",
        {
          boundedContext?: string;
          eventTypes?: Array<string>;
          fromPosition?: number | bigint;
          limit?: number;
        },
        {
          events: Array<{
            boundedContext: string;
            category: "domain" | "integration" | "trigger" | "fat";
            causationId?: string;
            correlationId: string;
            eventId: string;
            eventType: string;
            globalPosition: number | bigint;
            metadata?: any;
            payload: any;
            schemaVersion: number;
            scopeKey?: string;
            streamId: string;
            streamType: string;
            tenantId?: string;
            timestamp: number;
            version: number;
          }>;
          hasMore: boolean;
          nextPosition: number | bigint;
        },
        Name
      >;
      readStream: FunctionReference<
        "query",
        "internal",
        {
          fromVersion?: number;
          limit?: number;
          streamId: string;
          streamType: string;
        },
        Array<{
          boundedContext: string;
          category: "domain" | "integration" | "trigger" | "fat";
          causationId?: string;
          correlationId: string;
          eventId: string;
          eventType: string;
          globalPosition: number | bigint;
          metadata?: any;
          payload: any;
          schemaVersion: number;
          scopeKey?: string;
          streamId: string;
          streamType: string;
          tenantId?: string;
          timestamp: number;
          version: number;
        }>,
        Name
      >;
      readVirtualStream: FunctionReference<
        "query",
        "internal",
        {
          fromGlobalPosition?: number | bigint;
          limit?: number;
          scopeKey: string;
        },
        Array<{
          boundedContext: string;
          category: "domain" | "integration" | "trigger" | "fat";
          causationId?: string;
          correlationId: string;
          eventId: string;
          eventType: string;
          globalPosition: number | bigint;
          metadata?: any;
          payload: any;
          schemaVersion: number;
          scopeKey?: string;
          streamId: string;
          streamType: string;
          tenantId?: string;
          timestamp: number;
          version: number;
        }>,
        Name
      >;
      recordPMDeadLetter: FunctionReference<
        "mutation",
        "internal",
        {
          attemptCount: number;
          context?: any;
          error: string;
          eventId?: string;
          failedCommand?: { commandType: string; payload: any };
          instanceId: string;
          processManagerName: string;
        },
        | { deadLetterId: string; status: "recorded" }
        | { deadLetterId: string; status: "already_exists" },
        Name
      >;
      transitionPMState: FunctionReference<
        "mutation",
        "internal",
        {
          event: "START" | "SUCCESS" | "FAIL" | "RETRY" | "RESET";
          instanceId: string;
          options?: {
            commandsEmitted?: number;
            commandsFailed?: number;
            correlationId?: string;
            customState?: any;
            errorMessage?: string;
            lastGlobalPosition?: number | bigint;
            triggerEventId?: string;
          };
          processManagerName: string;
        },
        | {
            event: string;
            fromStatus: "idle" | "processing" | "completed" | "failed";
            status: "transitioned";
            toStatus: "idle" | "processing" | "completed" | "failed";
          }
        | {
            currentStatus: "idle" | "processing" | "completed" | "failed";
            event: string;
            status: "invalid_transition";
            validEvents: Array<string>;
          }
        | { status: "not_found" },
        Name
      >;
      updatePMDeadLetterStatus: FunctionReference<
        "mutation",
        "internal",
        {
          eventId?: string;
          instanceId: string;
          newStatus: "pending" | "replayed" | "ignored";
          processManagerName: string;
        },
        | {
            previousStatus: "pending" | "replayed" | "ignored";
            status: "updated";
          }
        | { status: "not_found" },
        Name
      >;
      updatePMState: FunctionReference<
        "mutation",
        "internal",
        {
          instanceId: string;
          processManagerName: string;
          updates: {
            commandsEmitted?: number;
            commandsFailed?: number;
            correlationId?: string;
            customState?: any;
            errorMessage?: string;
            lastGlobalPosition?: number | bigint;
            stateVersion?: number;
            status?: "idle" | "processing" | "completed" | "failed";
            triggerEventId?: string;
          };
        },
        | {
            instanceId: string;
            lastGlobalPosition: number | bigint;
            newStatus: "idle" | "processing" | "completed" | "failed";
            processManagerName: string;
            status: "updated";
          }
        | { status: "not_found" },
        Name
      >;
    };
  };

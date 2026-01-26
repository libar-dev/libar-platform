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
          }>;
          expectedVersion: number;
          streamId: string;
          streamType: string;
        },
        | {
            eventIds: Array<string>;
            globalPositions: Array<number>;
            newVersion: number;
            status: "success";
          }
        | { currentVersion: number; status: "conflict" },
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
          expectedVersion: number;
          scopeKey: string;
          streamIds?: Array<string>;
        },
        | { newVersion: number; status: "success" }
        | { currentVersion: number; status: "conflict" },
        Name
      >;
      getByCorrelation: FunctionReference<
        "query",
        "internal",
        { correlationId: string },
        Array<{
          boundedContext: string;
          category: "domain" | "integration" | "trigger" | "fat";
          causationId?: string;
          correlationId: string;
          eventId: string;
          eventType: string;
          globalPosition: number;
          metadata?: any;
          payload: any;
          schemaVersion: number;
          streamId: string;
          streamType: string;
          timestamp: number;
          version: number;
        }>,
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
          globalPosition: number;
          idempotencyKey?: string;
          metadata?: any;
          payload: any;
          schemaVersion: number;
          streamId: string;
          streamType: string;
          timestamp: number;
          version: number;
        } | null,
        Name
      >;
      getGlobalPosition: FunctionReference<
        "query",
        "internal",
        {},
        number,
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
          lastGlobalPosition: number;
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
        { scopeKey: string },
        {
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
          lastGlobalPosition: number;
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
        number,
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
          lastGlobalPosition: number;
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
          fromPosition?: number;
          limit?: number;
        },
        Array<{
          boundedContext: string;
          category: "domain" | "integration" | "trigger" | "fat";
          causationId?: string;
          correlationId: string;
          eventId: string;
          eventType: string;
          globalPosition: number;
          metadata?: any;
          payload: any;
          schemaVersion: number;
          streamId: string;
          streamType: string;
          timestamp: number;
          version: number;
        }>,
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
          globalPosition: number;
          metadata?: any;
          payload: any;
          schemaVersion: number;
          streamId: string;
          streamType: string;
          timestamp: number;
          version: number;
        }>,
        Name
      >;
      readVirtualStream: FunctionReference<
        "query",
        "internal",
        { fromGlobalPosition?: number; limit?: number; scopeKey: string },
        Array<{
          boundedContext: string;
          category: "domain" | "integration" | "trigger" | "fat";
          causationId?: string;
          correlationId: string;
          eventId: string;
          eventType: string;
          globalPosition: number;
          metadata?: any;
          payload: any;
          schemaVersion: number;
          streamId: string;
          streamType: string;
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
            lastGlobalPosition?: number;
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
            lastGlobalPosition?: number;
            stateVersion?: number;
            status?: "idle" | "processing" | "completed" | "failed";
            triggerEventId?: string;
          };
        },
        | {
            instanceId: string;
            lastGlobalPosition: number;
            newStatus: "idle" | "processing" | "completed" | "failed";
            processManagerName: string;
            status: "updated";
          }
        | { status: "not_found" },
        Name
      >;
    };
  };

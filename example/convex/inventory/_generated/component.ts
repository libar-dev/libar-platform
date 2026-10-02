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
    operations: {
      allocate: FunctionReference<
        "mutation",
        "internal",
        {
          actor: {
            delegationRef?: string;
            id: string;
            issuer?: string;
            kind: "human" | "service" | "agent" | "reviewer" | "operator";
            onBehalfOf?: {
              id: string;
              kind: "human" | "service" | "agent" | "reviewer" | "operator";
            };
          };
          facts?: Record<string, any>;
          input: {
            lines: Array<{ quantity: number; stockItemId: string }>;
            orderId: string;
          };
          operation: {
            causedBy:
              | { commandType: string; kind: "command" }
              | {
                  contextId: string;
                  eventId: string;
                  kind: "event";
                  tenantId: string;
                }
              | { kind: "migration"; migrationName: string };
            correlationId?: string;
            operationId: string;
          };
          tenantId: string;
        },
        {
          kind: "applied" | "businessFailure";
          result: { lines: Array<{ quantity: number; stockItemId: string }> };
          streams: Array<{
            appended: number;
            created: boolean;
            dto: any;
            events: Array<{
              actor: {
                delegationRef?: string;
                id: string;
                issuer?: string;
                kind: "human" | "service" | "agent" | "reviewer" | "operator";
                onBehalfOf?: {
                  id: string;
                  kind: "human" | "service" | "agent" | "reviewer" | "operator";
                };
              };
              causedBy:
                | { commandType: string; kind: "command" }
                | {
                    contextId: string;
                    eventId: string;
                    kind: "event";
                    tenantId: string;
                  }
                | { kind: "migration"; migrationName: string };
              contextId: string;
              correlationId?: string;
              eventId: string;
              eventSchemaVersion: number;
              eventType: string;
              occurredAt?: number;
              operationId: string;
              payload: any;
              recordedAt: number;
              streamId: string;
              streamType: string;
              streamVersion: number;
              tenantId: string;
            }>;
            version: {
              contextId: string;
              streamId: string;
              streamType: string;
              tenantId: string;
              version: number;
            };
          }>;
          versions: Array<{
            contextId: string;
            streamId: string;
            streamType: string;
            tenantId: string;
            version: number;
          }>;
        },
        Name
      >;
      receive: FunctionReference<
        "mutation",
        "internal",
        {
          actor: {
            delegationRef?: string;
            id: string;
            issuer?: string;
            kind: "human" | "service" | "agent" | "reviewer" | "operator";
            onBehalfOf?: {
              id: string;
              kind: "human" | "service" | "agent" | "reviewer" | "operator";
            };
          };
          facts?: Record<string, any>;
          input: { items: Array<{ quantity: number; stockItemId: string }> };
          operation: {
            causedBy:
              | { commandType: string; kind: "command" }
              | {
                  contextId: string;
                  eventId: string;
                  kind: "event";
                  tenantId: string;
                }
              | { kind: "migration"; migrationName: string };
            correlationId?: string;
            operationId: string;
          };
          tenantId: string;
        },
        {
          kind: "applied" | "businessFailure";
          result: { items: Array<{ quantity: number; stockItemId: string }> };
          streams: Array<{
            appended: number;
            created: boolean;
            dto: any;
            events: Array<{
              actor: {
                delegationRef?: string;
                id: string;
                issuer?: string;
                kind: "human" | "service" | "agent" | "reviewer" | "operator";
                onBehalfOf?: {
                  id: string;
                  kind: "human" | "service" | "agent" | "reviewer" | "operator";
                };
              };
              causedBy:
                | { commandType: string; kind: "command" }
                | {
                    contextId: string;
                    eventId: string;
                    kind: "event";
                    tenantId: string;
                  }
                | { kind: "migration"; migrationName: string };
              contextId: string;
              correlationId?: string;
              eventId: string;
              eventSchemaVersion: number;
              eventType: string;
              occurredAt?: number;
              operationId: string;
              payload: any;
              recordedAt: number;
              streamId: string;
              streamType: string;
              streamVersion: number;
              tenantId: string;
            }>;
            version: {
              contextId: string;
              streamId: string;
              streamType: string;
              tenantId: string;
              version: number;
            };
          }>;
          versions: Array<{
            contextId: string;
            streamId: string;
            streamType: string;
            tenantId: string;
            version: number;
          }>;
        },
        Name
      >;
    };
    queries: {
      stockItem: {
        get: FunctionReference<
          "query",
          "internal",
          { streamId: string; tenantId: string },
          {
            allocated: number;
            onHand: number;
            stockItemId: string;
            version: {
              contextId: string;
              streamId: string;
              streamType: string;
              tenantId: string;
              version: number;
            };
          } | null,
          Name
        >;
        list: FunctionReference<
          "query",
          "internal",
          {
            includeDeleted?: boolean;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
            tenantId: string;
          },
          {
            continueCursor: string;
            isDone: boolean;
            page: Array<{
              allocated: number;
              onHand: number;
              stockItemId: string;
              version: {
                contextId: string;
                streamId: string;
                streamType: string;
                tenantId: string;
                version: number;
              };
            }>;
            pageStatus?: "SplitRecommended" | "SplitRequired" | null;
            splitCursor?: string | null;
          },
          Name
        >;
      };
    };
  };

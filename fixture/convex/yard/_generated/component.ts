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
      fileCopies: FunctionReference<
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
            copies: Array<{
              depotVersion: number;
              documentId: string;
              title: string;
            }>;
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
          result: {
            copies: Array<{ depotVersion: number; documentId: string }>;
          };
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
  };

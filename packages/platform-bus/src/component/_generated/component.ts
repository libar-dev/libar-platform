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
      cleanupExpired: FunctionReference<
        "mutation",
        "internal",
        { batchSize?: number },
        { commands: number; correlations: number },
        Name
      >;
      getByCorrelation: FunctionReference<
        "query",
        "internal",
        { correlationId: string },
        Array<{
          commandId: string;
          commandType: string;
          executedAt?: number;
          result?: any;
          status: "pending" | "executed" | "rejected" | "failed";
          targetContext: string;
          timestamp: number;
        }>,
        Name
      >;
      getCommandStatus: FunctionReference<
        "query",
        "internal",
        { commandId: string },
        null | {
          commandId: string;
          commandType: string;
          executedAt?: number;
          result?: any;
          status: "pending" | "executed" | "rejected" | "failed";
          targetContext: string;
        },
        Name
      >;
      getCorrelationsByContext: FunctionReference<
        "query",
        "internal",
        { afterTimestamp?: number; boundedContext: string; limit?: number },
        Array<{
          boundedContext: string;
          commandId: string;
          commandType: string;
          createdAt: number;
          eventIds: Array<string>;
        }>,
        Name
      >;
      getEventsByCommandId: FunctionReference<
        "query",
        "internal",
        { commandId: string },
        null | {
          boundedContext: string;
          commandId: string;
          commandType: string;
          createdAt: number;
          eventIds: Array<string>;
        },
        Name
      >;
      recordCommand: FunctionReference<
        "mutation",
        "internal",
        {
          commandId: string;
          commandType: string;
          metadata: {
            correlationId: string;
            timestamp: number;
            userId?: string;
          };
          payload: any;
          targetContext: string;
          ttl?: number;
        },
        | { status: "new" }
        | {
            commandStatus: "pending" | "executed" | "rejected" | "failed";
            result?: any;
            status: "duplicate";
          },
        Name
      >;
      recordCommandEventCorrelation: FunctionReference<
        "mutation",
        "internal",
        {
          boundedContext: string;
          commandId: string;
          commandType: string;
          eventIds: Array<string>;
          ttl?: number;
        },
        boolean,
        Name
      >;
      updateCommandResult: FunctionReference<
        "mutation",
        "internal",
        {
          commandId: string;
          result?: any;
          status: "executed" | "rejected" | "failed";
        },
        boolean,
        Name
      >;
    };
  };

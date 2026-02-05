/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_intents from "../admin/intents.js";
import type * as admin_poison from "../admin/poison.js";
import type * as admin_projections from "../admin/projections.js";
import type * as admin_rebuildDemo from "../admin/rebuildDemo.js";
import type * as agent from "../agent.js";
import type * as commands_batch from "../commands/batch.js";
import type * as commands_durableOrchestrator from "../commands/durableOrchestrator.js";
import type * as commands_inventory_configs from "../commands/inventory/configs.js";
import type * as commands_orders_configs from "../commands/orders/configs.js";
import type * as commands_registry from "../commands/registry.js";
import type * as contexts_agent__config from "../contexts/agent/_config.js";
import type * as contexts_agent__llm_config from "../contexts/agent/_llm/config.js";
import type * as contexts_agent__llm_index from "../contexts/agent/_llm/index.js";
import type * as contexts_agent__llm_runtime from "../contexts/agent/_llm/runtime.js";
import type * as contexts_agent__patterns_churnRisk from "../contexts/agent/_patterns/churnRisk.js";
import type * as contexts_agent__utils_confidence from "../contexts/agent/_utils/confidence.js";
import type * as contexts_agent__utils_customer from "../contexts/agent/_utils/customer.js";
import type * as contexts_agent__utils_index from "../contexts/agent/_utils/index.js";
import type * as contexts_agent_handlers_eventHandler from "../contexts/agent/handlers/eventHandler.js";
import type * as contexts_agent_handlers_onComplete from "../contexts/agent/handlers/onComplete.js";
import type * as contexts_agent_index from "../contexts/agent/index.js";
import type * as contexts_agent_tools_approval from "../contexts/agent/tools/approval.js";
import type * as contexts_agent_tools_emitCommand from "../contexts/agent/tools/emitCommand.js";
import type * as crons from "../crons.js";
import type * as crossContextQueries from "../crossContextQueries.js";
import type * as dcb_retryExecution from "../dcb/retryExecution.js";
import type * as eventStore_deadLetters from "../eventStore/deadLetters.js";
import type * as eventStore_durableAppend from "../eventStore/durableAppend.js";
import type * as eventSubscriptions from "../eventSubscriptions.js";
import type * as infrastructure from "../infrastructure.js";
import type * as integration_deadLetters from "../integration/deadLetters.js";
import type * as integration_events from "../integration/events.js";
import type * as integration_handlers from "../integration/handlers.js";
import type * as integration_index from "../integration/index.js";
import type * as integration_routes from "../integration/routes.js";
import type * as inventory from "../inventory.js";
import type * as inventoryInternal from "../inventoryInternal.js";
import type * as orders from "../orders.js";
import type * as processManagers_index from "../processManagers/index.js";
import type * as processManagers_orderNotification from "../processManagers/orderNotification.js";
import type * as processManagers_reservationRelease from "../processManagers/reservationRelease.js";
import type * as projections__helpers from "../projections/_helpers.js";
import type * as projections_crossContext_orderWithInventory from "../projections/crossContext/orderWithInventory.js";
import type * as projections_customers_customerCancellations from "../projections/customers/customerCancellations.js";
import type * as projections_deadLetters from "../projections/deadLetters.js";
import type * as projections_definitions from "../projections/definitions.js";
import type * as projections_evolve_index from "../projections/evolve/index.js";
import type * as projections_inventory_activeReservations from "../projections/inventory/activeReservations.js";
import type * as projections_inventory_productCatalog from "../projections/inventory/productCatalog.js";
import type * as projections_monitoring from "../projections/monitoring.js";
import type * as projections_orders_orderItems from "../projections/orders/orderItems.js";
import type * as projections_orders_orderSummary from "../projections/orders/orderSummary.js";
import type * as queries_agent from "../queries/agent.js";
import type * as queries_correlations from "../queries/correlations.js";
import type * as queries_events from "../queries/events.js";
import type * as rateLimits from "../rateLimits.js";
import type * as sagas from "../sagas.js";
import type * as sagas_admin from "../sagas/admin.js";
import type * as sagas_completion from "../sagas/completion.js";
import type * as sagas_events from "../sagas/events.js";
import type * as sagas_index from "../sagas/index.js";
import type * as sagas_orderFulfillment from "../sagas/orderFulfillment.js";
import type * as sagas_payments_actions from "../sagas/payments/actions.js";
import type * as sagas_payments_outbox from "../sagas/payments/outbox.js";
import type * as sagas_registry from "../sagas/registry.js";
import type * as sagas_router from "../sagas/router.js";
import type * as testing from "../testing.js";
import type * as testing_dcbRetryTest from "../testing/dcbRetryTest.js";
import type * as testing_durablePublicationTest from "../testing/durablePublicationTest.js";
import type * as testing_eventReplayTest from "../testing/eventReplayTest.js";
import type * as testing_idempotentAppendTest from "../testing/idempotentAppendTest.js";
import type * as testing_integrationPatternsTest from "../testing/integrationPatternsTest.js";
import type * as testing_intentTest from "../testing/intentTest.js";
import type * as testing_poisonEventTest from "../testing/poisonEventTest.js";
import type * as testing_rateLimitTest from "../testing/rateLimitTest.js";
import type * as testingFunctions from "../testingFunctions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/intents": typeof admin_intents;
  "admin/poison": typeof admin_poison;
  "admin/projections": typeof admin_projections;
  "admin/rebuildDemo": typeof admin_rebuildDemo;
  agent: typeof agent;
  "commands/batch": typeof commands_batch;
  "commands/durableOrchestrator": typeof commands_durableOrchestrator;
  "commands/inventory/configs": typeof commands_inventory_configs;
  "commands/orders/configs": typeof commands_orders_configs;
  "commands/registry": typeof commands_registry;
  "contexts/agent/_config": typeof contexts_agent__config;
  "contexts/agent/_llm/config": typeof contexts_agent__llm_config;
  "contexts/agent/_llm/index": typeof contexts_agent__llm_index;
  "contexts/agent/_llm/runtime": typeof contexts_agent__llm_runtime;
  "contexts/agent/_patterns/churnRisk": typeof contexts_agent__patterns_churnRisk;
  "contexts/agent/_utils/confidence": typeof contexts_agent__utils_confidence;
  "contexts/agent/_utils/customer": typeof contexts_agent__utils_customer;
  "contexts/agent/_utils/index": typeof contexts_agent__utils_index;
  "contexts/agent/handlers/eventHandler": typeof contexts_agent_handlers_eventHandler;
  "contexts/agent/handlers/onComplete": typeof contexts_agent_handlers_onComplete;
  "contexts/agent/index": typeof contexts_agent_index;
  "contexts/agent/tools/approval": typeof contexts_agent_tools_approval;
  "contexts/agent/tools/emitCommand": typeof contexts_agent_tools_emitCommand;
  crons: typeof crons;
  crossContextQueries: typeof crossContextQueries;
  "dcb/retryExecution": typeof dcb_retryExecution;
  "eventStore/deadLetters": typeof eventStore_deadLetters;
  "eventStore/durableAppend": typeof eventStore_durableAppend;
  eventSubscriptions: typeof eventSubscriptions;
  infrastructure: typeof infrastructure;
  "integration/deadLetters": typeof integration_deadLetters;
  "integration/events": typeof integration_events;
  "integration/handlers": typeof integration_handlers;
  "integration/index": typeof integration_index;
  "integration/routes": typeof integration_routes;
  inventory: typeof inventory;
  inventoryInternal: typeof inventoryInternal;
  orders: typeof orders;
  "processManagers/index": typeof processManagers_index;
  "processManagers/orderNotification": typeof processManagers_orderNotification;
  "processManagers/reservationRelease": typeof processManagers_reservationRelease;
  "projections/_helpers": typeof projections__helpers;
  "projections/crossContext/orderWithInventory": typeof projections_crossContext_orderWithInventory;
  "projections/customers/customerCancellations": typeof projections_customers_customerCancellations;
  "projections/deadLetters": typeof projections_deadLetters;
  "projections/definitions": typeof projections_definitions;
  "projections/evolve/index": typeof projections_evolve_index;
  "projections/inventory/activeReservations": typeof projections_inventory_activeReservations;
  "projections/inventory/productCatalog": typeof projections_inventory_productCatalog;
  "projections/monitoring": typeof projections_monitoring;
  "projections/orders/orderItems": typeof projections_orders_orderItems;
  "projections/orders/orderSummary": typeof projections_orders_orderSummary;
  "queries/agent": typeof queries_agent;
  "queries/correlations": typeof queries_correlations;
  "queries/events": typeof queries_events;
  rateLimits: typeof rateLimits;
  sagas: typeof sagas;
  "sagas/admin": typeof sagas_admin;
  "sagas/completion": typeof sagas_completion;
  "sagas/events": typeof sagas_events;
  "sagas/index": typeof sagas_index;
  "sagas/orderFulfillment": typeof sagas_orderFulfillment;
  "sagas/payments/actions": typeof sagas_payments_actions;
  "sagas/payments/outbox": typeof sagas_payments_outbox;
  "sagas/registry": typeof sagas_registry;
  "sagas/router": typeof sagas_router;
  testing: typeof testing;
  "testing/dcbRetryTest": typeof testing_dcbRetryTest;
  "testing/durablePublicationTest": typeof testing_durablePublicationTest;
  "testing/eventReplayTest": typeof testing_eventReplayTest;
  "testing/idempotentAppendTest": typeof testing_idempotentAppendTest;
  "testing/integrationPatternsTest": typeof testing_integrationPatternsTest;
  "testing/intentTest": typeof testing_intentTest;
  "testing/poisonEventTest": typeof testing_poisonEventTest;
  "testing/rateLimitTest": typeof testing_rateLimitTest;
  testingFunctions: typeof testingFunctions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  eventStore: {
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
        | { currentVersion: number; status: "conflict" }
      >;
      checkScopeVersion: FunctionReference<
        "query",
        "internal",
        { expectedVersion: number; scopeKey: string },
        | { status: "match" }
        | { currentVersion: number; status: "mismatch" }
        | { status: "not_found" }
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
        | { currentVersion: number; status: "conflict" }
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
        }>
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
        } | null
      >;
      getGlobalPosition: FunctionReference<"query", "internal", {}, number>;
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
        }
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
        }
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
        } | null
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
        } | null
      >;
      getScopeLatestPosition: FunctionReference<
        "query",
        "internal",
        { scopeKey: string },
        number
      >;
      getStreamVersion: FunctionReference<
        "query",
        "internal",
        { streamId: string; streamType: string },
        number
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
        }>
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
        }>
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
        }>
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
        }>
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
        }>
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
        }>
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
        | { deadLetterId: string; status: "already_exists" }
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
        | { status: "not_found" }
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
        | { status: "not_found" }
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
        | { status: "not_found" }
      >;
    };
  };
  commandBus: {
    lib: {
      cleanupExpired: FunctionReference<
        "mutation",
        "internal",
        { batchSize?: number },
        { commands: number; correlations: number }
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
        }>
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
        }
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
        }>
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
        }
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
          }
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
        boolean
      >;
      updateCommandResult: FunctionReference<
        "mutation",
        "internal",
        {
          commandId: string;
          result?: any;
          status: "executed" | "rejected" | "failed";
        },
        boolean
      >;
    };
  };
  projectionPool: {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        {
          id: string;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      cancelAll: FunctionReference<
        "mutation",
        "internal",
        {
          before?: number;
          limit?: number;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism: number;
          };
          fnArgs: any;
          fnHandle: string;
          fnName: string;
          fnType: "action" | "mutation" | "query";
          onComplete?: { context?: any; fnHandle: string };
          retryBehavior?: {
            base: number;
            initialBackoffMs: number;
            maxAttempts: number;
          };
          runAt: number;
        },
        string
      >;
      enqueueBatch: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism: number;
          };
          items: Array<{
            fnArgs: any;
            fnHandle: string;
            fnName: string;
            fnType: "action" | "mutation" | "query";
            onComplete?: { context?: any; fnHandle: string };
            retryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            runAt: number;
          }>;
        },
        Array<string>
      >;
      status: FunctionReference<
        "query",
        "internal",
        { id: string },
        | { previousAttempts: number; state: "pending" }
        | { previousAttempts: number; state: "running" }
        | { state: "finished" }
      >;
      statusBatch: FunctionReference<
        "query",
        "internal",
        { ids: Array<string> },
        Array<
          | { previousAttempts: number; state: "pending" }
          | { previousAttempts: number; state: "running" }
          | { state: "finished" }
        >
      >;
    };
  };
  dcbRetryPool: {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        {
          id: string;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      cancelAll: FunctionReference<
        "mutation",
        "internal",
        {
          before?: number;
          limit?: number;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism: number;
          };
          fnArgs: any;
          fnHandle: string;
          fnName: string;
          fnType: "action" | "mutation" | "query";
          onComplete?: { context?: any; fnHandle: string };
          retryBehavior?: {
            base: number;
            initialBackoffMs: number;
            maxAttempts: number;
          };
          runAt: number;
        },
        string
      >;
      enqueueBatch: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism: number;
          };
          items: Array<{
            fnArgs: any;
            fnHandle: string;
            fnName: string;
            fnType: "action" | "mutation" | "query";
            onComplete?: { context?: any; fnHandle: string };
            retryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            runAt: number;
          }>;
        },
        Array<string>
      >;
      status: FunctionReference<
        "query",
        "internal",
        { id: string },
        | { previousAttempts: number; state: "pending" }
        | { previousAttempts: number; state: "running" }
        | { state: "finished" }
      >;
      statusBatch: FunctionReference<
        "query",
        "internal",
        { ids: Array<string> },
        Array<
          | { previousAttempts: number; state: "pending" }
          | { previousAttempts: number; state: "running" }
          | { state: "finished" }
        >
      >;
    };
  };
  eventReplayPool: {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        {
          id: string;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      cancelAll: FunctionReference<
        "mutation",
        "internal",
        {
          before?: number;
          limit?: number;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism: number;
          };
          fnArgs: any;
          fnHandle: string;
          fnName: string;
          fnType: "action" | "mutation" | "query";
          onComplete?: { context?: any; fnHandle: string };
          retryBehavior?: {
            base: number;
            initialBackoffMs: number;
            maxAttempts: number;
          };
          runAt: number;
        },
        string
      >;
      enqueueBatch: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism: number;
          };
          items: Array<{
            fnArgs: any;
            fnHandle: string;
            fnName: string;
            fnType: "action" | "mutation" | "query";
            onComplete?: { context?: any; fnHandle: string };
            retryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            runAt: number;
          }>;
        },
        Array<string>
      >;
      status: FunctionReference<
        "query",
        "internal",
        { id: string },
        | { previousAttempts: number; state: "pending" }
        | { previousAttempts: number; state: "running" }
        | { state: "finished" }
      >;
      statusBatch: FunctionReference<
        "query",
        "internal",
        { ids: Array<string> },
        Array<
          | { previousAttempts: number; state: "pending" }
          | { previousAttempts: number; state: "running" }
          | { state: "finished" }
        >
      >;
    };
  };
  durableAppendPool: {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        {
          id: string;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      cancelAll: FunctionReference<
        "mutation",
        "internal",
        {
          before?: number;
          limit?: number;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism: number;
          };
          fnArgs: any;
          fnHandle: string;
          fnName: string;
          fnType: "action" | "mutation" | "query";
          onComplete?: { context?: any; fnHandle: string };
          retryBehavior?: {
            base: number;
            initialBackoffMs: number;
            maxAttempts: number;
          };
          runAt: number;
        },
        string
      >;
      enqueueBatch: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism: number;
          };
          items: Array<{
            fnArgs: any;
            fnHandle: string;
            fnName: string;
            fnType: "action" | "mutation" | "query";
            onComplete?: { context?: any; fnHandle: string };
            retryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            runAt: number;
          }>;
        },
        Array<string>
      >;
      status: FunctionReference<
        "query",
        "internal",
        { id: string },
        | { previousAttempts: number; state: "pending" }
        | { previousAttempts: number; state: "running" }
        | { state: "finished" }
      >;
      statusBatch: FunctionReference<
        "query",
        "internal",
        { ids: Array<string> },
        Array<
          | { previousAttempts: number; state: "pending" }
          | { previousAttempts: number; state: "running" }
          | { state: "finished" }
        >
      >;
    };
  };
  workflow: {
    event: {
      create: FunctionReference<
        "mutation",
        "internal",
        { name: string; workflowId: string },
        string
      >;
      send: FunctionReference<
        "mutation",
        "internal",
        {
          eventId?: string;
          name?: string;
          result:
            | { kind: "success"; returnValue: any }
            | { error: string; kind: "failed" }
            | { kind: "canceled" };
          workflowId?: string;
          workpoolOptions?: {
            defaultRetryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
            retryActionsByDefault?: boolean;
          };
        },
        string
      >;
    };
    journal: {
      load: FunctionReference<
        "query",
        "internal",
        { shortCircuit?: boolean; workflowId: string },
        {
          blocked?: boolean;
          journalEntries: Array<{
            _creationTime: number;
            _id: string;
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
            stepNumber: number;
            workflowId: string;
          }>;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          ok: boolean;
          workflow: {
            _creationTime: number;
            _id: string;
            args: any;
            generationNumber: number;
            logLevel?: any;
            name?: string;
            onComplete?: { context?: any; fnHandle: string };
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt?: any;
            state?: any;
            workflowHandle: string;
          };
        }
      >;
      startSteps: FunctionReference<
        "mutation",
        "internal",
        {
          generationNumber: number;
          steps: Array<{
            retry?:
              | boolean
              | { base: number; initialBackoffMs: number; maxAttempts: number };
            schedulerOptions?: { runAt?: number } | { runAfter?: number };
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
          }>;
          workflowId: string;
          workpoolOptions?: {
            defaultRetryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
            retryActionsByDefault?: boolean;
          };
        },
        Array<{
          _creationTime: number;
          _id: string;
          step:
            | {
                args: any;
                argsSize: number;
                completedAt?: number;
                functionType: "query" | "mutation" | "action";
                handle: string;
                inProgress: boolean;
                kind?: "function";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
                workId?: string;
              }
            | {
                args: any;
                argsSize: number;
                completedAt?: number;
                handle: string;
                inProgress: boolean;
                kind: "workflow";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
                workflowId?: string;
              }
            | {
                args: { eventId?: string };
                argsSize: number;
                completedAt?: number;
                eventId?: string;
                inProgress: boolean;
                kind: "event";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
              };
          stepNumber: number;
          workflowId: string;
        }>
      >;
    };
    workflow: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { workflowId: string },
        null
      >;
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { workflowId: string },
        boolean
      >;
      complete: FunctionReference<
        "mutation",
        "internal",
        {
          generationNumber: number;
          runResult:
            | { kind: "success"; returnValue: any }
            | { error: string; kind: "failed" }
            | { kind: "canceled" };
          workflowId: string;
        },
        null
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          maxParallelism?: number;
          onComplete?: { context?: any; fnHandle: string };
          startAsync?: boolean;
          workflowArgs: any;
          workflowHandle: string;
          workflowName: string;
        },
        string
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { workflowId: string },
        {
          inProgress: Array<{
            _creationTime: number;
            _id: string;
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
            stepNumber: number;
            workflowId: string;
          }>;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          workflow: {
            _creationTime: number;
            _id: string;
            args: any;
            generationNumber: number;
            logLevel?: any;
            name?: string;
            onComplete?: { context?: any; fnHandle: string };
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt?: any;
            state?: any;
            workflowHandle: string;
          };
        }
      >;
      listSteps: FunctionReference<
        "query",
        "internal",
        {
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          workflowId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            completedAt?: number;
            eventId?: string;
            kind: "function" | "workflow" | "event";
            name: string;
            nestedWorkflowId?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt: number;
            stepId: string;
            stepNumber: number;
            workId?: string;
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
    };
  };
  actionRetrier: {
    public: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { runId: string },
        boolean
      >;
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { runId: string },
        any
      >;
      start: FunctionReference<
        "mutation",
        "internal",
        {
          functionArgs: any;
          functionHandle: string;
          options: {
            base: number;
            initialBackoffMs: number;
            logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
            maxFailures: number;
            onComplete?: string;
            runAfter?: number;
            runAt?: number;
          };
        },
        string
      >;
      status: FunctionReference<
        "query",
        "internal",
        { runId: string },
        | { type: "inProgress" }
        | {
            result:
              | { returnValue: any; type: "success" }
              | { error: string; type: "failed" }
              | { type: "canceled" };
            type: "completed";
          }
      >;
    };
  };
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
      getValue: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          key?: string;
          name: string;
          sampleShards?: number;
        },
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          shard: number;
          ts: number;
          value: number;
        }
      >;
      rateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      resetRateLimit: FunctionReference<
        "mutation",
        "internal",
        { key?: string; name: string },
        null
      >;
    };
    time: {
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
    };
  };
  orders: {
    handlers: {
      commands: {
        handleAddOrderItem: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            item: {
              productId: string;
              productName: string;
              quantity: number;
              unitPrice: number;
            };
            orderId: string;
          },
          any
        >;
        handleCancelOrder: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            orderId: string;
            reason: string;
          },
          any
        >;
        handleConfirmOrder: FunctionReference<
          "mutation",
          "internal",
          { commandId: string; correlationId: string; orderId: string },
          any
        >;
        handleCreateOrder: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            customerId: string;
            orderId: string;
          },
          any
        >;
        handleRemoveOrderItem: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            orderId: string;
            productId: string;
          },
          any
        >;
        handleSubmitOrder: FunctionReference<
          "mutation",
          "internal",
          { commandId: string; correlationId: string; orderId: string },
          any
        >;
      };
      testing: {
        createTestOrder: FunctionReference<
          "mutation",
          "internal",
          {
            customerId: string;
            items?: Array<{
              productId: string;
              productName: string;
              quantity: number;
              unitPrice: number;
            }>;
            orderId: string;
            status?: "draft" | "submitted" | "confirmed" | "cancelled";
          },
          any
        >;
        getTestOrder: FunctionReference<
          "query",
          "internal",
          { orderId: string },
          any
        >;
      };
    };
  };
  inventory: {
    handlers: {
      commands: {
        handleAddStock: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            productId: string;
            quantity: number;
            reason?: string;
          },
          any
        >;
        handleConfirmReservation: FunctionReference<
          "mutation",
          "internal",
          { commandId: string; correlationId: string; reservationId: string },
          any
        >;
        handleCreateProduct: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            productId: string;
            productName: string;
            sku: string;
            unitPrice: number;
          },
          any
        >;
        handleExpireReservation: FunctionReference<
          "mutation",
          "internal",
          { commandId: string; correlationId: string; reservationId: string },
          any
        >;
        handleReleaseReservation: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            reason: string;
            reservationId: string;
          },
          any
        >;
        handleReserveStock: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            items: Array<{ productId: string; quantity: number }>;
            orderId: string;
          },
          any
        >;
        handleReserveStockDCB: FunctionReference<
          "mutation",
          "internal",
          {
            commandId: string;
            correlationId: string;
            items: Array<{ productId: string; quantity: number }>;
            orderId: string;
            tenantId: string;
          },
          any
        >;
      };
      internal: {
        findExpiredReservations: FunctionReference<
          "mutation",
          "internal",
          {},
          any
        >;
      };
      testing: {
        createTestProduct: FunctionReference<
          "mutation",
          "internal",
          {
            availableQuantity?: number;
            productId: string;
            productName: string;
            reservedQuantity?: number;
            sku: string;
            unitPrice?: number;
            version?: number;
          },
          any
        >;
        createTestReservation: FunctionReference<
          "mutation",
          "internal",
          {
            expiresAt?: number;
            items: Array<{ productId: string; quantity: number }>;
            orderId: string;
            reservationId: string;
            status?: "pending" | "confirmed" | "released" | "expired";
            version?: number;
          },
          any
        >;
        getTestProduct: FunctionReference<
          "query",
          "internal",
          { productId: string },
          any
        >;
        getTestReservation: FunctionReference<
          "query",
          "internal",
          { reservationId: string },
          any
        >;
        getTestReservationByOrderId: FunctionReference<
          "query",
          "internal",
          { orderId: string },
          any
        >;
      };
    };
  };
};

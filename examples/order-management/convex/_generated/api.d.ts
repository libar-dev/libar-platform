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
import type * as contexts_agent__component from "../contexts/agent/_component.js";
import type * as contexts_agent__config from "../contexts/agent/_config.js";
import type * as contexts_agent__llm_config from "../contexts/agent/_llm/config.js";
import type * as contexts_agent__llm_index from "../contexts/agent/_llm/index.js";
import type * as contexts_agent__llm_runtime from "../contexts/agent/_llm/runtime.js";
import type * as contexts_agent__patterns_churnRisk from "../contexts/agent/_patterns/churnRisk.js";
import type * as contexts_agent__utils_confidence from "../contexts/agent/_utils/confidence.js";
import type * as contexts_agent__utils_customer from "../contexts/agent/_utils/customer.js";
import type * as contexts_agent__utils_index from "../contexts/agent/_utils/index.js";
import type * as contexts_agent_handlers_analyzeEvent from "../contexts/agent/handlers/analyzeEvent.js";
import type * as contexts_agent_handlers_onComplete from "../contexts/agent/handlers/onComplete.js";
import type * as contexts_agent_handlers_routeCommand from "../contexts/agent/handlers/routeCommand.js";
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
import type * as lib_globalPosition from "../lib/globalPosition.js";
import type * as orders from "../orders.js";
import type * as pools from "../pools.js";
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
import type * as testing_agentOnCompleteRequiredPersistence from "../testing/agentOnCompleteRequiredPersistence.js";
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
  "contexts/agent/_component": typeof contexts_agent__component;
  "contexts/agent/_config": typeof contexts_agent__config;
  "contexts/agent/_llm/config": typeof contexts_agent__llm_config;
  "contexts/agent/_llm/index": typeof contexts_agent__llm_index;
  "contexts/agent/_llm/runtime": typeof contexts_agent__llm_runtime;
  "contexts/agent/_patterns/churnRisk": typeof contexts_agent__patterns_churnRisk;
  "contexts/agent/_utils/confidence": typeof contexts_agent__utils_confidence;
  "contexts/agent/_utils/customer": typeof contexts_agent__utils_customer;
  "contexts/agent/_utils/index": typeof contexts_agent__utils_index;
  "contexts/agent/handlers/analyzeEvent": typeof contexts_agent_handlers_analyzeEvent;
  "contexts/agent/handlers/onComplete": typeof contexts_agent_handlers_onComplete;
  "contexts/agent/handlers/routeCommand": typeof contexts_agent_handlers_routeCommand;
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
  "lib/globalPosition": typeof lib_globalPosition;
  orders: typeof orders;
  pools: typeof pools;
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
  "testing/agentOnCompleteRequiredPersistence": typeof testing_agentOnCompleteRequiredPersistence;
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
  eventStore: import("@libar-dev/platform-store/_generated/component.js").ComponentApi<"eventStore">;
  commandBus: import("@libar-dev/platform-bus/_generated/component.js").ComponentApi<"commandBus">;
  projectionPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"projectionPool">;
  sagaPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"sagaPool">;
  fanoutPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"fanoutPool">;
  dcbRetryPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"dcbRetryPool">;
  eventReplayPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"eventReplayPool">;
  durableAppendPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"durableAppendPool">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  actionRetrier: import("@convex-dev/action-retrier/_generated/component.js").ComponentApi<"actionRetrier">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  agentBC: import("@libar-dev/platform-core/agent/_generated/component.js").ComponentApi<"agentBC">;
  llmAgent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"llmAgent">;
  agentPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"agentPool">;
  orders: import("../contexts/orders/_generated/component.js").ComponentApi<"orders">;
  inventory: import("../contexts/inventory/_generated/component.js").ComponentApi<"inventory">;
};

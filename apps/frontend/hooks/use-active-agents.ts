import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";

/**
 * Agent checkpoint status type.
 */
export type AgentStatus = "active" | "paused" | "stopped";

/**
 * Agent checkpoint data from the agentCheckpoints table.
 */
export interface AgentCheckpoint {
  _id: string;
  _creationTime: number;
  agentId: string;
  subscriptionId: string;
  lastProcessedPosition: number;
  lastEventId: string;
  status: AgentStatus;
  eventsProcessed: number;
  updatedAt: number;
}

// Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
const getActiveAgentsQuery = makeFunctionReference<"query">(
  "queries/agent:getActiveAgents"
) as FunctionReference<"query", "public", Record<string, never>, AgentCheckpoint[]>;

const getCheckpointQuery = makeFunctionReference<"query">(
  "queries/agent:getCheckpoint"
) as FunctionReference<"query", "public", { agentId: string }, AgentCheckpoint | null>;

/**
 * Hook to fetch all active agents.
 *
 * Uses TanStack Query + Convex for SSR support with real-time updates.
 *
 * @returns Object containing agents array (always defined with Suspense)
 *
 * @example
 * ```tsx
 * function AgentList() {
 *   const { agents } = useActiveAgents();
 *
 *   return (
 *     <ul>
 *       {agents.map(agent => (
 *         <li key={agent.agentId}>
 *           {agent.agentId} - {agent.eventsProcessed} events processed
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useActiveAgents(): {
  agents: AgentCheckpoint[];
  isLoading: false; // With Suspense, data is always loaded
} {
  const { data } = useSuspenseQuery(convexQuery(getActiveAgentsQuery, {}));

  return {
    agents: (data ?? []) as AgentCheckpoint[],
    isLoading: false, // Suspense handles loading state
  };
}

/**
 * Hook to fetch a specific agent checkpoint.
 *
 * Uses TanStack Query + Convex for SSR support with real-time updates.
 *
 * @param agentId - The agent ID to look up
 * @returns Object containing checkpoint data (may be null if not found)
 *
 * @example
 * ```tsx
 * function AgentDetail({ agentId }: { agentId: string }) {
 *   const { checkpoint } = useAgentCheckpoint(agentId);
 *
 *   if (!checkpoint) {
 *     return <div>Agent not found</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <h2>{checkpoint.agentId}</h2>
 *       <p>Status: {checkpoint.status}</p>
 *       <p>Events processed: {checkpoint.eventsProcessed}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAgentCheckpoint(agentId: string): {
  checkpoint: AgentCheckpoint | null;
  isLoading: false; // With Suspense, data is always loaded
} {
  const { data } = useSuspenseQuery(convexQuery(getCheckpointQuery, { agentId }));

  return {
    checkpoint: data as AgentCheckpoint | null,
    isLoading: false, // Suspense handles loading state
  };
}

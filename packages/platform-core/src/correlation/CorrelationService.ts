/**
 * Provides a high-level interface for tracking command-event correlations.
 * This service wraps the Command Bus correlation functions and provides
 * convenient methods for recording and querying correlations.
 */

/**
 * Command-Event Correlation record.
 */
export interface CommandEventCorrelation {
  /** The command ID that produced the event(s) */
  commandId: string;

  /** Event IDs produced by this command */
  eventIds: string[];

  /** Command type for filtering */
  commandType: string;

  /** Bounded context */
  boundedContext: string;

  /** When recorded */
  createdAt: number;
}

/**
 * Options for recording a correlation.
 */
export interface RecordCorrelationOptions {
  /** The command ID */
  commandId: string;

  /** The event IDs produced */
  eventIds: string[];

  /** Command type */
  commandType: string;

  /** Bounded context */
  boundedContext: string;
}

/**
 * Query options for correlations.
 */
export interface CorrelationQueryOptions {
  /** Bounded context to filter by */
  boundedContext?: string;

  /** Maximum number of results */
  limit?: number;

  /** Only return correlations after this timestamp */
  afterTimestamp?: number;
}

/**
 * Command Bus client interface for correlation operations.
 * This matches the API exposed by the command-bus component.
 */
export interface CorrelationCommandBusClient {
  recordCommandEventCorrelation: (args: {
    commandId: string;
    eventIds: string[];
    commandType: string;
    boundedContext: string;
  }) => Promise<boolean>;

  getEventsByCommandId: (args: { commandId: string }) => Promise<{
    commandId: string;
    eventIds: string[];
    commandType: string;
    boundedContext: string;
    createdAt: number;
  } | null>;

  getCorrelationsByContext: (args: {
    boundedContext: string;
    limit?: number;
    afterTimestamp?: number;
  }) => Promise<
    Array<{
      commandId: string;
      eventIds: string[];
      commandType: string;
      boundedContext: string;
      createdAt: number;
    }>
  >;
}

/**
 * Correlation Service for tracking command-event relationships.
 *
 * This service provides methods to:
 * - Record which events a command produced
 * - Query events by command ID
 * - Query correlations by bounded context
 *
 * @example
 * ```typescript
 * const correlationService = new CorrelationService(commandBusClient);
 *
 * // After a command produces events:
 * await correlationService.recordCorrelation({
 *   commandId: "cmd_123",
 *   eventIds: ["evt_456"],
 *   commandType: "CreateOrder",
 *   boundedContext: "orders",
 * });
 *
 * // Query events by command:
 * const events = await correlationService.getEventsByCommand("cmd_123");
 * ```
 */
export class CorrelationService {
  constructor(private readonly client: CorrelationCommandBusClient) {}

  /**
   * Record a command-event correlation.
   *
   * This should be called after a command successfully produces events.
   * The operation is idempotent - recording the same correlation multiple
   * times will merge event IDs.
   *
   * @param options - Correlation details
   * @returns True if recorded successfully
   */
  async recordCorrelation(options: RecordCorrelationOptions): Promise<boolean> {
    return this.client.recordCommandEventCorrelation({
      commandId: options.commandId,
      eventIds: options.eventIds,
      commandType: options.commandType,
      boundedContext: options.boundedContext,
    });
  }

  /**
   * Get the events produced by a specific command.
   *
   * @param commandId - The command ID to look up
   * @returns Correlation record or null if not found
   */
  async getEventsByCommand(commandId: string): Promise<CommandEventCorrelation | null> {
    const result = await this.client.getEventsByCommandId({ commandId });
    return result;
  }

  /**
   * Get all correlations for a bounded context.
   *
   * @param options - Query options
   * @returns Array of correlation records
   */
  async getCorrelationsByContext(
    options: CorrelationQueryOptions
  ): Promise<CommandEventCorrelation[]> {
    if (!options.boundedContext) {
      throw new Error("boundedContext is required for getCorrelationsByContext");
    }

    // Build args conditionally to satisfy exactOptionalPropertyTypes
    const args: {
      boundedContext: string;
      limit?: number;
      afterTimestamp?: number;
    } = {
      boundedContext: options.boundedContext,
    };

    if (options.limit !== undefined) {
      args.limit = options.limit;
    }
    if (options.afterTimestamp !== undefined) {
      args.afterTimestamp = options.afterTimestamp;
    }

    return this.client.getCorrelationsByContext(args);
  }

  /**
   * Check if a command has any recorded correlations.
   *
   * @param commandId - The command ID to check
   * @returns True if the command has recorded events
   */
  async hasCorrelation(commandId: string): Promise<boolean> {
    const correlation = await this.getEventsByCommand(commandId);
    return correlation !== null && correlation.eventIds.length > 0;
  }

  /**
   * Get the count of events produced by a command.
   *
   * @param commandId - The command ID
   * @returns Number of events, or 0 if no correlation found
   */
  async getEventCount(commandId: string): Promise<number> {
    const correlation = await this.getEventsByCommand(commandId);
    return correlation?.eventIds.length ?? 0;
  }
}

/**
 * Create a correlation service from a command bus client.
 *
 * @param client - The command bus client with correlation functions
 * @returns A new CorrelationService instance
 */
export function createCorrelationService(client: CorrelationCommandBusClient): CorrelationService {
  return new CorrelationService(client);
}

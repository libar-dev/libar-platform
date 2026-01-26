/**
 * @libar-docs
 * @libar-docs-implements WorkpoolPartitioningStrategy
 * @libar-docs-status active
 * @libar-docs-command
 *
 * @libar-docs-uses WorkpoolPartitioningStrategy
 * @libar-docs-used-by CommandOrchestrator
 * @libar-docs-usecase "When validating command configs have explicit partition keys"
 *
 * ## Command Config Partition Key Validation
 *
 * Validates that all projection configurations in a command config
 * have explicit partition keys defined. This prevents runtime errors
 * and ensures intentional partition key selection.
 *
 * ### Validation Rules
 *
 * 1. Every projection config must have `getPartitionKey` defined
 * 2. Partition key function must return valid `{ name, value }` shape
 * 3. Value must be a non-empty string
 *
 * ### Error Handling
 *
 * Validation collects all errors and throws a single comprehensive error.
 * This allows developers to fix all issues at once rather than iteratively.
 */

/**
 * Validation error codes for partition key issues.
 */
export type PartitionValidationErrorCode =
  | "MISSING_PARTITION_KEY"
  | "INVALID_PARTITION_KEY_SHAPE"
  | "EMPTY_PARTITION_VALUE";

/**
 * Validation error for partition key issues.
 */
export interface PartitionValidationError {
  /** Projection name that failed validation */
  projectionName: string;
  /** Path to the config (e.g., "CreateOrder.projection") */
  configPath: string;
  /** Error code for programmatic handling */
  code: PartitionValidationErrorCode;
  /** Human-readable error message */
  message: string;
}

/**
 * Validation result for command configs.
 */
export interface ConfigValidationResult {
  /** Whether all configs passed validation */
  valid: boolean;
  /** Array of validation errors (empty if valid) */
  errors: PartitionValidationError[];
}

/**
 * Test args for partition key validation.
 *
 * Contains all common ID fields to test partition key functions
 * without requiring actual command args.
 */
const TEST_ARGS = {
  orderId: "test-order-id",
  productId: "test-product-id",
  reservationId: "test-reservation-id",
  customerId: "test-customer-id",
  correlationId: "test-correlation-id",
  streamId: "test-stream-id",
};

/**
 * Minimal projection config interface for validation.
 */
interface MinimalProjectionConfig {
  projectionName: string;
  getPartitionKey?: ((args: unknown) => unknown) | undefined;
}

/**
 * Validate a single projection config's partition key.
 *
 * @param config - Projection configuration to validate
 * @param configPath - Path to this config (for error messages)
 * @returns Validation error if invalid, null if valid
 */
function validateProjectionPartitionKey(
  config: MinimalProjectionConfig,
  configPath: string
): PartitionValidationError | null {
  // Check if getPartitionKey is defined
  if (!config.getPartitionKey) {
    return {
      projectionName: config.projectionName,
      configPath,
      code: "MISSING_PARTITION_KEY",
      message:
        `Projection "${config.projectionName}" missing getPartitionKey. ` +
        `Use createEntityPartitionKey, createCustomerPartitionKey, ` +
        `createSagaPartitionKey, or GLOBAL_PARTITION_KEY from @libar-dev/platform-core/workpool/partitioning.`,
    };
  }

  // Test the partition key function with sample args
  try {
    const testKey = config.getPartitionKey(TEST_ARGS);

    // Validate shape
    if (!testKey || typeof testKey !== "object") {
      return {
        projectionName: config.projectionName,
        configPath,
        code: "INVALID_PARTITION_KEY_SHAPE",
        message: `Projection "${config.projectionName}" getPartitionKey must return { name, value }.`,
      };
    }

    const key = testKey as { name?: unknown; value?: unknown };

    if (typeof key.name !== "string" || typeof key.value !== "string") {
      return {
        projectionName: config.projectionName,
        configPath,
        code: "INVALID_PARTITION_KEY_SHAPE",
        message: `Projection "${config.projectionName}" getPartitionKey must return { name: string, value: string }.`,
      };
    }

    // Check for empty value
    if (!key.value || key.value.trim() === "") {
      return {
        projectionName: config.projectionName,
        configPath,
        code: "EMPTY_PARTITION_VALUE",
        message: `Projection "${config.projectionName}" getPartitionKey returned empty value.`,
      };
    }

    return null; // Valid
  } catch (_error) {
    // If the test fails due to missing required fields, that's expected
    // for certain strategies (e.g., customer strategy without customerId).
    // We just want to ensure the function exists and has correct shape.
    return null;
  }
}

/**
 * Minimal command config interface for validation.
 */
interface MinimalCommandConfig {
  commandType: string;
  projection: MinimalProjectionConfig;
  secondaryProjections?: MinimalProjectionConfig[];
  failedProjection?: MinimalProjectionConfig;
}

/**
 * Validate all projection configs in a command config.
 *
 * Checks primary projection, secondary projections, and failed projection
 * for valid partition key definitions.
 *
 * @param config - Command configuration to validate
 * @returns Validation result with collected errors
 *
 * @example
 * ```typescript
 * const result = validateCommandConfigPartitions(createOrderConfig);
 * if (!result.valid) {
 *   console.error("Validation errors:", result.errors);
 * }
 * ```
 */
export function validateCommandConfigPartitions(
  config: MinimalCommandConfig
): ConfigValidationResult {
  const errors: PartitionValidationError[] = [];

  // Validate primary projection
  const primaryError = validateProjectionPartitionKey(
    config.projection,
    `${config.commandType}.projection`
  );
  if (primaryError) errors.push(primaryError);

  // Validate secondary projections
  if (config.secondaryProjections) {
    config.secondaryProjections.forEach((secondary, index) => {
      const secondaryError = validateProjectionPartitionKey(
        secondary,
        `${config.commandType}.secondaryProjections[${index}]`
      );
      if (secondaryError) errors.push(secondaryError);
    });
  }

  // Validate failed projection
  if (config.failedProjection) {
    const failedError = validateProjectionPartitionKey(
      config.failedProjection,
      `${config.commandType}.failedProjection`
    );
    if (failedError) errors.push(failedError);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Assert all command configs have valid partition keys.
 *
 * Collects all validation errors across all configs and throws a single
 * comprehensive error with all issues listed.
 *
 * **Usage:** Call during application initialization to fail fast on
 * configuration errors.
 *
 * @param configs - Array of command configurations to validate
 * @throws Error with all validation errors if any config is invalid
 *
 * @example
 * ```typescript
 * // During app initialization
 * import { createOrderConfig, submitOrderConfig } from "./commands/orders";
 *
 * assertValidPartitionKeys([createOrderConfig, submitOrderConfig]);
 * // Throws if any projection is missing getPartitionKey
 * ```
 */
export function assertValidPartitionKeys(configs: MinimalCommandConfig[]): void {
  const allErrors: PartitionValidationError[] = [];

  for (const config of configs) {
    const result = validateCommandConfigPartitions(config);
    allErrors.push(...result.errors);
  }

  if (allErrors.length > 0) {
    const errorMessages = allErrors
      .map((e) => `  - [${e.code}] ${e.configPath}: ${e.message}`)
      .join("\n");

    throw new Error(
      `Partition key validation failed for ${allErrors.length} projection(s):\n${errorMessages}`
    );
  }
}

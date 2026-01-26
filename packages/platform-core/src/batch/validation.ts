/**
 * Batch Validation
 *
 * Pre-flight validation for batch command execution.
 * Ensures single-aggregate scope for atomic mode.
 */
import type {
  BatchCommand,
  BatchOptions,
  BatchValidationResult,
  BatchValidationError,
} from "./types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Registration info needed for validation.
 */
interface RegistrationInfo {
  category: string;
  boundedContext: string;
  targetAggregate?: { type: string; idField: string };
}

/**
 * Registry lookup function type.
 */
type RegistryLookup = (commandType: string) => RegistrationInfo | undefined;

/**
 * Validate a batch of commands before execution.
 *
 * Checks:
 * 1. Batch is not empty
 * 2. All commands are registered (if registry provided)
 * 3. All commands are aggregate commands (if registry provided)
 * 4. For atomic mode: all commands target the same aggregate instance
 * 5. Bounded context matches (if specified)
 *
 * @param commands - The commands to validate
 * @param options - Batch execution options
 * @param getRegistration - Optional registry lookup function
 * @returns Validation result
 */
export function validateBatch(
  commands: BatchCommand[],
  options: BatchOptions,
  getRegistration?: RegistryLookup
): BatchValidationResult {
  const errors: BatchValidationError[] = [];

  // Check empty batch
  if (commands.length === 0) {
    errors.push({
      code: "EMPTY_BATCH",
      message: "Batch cannot be empty",
    });
    return { valid: false, errors };
  }

  // If no registry, skip registration-based validation
  if (!getRegistration) {
    // Still validate atomic mode requirements
    if (options.mode === "atomic") {
      const atomicErrors = validateAtomicMode(commands, options);
      if (atomicErrors.length > 0) {
        return { valid: false, errors: atomicErrors };
      }
    }
    return { valid: true };
  }

  // Validate each command
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i]!;
    const registration = getRegistration(command.commandType);

    // Check registration exists
    if (!registration) {
      errors.push({
        code: "UNREGISTERED_COMMAND",
        message: `Command "${command.commandType}" is not registered`,
        commandIndex: i,
      });
      continue;
    }

    // Check bounded context (if specified)
    if (options.boundedContext && registration.boundedContext !== options.boundedContext) {
      errors.push({
        code: "WRONG_BOUNDED_CONTEXT",
        message: `Command "${command.commandType}" belongs to context "${registration.boundedContext}", expected "${options.boundedContext}"`,
        commandIndex: i,
        context: {
          expected: options.boundedContext,
          actual: registration.boundedContext,
        },
      });
    }

    // For atomic mode, commands should be aggregate commands
    if (options.mode === "atomic" && registration.category !== "aggregate") {
      errors.push({
        code: "WRONG_CATEGORY",
        message: `Atomic batch requires aggregate commands, but "${command.commandType}" is a "${registration.category}" command`,
        commandIndex: i,
        context: { category: registration.category },
      });
    }
  }

  // If we have registration errors, return early
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Validate atomic mode single-aggregate constraint
  if (options.mode === "atomic") {
    const atomicErrors = validateAtomicModeWithRegistry(commands, options, getRegistration);
    if (atomicErrors.length > 0) {
      return { valid: false, errors: atomicErrors };
    }
  }

  return { valid: true };
}

/**
 * Validate atomic mode without registry.
 * Requires aggregateId and aggregateIdField in options.
 */
function validateAtomicMode(
  commands: BatchCommand[],
  options: BatchOptions
): BatchValidationError[] {
  const errors: BatchValidationError[] = [];

  // Atomic mode requires aggregateId
  if (!options.aggregateId) {
    errors.push({
      code: "MISSING_AGGREGATE_ID",
      message: "Atomic mode requires aggregateId option to specify the target aggregate",
    });
    return errors;
  }

  // Atomic mode requires aggregateIdField to verify commands target same aggregate
  if (!options.aggregateIdField) {
    errors.push({
      code: "MISSING_AGGREGATE_ID",
      message:
        "Atomic mode requires aggregateIdField option to verify commands target the same aggregate",
    });
    return errors;
  }

  // Verify all commands target the same aggregate
  const aggregateIdField = options.aggregateIdField;
  const expectedId = options.aggregateId;

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i]!;
    const args = command.args as UnknownRecord;
    const actualId = args[aggregateIdField];

    if (typeof actualId !== "string" || actualId !== expectedId) {
      errors.push({
        code: "CROSS_AGGREGATE_ATOMIC",
        message:
          typeof actualId !== "string"
            ? `Atomic mode requires aggregate ID to be a string. Command at index ${i} has invalid field "${aggregateIdField}"`
            : `Atomic mode requires all commands to target the same aggregate. Command at index ${i} targets "${actualId}", expected "${expectedId}"`,
        commandIndex: i,
        context: {
          expected: expectedId,
          actual: actualId,
          field: aggregateIdField,
        },
      });
    }
  }

  return errors;
}

/**
 * Validate atomic mode with registry info.
 * Uses registration to determine aggregate ID field.
 */
function validateAtomicModeWithRegistry(
  commands: BatchCommand[],
  options: BatchOptions,
  getRegistration: RegistryLookup
): BatchValidationError[] {
  const errors: BatchValidationError[] = [];

  // If aggregateId is provided, use explicit validation
  if (options.aggregateId) {
    // Determine aggregate ID field from first command's registration
    const firstReg = getRegistration(commands[0]!.commandType);
    const aggregateIdField = options.aggregateIdField ?? firstReg?.targetAggregate?.idField;

    if (!aggregateIdField) {
      errors.push({
        code: "MISSING_AGGREGATE_ID",
        message: "Could not determine aggregate ID field from command registration",
      });
      return errors;
    }

    // Check all commands target the same aggregate
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]!;
      const args = command.args as UnknownRecord;
      const actualId = args[aggregateIdField];

      if (typeof actualId !== "string" || actualId !== options.aggregateId) {
        errors.push({
          code: "CROSS_AGGREGATE_ATOMIC",
          message:
            typeof actualId !== "string"
              ? `Atomic mode requires aggregate ID to be a string. Command "${command.commandType}" at index ${i} has invalid field "${aggregateIdField}"`
              : `Atomic mode requires all commands to target aggregate "${options.aggregateId}". Command "${command.commandType}" at index ${i} targets "${actualId}"`,
          commandIndex: i,
          context: {
            expected: options.aggregateId,
            actual: actualId,
            field: aggregateIdField,
          },
        });
      }
    }

    return errors;
  }

  // No aggregateId provided - infer from first command and verify all match
  const firstCommand = commands[0]!;
  const firstReg = getRegistration(firstCommand.commandType);

  if (!firstReg?.targetAggregate?.idField) {
    errors.push({
      code: "MISSING_AGGREGATE_ID",
      message:
        "Atomic mode requires aggregateId option or commands with targetAggregate configuration",
    });
    return errors;
  }

  const aggregateIdField = firstReg.targetAggregate.idField;
  const expectedId = (firstCommand.args as UnknownRecord)[aggregateIdField];

  if (typeof expectedId !== "string") {
    errors.push({
      code: "MISSING_AGGREGATE_ID",
      message:
        expectedId === undefined
          ? `First command is missing aggregate ID field "${aggregateIdField}"`
          : `First command aggregate ID must be a string, got "${typeof expectedId}"`,
      commandIndex: 0,
    });
    return errors;
  }

  // Check remaining commands target same aggregate
  for (let i = 1; i < commands.length; i++) {
    const command = commands[i]!;
    const reg = getRegistration(command.commandType);

    // Different aggregate types
    if (reg?.targetAggregate?.type !== firstReg.targetAggregate.type) {
      errors.push({
        code: "CROSS_AGGREGATE_ATOMIC",
        message: `Atomic mode requires all commands to target the same aggregate type. Command at index ${i} targets "${reg?.targetAggregate?.type}", expected "${firstReg.targetAggregate.type}"`,
        commandIndex: i,
      });
      continue;
    }

    // Different aggregate ID field
    const cmdIdField = reg?.targetAggregate?.idField ?? aggregateIdField;
    const actualId = (command.args as UnknownRecord)[cmdIdField];

    if (typeof actualId !== "string" || actualId !== expectedId) {
      errors.push({
        code: "CROSS_AGGREGATE_ATOMIC",
        message:
          typeof actualId !== "string"
            ? `Atomic mode requires aggregate ID to be a string. Command "${command.commandType}" at index ${i} has invalid field "${cmdIdField}"`
            : `Atomic mode requires all commands to target the same aggregate instance. Command "${command.commandType}" at index ${i} targets "${actualId}", expected "${expectedId}"`,
        commandIndex: i,
        context: {
          expected: expectedId,
          actual: actualId,
          field: cmdIdField,
        },
      });
    }
  }

  return errors;
}

/**
 * Extract aggregate ID from a command.
 *
 * @param command - The command
 * @param idField - The aggregate ID field name
 * @returns The aggregate ID or undefined
 */
export function extractAggregateId(command: BatchCommand, idField: string): string | undefined {
  const args = command.args as UnknownRecord;
  const id = args[idField];
  return typeof id === "string" ? id : undefined;
}

/**
 * Group commands by aggregate ID.
 *
 * Useful for partial mode to identify parallel execution groups.
 *
 * @param commands - The commands
 * @param idField - The aggregate ID field name
 * @returns Map of aggregate ID to commands
 */
export function groupByAggregateId(
  commands: BatchCommand[],
  idField: string
): Map<string, BatchCommand[]> {
  const groups = new Map<string, BatchCommand[]>();

  for (const command of commands) {
    const id = extractAggregateId(command, idField) ?? "__no_id__";
    const group = groups.get(id) ?? [];
    group.push(command);
    groups.set(id, group);
  }

  return groups;
}

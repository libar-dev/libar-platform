/**
 * Command naming policy and validation.
 *
 * DDD/CQRS command naming conventions ensure commands are:
 * - Imperative (express intent to change state)
 * - Self-documenting (verb + noun pattern)
 * - Consistent across bounded contexts
 */

/**
 * Standard command name prefixes per DDD/CQRS conventions.
 *
 * Each prefix maps to a regex pattern that command names should match.
 */
export const CommandNamingPolicy = {
  /** Create a new entity: CreateOrder, CreateProduct */
  CREATE: /^Create[A-Z][a-zA-Z]*$/,

  /** Submit for processing: SubmitOrder, SubmitApplication */
  SUBMIT: /^Submit[A-Z][a-zA-Z]*$/,

  /** Cancel an operation: CancelOrder, CancelReservation */
  CANCEL: /^Cancel[A-Z][a-zA-Z]*$/,

  /** Update existing state: UpdateAddress, UpdateProfile */
  UPDATE: /^(Update|Change|Modify)[A-Z][a-zA-Z]*$/,

  /** Add to a collection: AddOrderItem, AddToCart */
  ADD: /^Add[A-Z][a-zA-Z]*$/,

  /** Remove from a collection: RemoveOrderItem, RemoveFromCart */
  REMOVE: /^Remove[A-Z][a-zA-Z]*$/,

  /** Confirm a pending action: ConfirmOrder, ConfirmPayment */
  CONFIRM: /^Confirm[A-Z][a-zA-Z]*$/,

  /** Reserve resources: ReserveStock, ReserveSeat */
  RESERVE: /^Reserve[A-Z][a-zA-Z]*$/,

  /** Release reserved resources: ReleaseReservation, ReleaseStock */
  RELEASE: /^Release[A-Z][a-zA-Z]*$/,

  /** Expire time-sensitive items: ExpireReservation, ExpireSession */
  EXPIRE: /^Expire[A-Z][a-zA-Z]*$/,

  /** Delete an entity: DeleteUser, DeleteOrder */
  DELETE: /^Delete[A-Z][a-zA-Z]*$/,

  /** Start a process: StartFulfillment, StartProcessing */
  START: /^Start[A-Z][a-zA-Z]*$/,

  /** Complete a process: CompleteOrder, CompleteTask */
  COMPLETE: /^Complete[A-Z][a-zA-Z]*$/,

  /** Reject an item: RejectOrder, RejectApplication */
  REJECT: /^Reject[A-Z][a-zA-Z]*$/,

  /** Approve an item: ApproveOrder, ApproveRequest */
  APPROVE: /^Approve[A-Z][a-zA-Z]*$/,
} as const;

/**
 * Type representing valid command name prefixes.
 */
export type CommandNamePrefix = keyof typeof CommandNamingPolicy;

/**
 * All valid command name prefixes.
 */
export const COMMAND_NAME_PREFIXES = Object.keys(CommandNamingPolicy) as CommandNamePrefix[];

/**
 * Result of command name validation.
 */
export interface CommandNameValidationResult {
  /** Whether the name is valid */
  valid: boolean;
  /** The matched prefix, if valid */
  matchedPrefix?: CommandNamePrefix;
  /** Suggestions for invalid names */
  suggestions?: string[];
  /** Validation message */
  message: string;
}

/**
 * Validate a command name against the naming policy.
 *
 * @param name - The command name to validate
 * @returns Validation result with suggestions if invalid
 *
 * @example
 * ```typescript
 * validateCommandName("CreateOrder")
 * // { valid: true, matchedPrefix: "CREATE", message: "Valid command name" }
 *
 * validateCommandName("OrderCreate")
 * // { valid: false, suggestions: ["CreateOrder"], message: "..." }
 * ```
 */
export function validateCommandName(name: string): CommandNameValidationResult {
  // Check each prefix pattern
  for (const [prefix, pattern] of Object.entries(CommandNamingPolicy)) {
    if (pattern.test(name)) {
      return {
        valid: true,
        matchedPrefix: prefix as CommandNamePrefix,
        message: `Valid command name matching ${prefix} pattern`,
      };
    }
  }

  // Generate suggestions for invalid names
  const suggestions = generateNameSuggestions(name);

  return {
    valid: false,
    suggestions,
    message: `Command name "${name}" does not follow naming conventions. Expected format: <Verb><Noun> (e.g., CreateOrder, AddOrderItem)`,
  };
}

/**
 * Generate suggestions for an invalid command name.
 *
 * @param name - The invalid command name
 * @returns Array of suggested valid names
 */
export function generateNameSuggestions(name: string): string[] {
  const suggestions: string[] = [];

  // Extract potential noun from the name
  // Handle common patterns: "OrderCreate" -> "Order", "order_create" -> "Order"
  const cleanName = name
    .replace(/[_-]/g, "") // Remove separators
    .replace(/^[a-z]/, (c) => c.toUpperCase()); // Capitalize first letter

  // Check if it starts with a noun (inverted pattern like "OrderCreate")
  const invertedMatch = cleanName.match(/^([A-Z][a-z]+)([A-Z][a-z]+)$/);
  if (invertedMatch) {
    const [, noun, verb] = invertedMatch;
    const correctedName = `${verb}${noun}`;
    if (isValidCommandName(correctedName)) {
      suggestions.push(correctedName);
    }
  }

  // Try common prefixes with the cleaned name
  const nounPart = extractNoun(cleanName);
  if (nounPart) {
    const commonPrefixes = ["Create", "Update", "Delete", "Add", "Remove"];
    for (const prefix of commonPrefixes) {
      const suggestion = `${prefix}${nounPart}`;
      if (isValidCommandName(suggestion) && !suggestions.includes(suggestion)) {
        suggestions.push(suggestion);
      }
    }
  }

  return suggestions.slice(0, 3); // Return top 3 suggestions
}

/**
 * Extract the noun part from a command name.
 *
 * @param name - The command name
 * @returns The noun part, or undefined if not extractable
 */
function extractNoun(name: string): string | undefined {
  // Try to find a capitalized word that could be the noun
  const match = name.match(/([A-Z][a-z]+)+$/);
  return match ? match[0] : undefined;
}

/**
 * Check if a command name is valid according to the naming policy.
 *
 * @param name - The command name to check
 * @returns True if the name matches any valid pattern
 *
 * @example
 * ```typescript
 * isValidCommandName("CreateOrder") // true
 * isValidCommandName("OrderCreate") // false
 * isValidCommandName("create_order") // false
 * ```
 */
export function isValidCommandName(name: string): boolean {
  return Object.values(CommandNamingPolicy).some((pattern) => pattern.test(name));
}

/**
 * Get the prefix from a valid command name.
 *
 * @param name - The command name
 * @returns The matched prefix, or undefined if invalid
 *
 * @example
 * ```typescript
 * getCommandPrefix("CreateOrder") // "CREATE"
 * getCommandPrefix("AddOrderItem") // "ADD"
 * getCommandPrefix("InvalidName") // undefined
 * ```
 */
export function getCommandPrefix(name: string): CommandNamePrefix | undefined {
  for (const [prefix, pattern] of Object.entries(CommandNamingPolicy)) {
    if (pattern.test(name)) {
      return prefix as CommandNamePrefix;
    }
  }
  return undefined;
}

/**
 * Format a command name to follow the naming policy.
 *
 * Attempts to convert various formats to PascalCase Verb+Noun.
 *
 * @param name - The command name to format
 * @param defaultPrefix - Default prefix if verb cannot be determined
 * @returns Formatted command name
 *
 * @example
 * ```typescript
 * formatCommandName("order_create", "Create") // "CreateOrder"
 * formatCommandName("add-item", "Add") // "AddItem"
 * formatCommandName("createOrder", "Create") // "CreateOrder"
 * ```
 */
export function formatCommandName(name: string, defaultPrefix: string = "Execute"): string {
  // Convert to PascalCase
  const pascalCase = name
    .replace(/[_-]/g, " ") // Replace separators with spaces
    .replace(/([a-z])([A-Z])/g, "$1 $2") // Add space before capitals
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

  // If already valid, return as-is
  if (isValidCommandName(pascalCase)) {
    return pascalCase;
  }

  // Add default prefix if needed
  return `${defaultPrefix}${pascalCase}`;
}

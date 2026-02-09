/**
 * Crypto-Shredding Markers - GDPR compliance for fat events
 *
 * @libar-docs
 * @libar-docs-implements EcstFatEvents
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 *
 * Provides tools for marking PII (Personally Identifiable Information) in
 * fat events for GDPR-compliant deletion. Marked fields can be identified
 * and redacted when a user exercises their right to erasure.
 */

import type { FatEvent, RedactedValue, ShredResult, ShreddableField } from "./types.js";

/**
 * Creates a RedactedValue object to replace a shredded field.
 *
 * Preserves type metadata for debugging and compliance.
 *
 * @param originalValue - The original value being redacted
 * @returns A RedactedValue object with type metadata
 * @internal
 */
function createRedactedValue(originalValue: unknown): RedactedValue {
  let originalType: RedactedValue["originalType"];

  if (originalValue === null) {
    originalType = "null";
  } else if (Array.isArray(originalValue)) {
    originalType = "array";
  } else {
    const jsType = typeof originalValue;
    // Map JavaScript types to our allowed types
    if (jsType === "string" || jsType === "number" || jsType === "boolean" || jsType === "object") {
      originalType = jsType;
    } else {
      // For undefined, function, symbol, bigint - treat as "object" for simplicity
      originalType = "object";
    }
  }

  return {
    __redacted: true,
    originalType,
    redactedAt: Date.now(),
  };
}

/**
 * Maximum depth for recursive traversal to prevent DoS attacks.
 * Payloads nested deeper than this will throw an error.
 */
export const MAX_TRAVERSAL_DEPTH = 20;

/**
 * Type guard to check if a value is a shreddable field.
 *
 * @param value - The value to check
 * @returns True if the value has __shred: true marker
 */
export function isShreddableField(value: unknown): value is ShreddableField<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "__shred" in value &&
    (value as ShreddableField<unknown>).__shred === true
  );
}

/**
 * Recursively finds all fields marked for crypto-shredding in an event.
 *
 * Returns JSON paths (dot notation) to all fields with __shred: true marker.
 * Useful for compliance reporting and audit trails.
 *
 * @param event - The fat event to search
 * @returns Array of JSON paths to shreddable fields (e.g., ["payload.customer.email"])
 * @throws Error if maximum traversal depth is exceeded (DoS protection)
 *
 * @example
 * ```typescript
 * const event = createFatEvent("OrderSubmitted", {
 *   orderId: "ord_123",
 *   customer: embedEntity(customer, ["id", "name", "email"], { shred: ["email"] }),
 * });
 *
 * findShreddableFields(event);
 * // Result: ["payload.customer.email"]
 * ```
 */
export function findShreddableFields(event: FatEvent): string[] {
  const paths: string[] = [];
  const visited = new WeakSet<object>();

  function traverse(obj: unknown, currentPath: string, depth: number): void {
    // DoS protection: prevent deeply nested payloads from causing stack overflow
    if (depth > MAX_TRAVERSAL_DEPTH) {
      throw new Error(
        `Maximum traversal depth (${MAX_TRAVERSAL_DEPTH}) exceeded at path "${currentPath}". ` +
          `This may indicate a malformed payload or potential DoS attack.`
      );
    }

    if (obj === null || typeof obj !== "object") {
      return;
    }

    // Circular reference protection
    if (visited.has(obj)) {
      return;
    }
    visited.add(obj);

    // Check if this object is a shreddable field
    if (isShreddableField(obj)) {
      paths.push(currentPath);
      return;
    }

    // Recurse into object properties
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        traverse(item, `${currentPath}[${index}]`, depth + 1);
      });
    } else {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        traverse(value, newPath, depth + 1);
      }
    }
  }

  traverse(event.payload, "payload", 0);
  return paths;
}

/**
 * Shreds (redacts) all marked PII fields in a fat event.
 *
 * Replaces all __shred-marked fields with structured RedactedValue objects
 * preserving type metadata. Returns a ShredResult containing
 * the redacted event and an audit trail for GDPR compliance.
 *
 * This operation is irreversible and should only be performed when
 * processing a GDPR deletion request.
 *
 * @param event - The fat event to shred
 * @param correlationId - Optional correlation ID linking to the erasure request
 * @returns ShredResult containing the shredded event and audit trail
 * @throws Error if maximum traversal depth is exceeded (DoS protection)
 *
 * @example
 * ```typescript
 * const event = createFatEvent("OrderSubmitted", {
 *   orderId: "ord_123",
 *   customer: {
 *     id: "c1",
 *     email: { value: "alice@example.com", __shred: true },
 *   },
 * });
 *
 * const { event: shredded, audit } = shredEvent(event, "erasure-req-123");
 * // shredded.payload.customer.email === { __redacted: true, originalType: "string", redactedAt: ... }
 * // audit.fieldsShredded === ["payload.customer.email"]
 * // audit.correlationId === "erasure-req-123"
 * ```
 */
export function shredEvent<T>(event: FatEvent<T>, correlationId?: string): ShredResult {
  // First, find all shreddable fields for the audit trail
  const fieldsShredded = findShreddableFields(event);
  // Use WeakMap to cache redacted clones - prevents PII leakage when
  // the same object is referenced from multiple paths
  const visited = new WeakMap<object, unknown>();

  function shredValue(value: unknown, depth: number): unknown {
    // DoS protection
    if (depth > MAX_TRAVERSAL_DEPTH) {
      throw new Error(
        `Maximum traversal depth (${MAX_TRAVERSAL_DEPTH}) exceeded during shredding. ` +
          `This may indicate a malformed payload or potential DoS attack.`
      );
    }

    if (value === null || typeof value !== "object") {
      return value;
    }

    // If this is a shreddable field, replace with structured RedactedValue
    if (isShreddableField(value)) {
      return createRedactedValue(value.value);
    }

    // Check if we've already processed this object (cycle/shared reference)
    const cached = visited.get(value as object);
    if (cached !== undefined) {
      return cached; // Return cached redacted clone to prevent PII leakage
    }

    // Recurse into arrays - create placeholder first to handle cycles
    if (Array.isArray(value)) {
      const arr: unknown[] = [];
      visited.set(value, arr);
      value.forEach((item, index) => {
        arr[index] = shredValue(item, depth + 1);
      });
      return arr;
    }

    // Recurse into objects - create placeholder first to handle cycles
    const result: Record<string, unknown> = {};
    visited.set(value, result);
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = shredValue(val, depth + 1);
    }
    return result;
  }

  const shreddedEvent: FatEvent<unknown> = {
    type: event.type,
    payload: shredValue(event.payload, 0),
    metadata: { ...event.metadata },
  };

  const audit: ShredResult["audit"] = {
    shreddedAt: Date.now(),
    fieldsShredded,
    eventType: event.type,
  };
  if (correlationId !== undefined) {
    audit.correlationId = correlationId;
  }

  return {
    event: shreddedEvent,
    audit,
  };
}

/**
 * Checks if a fat event contains any shreddable fields.
 *
 * Optimized for early exit - returns as soon as first shreddable field is found.
 * Use this for quick checks when you don't need the full list of paths.
 *
 * @param event - The fat event to check
 * @returns True if any fields are marked for shredding
 * @throws Error if maximum traversal depth is exceeded (DoS protection)
 */
export function hasShreddableFields(event: FatEvent): boolean {
  const visited = new WeakSet<object>();

  function hasAny(obj: unknown, depth: number): boolean {
    // DoS protection
    if (depth > MAX_TRAVERSAL_DEPTH) {
      throw new Error(`Maximum traversal depth (${MAX_TRAVERSAL_DEPTH}) exceeded.`);
    }

    if (obj === null || typeof obj !== "object") {
      return false;
    }

    // Circular reference protection
    if (visited.has(obj)) {
      return false;
    }
    visited.add(obj);

    // Check if this object is a shreddable field
    if (isShreddableField(obj)) {
      return true;
    }

    // Recurse into arrays - short-circuit on first match
    if (Array.isArray(obj)) {
      return obj.some((item) => hasAny(item, depth + 1));
    }

    // Recurse into objects - short-circuit on first match
    return Object.values(obj as Record<string, unknown>).some((val) => hasAny(val, depth + 1));
  }

  return hasAny(event.payload, 0);
}

/**
 * Counts the number of shreddable fields in an event.
 *
 * @param event - The fat event to check
 * @returns The count of fields marked for shredding
 * @throws Error if maximum traversal depth is exceeded (DoS protection)
 */
export function countShreddableFields(event: FatEvent): number {
  return findShreddableFields(event).length;
}

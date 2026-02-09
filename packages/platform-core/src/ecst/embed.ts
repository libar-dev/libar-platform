/**
 * Entity Embedding Helpers - Snapshot entity data into fat events
 *
 * @libar-docs
 * @libar-docs-implements EcstFatEvents
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 *
 * Helper functions for embedding entity data into fat events.
 * Enables selective field inclusion and crypto-shredding markers.
 */

import type { EmbedOptions, EmbeddedEntity, ShreddableField } from "./types.js";

/**
 * Embeds selected fields from an entity into a fat event payload.
 *
 * Enables selective embedding of entity data - only include fields that
 * downstream consumers actually need, avoiding data bloat and potential
 * security concerns.
 *
 * @param entity - The source entity to embed
 * @param fields - Optional array of field names to include (all fields if omitted)
 * @param options - Optional configuration for privacy markers and required fields
 * @returns An embedded entity with selected fields (some may be wrapped as ShreddableField)
 * @throws Error if a requested field doesn't exist on the entity
 * @throws Error if a field is marked as both shred and required
 *
 * @example
 * ```typescript
 * const customer = { id: "c1", name: "Alice", email: "a@x.com", internalNotes: "VIP" };
 *
 * // Embed only needed fields
 * embedEntity(customer, ["id", "name", "email"]);
 * // Result: { id: "c1", name: "Alice", email: "a@x.com" }
 *
 * // Embed all fields
 * embedEntity(customer);
 * // Result: { id: "c1", name: "Alice", email: "a@x.com", internalNotes: "VIP" }
 *
 * // With crypto-shredding marker
 * embedEntity(customer, ["id", "name", "email"], { shred: ["email"] });
 * // Result: { id: "c1", name: "Alice", email: { value: "a@x.com", __shred: true } }
 *
 * // With required field protection (prevents accidental shredding of critical fields)
 * embedEntity(customer, ["id", "name", "email"], { shred: ["email"], required: ["id"] });
 * // Result: { id: "c1", name: "Alice", email: { value: "a@x.com", __shred: true } }
 * // (id is protected from being shredded)
 * ```
 */
export function embedEntity<T extends object>(
  entity: T,
  fields?: (keyof T)[],
  options?: EmbedOptions<T>
): EmbeddedEntity<T> {
  // Use Set<string> since we compare with String(key) for consistency
  const shredFields = new Set<string>(options?.shred ?? []);

  // If no fields specified, use all keys from entity
  const keysToEmbed = fields ?? (Object.keys(entity) as (keyof T)[]);
  const keysToEmbedSet = new Set(keysToEmbed.map(String));

  // Validate required fields are not in shred list
  if (options?.required && options?.shred) {
    const shredSet = new Set(options.shred);
    for (const requiredField of options.required) {
      if (shredSet.has(requiredField)) {
        throw new Error(
          `Field '${requiredField}' is marked as required and cannot be shredded. ` +
            `Remove it from either 'shred' or 'required' option.`
        );
      }
    }
  }

  // Validate shred fields exist in either the entity or selected fields
  if (options?.shred) {
    const entityKeys = new Set(Object.keys(entity));
    for (const shredField of options.shred) {
      // Check if shred field is in the selected fields (if fields specified)
      // or exists on the entity (if embedding all fields)
      const isInSelectedFields = keysToEmbedSet.has(shredField);
      const existsOnEntity = entityKeys.has(shredField);

      if (!isInSelectedFields) {
        if (!existsOnEntity) {
          throw new Error(
            `Shred field '${shredField}' not found. ` +
              `Available fields: [${Array.from(entityKeys).join(", ")}]`
          );
        } else {
          throw new Error(
            `Shred field '${shredField}' exists on entity but is not in the selected fields to embed. ` +
              `Selected fields: [${Array.from(keysToEmbedSet).join(", ")}]`
          );
        }
      }
    }
  }

  const result: Record<string, unknown> = {};

  for (const key of keysToEmbed) {
    // Check if field exists on entity
    if (!(key in entity)) {
      throw new Error(`Field '${String(key)}' not found`);
    }

    const value = entity[key];

    // Apply shredding marker if requested
    if (shredFields.has(String(key))) {
      result[String(key)] = {
        value,
        __shred: true,
      } as ShreddableField<typeof value>;
    } else {
      result[String(key)] = value;
    }
  }

  return result as EmbeddedEntity<T>;
}

/**
 * Embeds a collection of entities into a fat event payload.
 *
 * Maps embedEntity over an array of entities, applying the same field
 * selection and privacy options to each item consistently.
 *
 * @param items - The collection of entities to embed
 * @param fields - Optional array of field names to include per item
 * @param options - Optional configuration for privacy markers and required fields
 * @returns An array of embedded entity snapshots
 *
 * @example
 * ```typescript
 * const items = [
 *   { productId: "p1", name: "Widget", quantity: 2, internalSku: "SKU123" },
 *   { productId: "p2", name: "Gadget", quantity: 1, internalSku: "SKU456" },
 * ];
 *
 * // Embed with field selection
 * embedCollection(items, ["productId", "name", "quantity"]);
 * // Result: [
 * //   { productId: "p1", name: "Widget", quantity: 2 },
 * //   { productId: "p2", name: "Gadget", quantity: 1 },
 * // ]
 *
 * // Empty collection returns empty array
 * embedCollection([]);
 * // Result: []
 * ```
 */
export function embedCollection<T extends object>(
  items: T[],
  fields?: (keyof T)[],
  options?: EmbedOptions<T>
): EmbeddedEntity<T>[] {
  return items.map((item) => embedEntity(item, fields, options));
}

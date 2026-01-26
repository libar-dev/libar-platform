/**
 * TS2589-Safe Function Reference Types.
 *
 * Provides type aliases that prevent "Type instantiation is excessively deep"
 * errors when working with Convex function references.
 *
 * @module @libar-dev/platform-core/function-refs
 */

export type { SafeMutationRef, SafeQueryRef, SafeActionRef } from "./types.js";

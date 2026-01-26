/**
 * CMS Repository module for dual-write command handlers.
 *
 * Provides a typed repository pattern that eliminates boilerplate
 * in command handlers:
 * - Automatic loading with index lookup
 * - Automatic upcasting (schema migrations)
 * - Typed NotFoundError and VersionConflictError
 * - Optimistic concurrency control on updates
 */

// Factory and interface
export { createCMSRepository, type CMSRepository } from "./CMSRepository.js";

// Types and errors
export type { CMSRepositoryConfig, RepositoryLoadResult } from "./types.js";
export { NotFoundError, VersionConflictError } from "./types.js";

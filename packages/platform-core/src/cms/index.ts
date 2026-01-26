// Types
export type {
  BaseCMS,
  TimestampedCMS,
  CMSUpcaster,
  CMSVersionConfig,
  CMSLoadResult,
} from "./types.js";

// Upcaster utilities and error types
export {
  createUpcaster,
  upcastIfNeeded,
  CMSUpcasterError,
  // Helper migration functions
  addCMSFieldMigration,
  renameCMSFieldMigration,
  removeCMSFieldMigration,
} from "./upcaster.js";

export type { CMSUpcasterErrorCode, CMSUpcastConfig, CMSMigration } from "./upcaster.js";

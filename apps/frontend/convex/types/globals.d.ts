/**
 * Global Type Augmentations
 *
 * Extends globalThis with custom properties used for test mode detection.
 * This allows type-safe access to __CONVEX_TEST_MODE__ without casting to any.
 */

declare global {
  /**
   * Flag set by convex-test to indicate test mode.
   * When true, certain infrastructure components (like Workpool) are replaced
   * with no-op implementations to allow unit testing without async processing.
   *
   * Set in: tests/support/setup.ts
   * Checked in: infrastructure.ts and various testing.ts files
   */
  // Using var is required for globalThis augmentation (not const/let)
  var __CONVEX_TEST_MODE__: boolean | undefined;
}

// This export makes this file a module, which is required for global augmentation
export {};

/**
 * Test Run Identifier for Integration Test Isolation
 *
 * Re-exports from platform-core for backward compatibility.
 * New code should import directly from @libar-dev/platform-core/testing.
 *
 * @deprecated Import from @libar-dev/platform-core/testing instead
 */

export {
  testRunId,
  withPrefix,
  generateTestRunId,
  withCustomPrefix,
} from "@libar-dev/platform-core/testing";

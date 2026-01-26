/**
 * Middleware Module
 *
 * Command pipeline middleware for validation, authorization, logging, and rate limiting.
 */

// Types
export type {
  Middleware,
  MiddlewareContext,
  MiddlewareCommandInfo,
  MiddlewareBeforeResult,
  MiddlewarePipelineOptions,
  AfterHookError,
  AfterHookErrorHandler,
  StructureValidationConfig,
  DomainValidator,
  DomainValidationConfig,
  AuthorizationResult,
  AuthorizationChecker,
  AuthorizationConfig,
  RateLimitResult,
  RateLimitChecker,
  RateLimitConfig,
  LoggingConfig,
} from "./types.js";

// Pipeline
export { MiddlewarePipeline, createMiddlewarePipeline } from "./MiddlewarePipeline.js";

// Structure Validation Middleware (order: 10)
export {
  STRUCTURE_VALIDATION_ORDER,
  createStructureValidationMiddleware,
  createRegistryValidationMiddleware,
} from "./structureValidation.js";

// Domain Validation Middleware (order: 20)
export {
  DOMAIN_VALIDATION_ORDER,
  createDomainValidationMiddleware,
  combineDomainValidators,
  CommonValidators,
} from "./domainValidation.js";

// Authorization Middleware (order: 30)
export {
  AUTHORIZATION_ORDER,
  createAuthorizationMiddleware,
  createRoleBasedChecker,
  createOwnerBasedChecker,
  combineAuthorizationCheckers,
  anyAuthorizationChecker,
} from "./authorization.js";

// Logging Middleware (order: 40)
export {
  LOGGING_ORDER,
  createLoggingMiddleware,
  createConvexLogger,
  createJsonLogger,
  createNoOpLogger,
} from "./logging.js";

// Rate Limiting Middleware (order: 50)
export { RATE_LIMIT_ORDER, createRateLimitMiddleware, RateLimitKeys } from "./rateLimit.js";

// Rate Limit Adapter (bridges to @convex-dev/rate-limiter)
export { createConvexRateLimitAdapter } from "./rateLimitAdapter.js";
export type { RateLimiterLike } from "./rateLimitAdapter.js";

/**
 * Standard middleware order constants.
 *
 * Use these to position custom middlewares relative to built-in ones.
 */
export const MIDDLEWARE_ORDER = {
  STRUCTURE_VALIDATION: 10,
  DOMAIN_VALIDATION: 20,
  AUTHORIZATION: 30,
  LOGGING: 40,
  RATE_LIMIT: 50,
} as const;

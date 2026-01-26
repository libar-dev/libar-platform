/**
 * Authorization Middleware
 *
 * RBAC integration point for command authorization.
 * Checks if the current user is allowed to execute the command.
 */
import type {
  Middleware,
  MiddlewareContext,
  MiddlewareBeforeResult,
  AuthorizationConfig,
  AuthorizationChecker,
  AuthorizationResult,
} from "./types.js";
import type { UnknownRecord } from "../types.js";

/** Middleware execution order for authorization */
export const AUTHORIZATION_ORDER = 30;

/**
 * Create an authorization middleware.
 *
 * Checks if the current user is authorized to execute commands.
 * Uses correlation chain context for user identification.
 *
 * @param config - Configuration with checker function
 * @returns A middleware that enforces authorization
 *
 * @example
 * ```typescript
 * const authMiddleware = createAuthorizationMiddleware({
 *   checker: async (ctx) => {
 *     const userId = ctx.custom.userId;
 *     if (!userId) {
 *       return { allowed: false, reason: "Authentication required" };
 *     }
 *     // Check user permissions for command type
 *     const hasPermission = await checkPermission(userId, ctx.command.type);
 *     return {
 *       allowed: hasPermission,
 *       reason: hasPermission ? undefined : "Insufficient permissions",
 *     };
 *   },
 *   skipFor: ["GetSystemHealth"], // System commands don't need auth
 * });
 * ```
 */
export function createAuthorizationMiddleware(config: AuthorizationConfig): Middleware {
  const skipSet = new Set(config.skipFor ?? []);

  return {
    name: "authorization",
    order: AUTHORIZATION_ORDER,

    async before(ctx: MiddlewareContext): Promise<MiddlewareBeforeResult> {
      const { command } = ctx;

      // Skip authorization for configured commands
      if (skipSet.has(command.type)) {
        return { continue: true, ctx };
      }

      const result = await config.checker(ctx);

      if (!result.allowed) {
        return {
          continue: false,
          result: {
            status: "rejected",
            code: "UNAUTHORIZED",
            reason: result.reason ?? "Not authorized to perform this action",
          },
        };
      }

      return { continue: true, ctx };
    },
  };
}

/**
 * Create a simple role-based authorization checker.
 *
 * @param rolePermissions - Map of command types to required roles
 * @param getUserRole - Function to get user's role from context
 * @returns An authorization checker function
 *
 * @example
 * ```typescript
 * const checker = createRoleBasedChecker(
 *   {
 *     CreateOrder: ["user", "admin"],
 *     CancelOrder: ["admin"],
 *     DeleteOrder: ["superadmin"],
 *   },
 *   (ctx) => ctx.custom.userRole as string | undefined
 * );
 * ```
 */
export function createRoleBasedChecker(
  rolePermissions: Record<string, string[]>,
  getUserRole: (ctx: MiddlewareContext) => string | undefined
): AuthorizationChecker {
  return async (ctx): Promise<AuthorizationResult> => {
    const requiredRoles = rolePermissions[ctx.command.type];

    // If no roles specified, allow by default
    if (!requiredRoles || requiredRoles.length === 0) {
      return { allowed: true };
    }

    const userRole = getUserRole(ctx);

    if (!userRole) {
      return {
        allowed: false,
        reason: "Authentication required",
      };
    }

    if (!requiredRoles.includes(userRole)) {
      return {
        allowed: false,
        reason: `Role '${userRole}' is not authorized for ${ctx.command.type}. Required: ${requiredRoles.join(" or ")}`,
      };
    }

    return { allowed: true };
  };
}

/**
 * Create an owner-based authorization checker.
 *
 * Allows users to only operate on their own resources.
 *
 * **Note:** This checker expects `ctx.custom["userRole"]` to contain the user's role
 * for admin bypass checking. Ensure your middleware pipeline populates this field.
 *
 * @param getResourceOwner - Function to get resource owner ID from args
 * @param getCurrentUserId - Function to get current user ID from context
 * @param adminRoles - Roles that bypass owner check
 * @returns An authorization checker function
 *
 * @example
 * ```typescript
 * const checker = createOwnerBasedChecker(
 *   (ctx) => ctx.command.args.ownerId as string,
 *   (ctx) => ctx.custom.userId as string,
 *   ["admin", "superadmin"]
 * );
 * ```
 */
export function createOwnerBasedChecker(
  getResourceOwner: (ctx: MiddlewareContext) => string | undefined,
  getCurrentUserId: (ctx: MiddlewareContext) => string | undefined,
  adminRoles: string[] = []
): AuthorizationChecker {
  const adminSet = new Set(adminRoles);

  return async (ctx): Promise<AuthorizationResult> => {
    const userId = getCurrentUserId(ctx);

    if (!userId) {
      return {
        allowed: false,
        reason: "Authentication required",
      };
    }

    // Check if user has admin role
    const userRole = (ctx.custom as UnknownRecord)["userRole"] as string | undefined;
    if (userRole && adminSet.has(userRole)) {
      return { allowed: true };
    }

    // Check ownership
    const ownerId = getResourceOwner(ctx);
    if (ownerId && ownerId !== userId) {
      return {
        allowed: false,
        reason: "Cannot access resources owned by other users",
      };
    }

    return { allowed: true };
  };
}

/**
 * Combine multiple authorization checkers.
 * All checkers must pass for authorization to succeed.
 *
 * @param checkers - Array of authorization checkers
 * @returns A combined checker that requires all to pass
 */
export function combineAuthorizationCheckers(
  checkers: AuthorizationChecker[]
): AuthorizationChecker {
  return async (ctx): Promise<AuthorizationResult> => {
    for (const checker of checkers) {
      const result = await checker(ctx);
      if (!result.allowed) {
        return result;
      }
    }
    return { allowed: true };
  };
}

/**
 * Create a checker that allows any of the given checkers to pass.
 *
 * @param checkers - Array of authorization checkers
 * @returns A combined checker that requires at least one to pass
 */
export function anyAuthorizationChecker(checkers: AuthorizationChecker[]): AuthorizationChecker {
  return async (ctx): Promise<AuthorizationResult> => {
    const reasons: string[] = [];

    for (const checker of checkers) {
      const result = await checker(ctx);
      if (result.allowed) {
        return { allowed: true };
      }
      if (result.reason) {
        reasons.push(result.reason);
      }
    }

    return {
      allowed: false,
      reason: reasons.join("; "),
    };
  };
}

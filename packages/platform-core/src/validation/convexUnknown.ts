import { v } from "convex/values";

/**
 * Compatibility shim for the tranche-2 boundary policy.
 *
 * The remediation plan standardizes on an "unknown + explicit validation"
 * boundary model, but the Convex version currently installed in this repo does
 * not yet expose a native `v.unknown()` helper. Until that lands upstream, use
 * the closest validator surface available here and pair it with explicit runtime
 * validation / byte-size caps.
 */
export const vUnknown = v.any;

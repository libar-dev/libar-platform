import type { UnknownRecord } from "./types.js";

/**
 * Marks an error that must abort the enclosing top-level Convex mutation.
 *
 * Ordinary handler errors may be translated into rejected command results, but
 * failures raised with this type must escape so Convex rolls back every write
 * that happened earlier in the mutation.
 */
export class TransactionAbortError extends Error {
  public override readonly name = "TransactionAbortError";

  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: UnknownRecord
  ) {
    super(message);
  }
}

export function isTransactionAbortError(error: unknown): error is TransactionAbortError {
  return error instanceof TransactionAbortError;
}

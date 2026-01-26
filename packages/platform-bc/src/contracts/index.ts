/**
 * Bounded Context Contracts
 *
 * TypeScript interfaces for formalizing bounded context definitions.
 */

export type { BoundedContextIdentity } from "./identity.js";
export type {
  DualWriteContextContract,
  ExtractCommandTypes,
  ExtractEventTypes,
  ExtractCMSTableNames,
} from "./dual-write-contract.js";

// Byte bounds shared by command parsing and context persistence.
import { getConvexSize } from "convex/values";
export const limitIdLength = 256;
export const limitActorIdLength = 512;
export function utf8Length(value: string): number {
  return getConvexSize(value) - 2;
}

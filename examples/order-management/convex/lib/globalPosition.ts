import { v } from "convex/values";
import {
  compareGlobalPositions,
  isGlobalPositionAfter,
  maxGlobalPosition,
  normalizeGlobalPosition,
  subtractGlobalPositions,
  type GlobalPosition,
  type GlobalPositionLike,
} from "@libar-dev/platform-core";

export const compatGlobalPositionValidator = v.union(v.number(), v.int64());

export {
  compareGlobalPositions,
  isGlobalPositionAfter,
  maxGlobalPosition,
  normalizeGlobalPosition,
  subtractGlobalPositions,
};

export type { GlobalPosition, GlobalPositionLike };

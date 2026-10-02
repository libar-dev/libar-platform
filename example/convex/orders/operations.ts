// The Orders context's sanctioned operation. It takes a list, so a parent use case makes one call.
import { v, type Infer, type ObjectType } from "convex/values";
import {
  defineOperation,
  planned,
  type StreamResult,
} from "../../../src/context/index.js";
import type { OrderResult } from "../../domain/index.js";
import { journal, orderLineValidator, orderStream } from "./streams.js";
const placeInput = {
  orders: v.array(
    v.object({ orderId: v.string(), lines: v.array(orderLineValidator) }),
  ),
};
const placeResult = v.object({
  orders: v.array(
    v.object({ orderId: v.string(), lineCount: v.number(), total: v.number() }),
  ),
});
// Each order is placed at expected version 0, so a second place of the same order ID is answered
// entityExists before its decider runs.
export const place = defineOperation<
  ObjectType<typeof placeInput>,
  Infer<typeof placeResult>
>(journal, {
  name: "place",
  streams: [orderStream],
  input: placeInput,
  returns: placeResult,
  plan: ({ orders }) =>
    orders.map(({ orderId, lines }) =>
      planned(orderStream, orderId, { commandType: "place", lines }, 0),
    ),
  combine: (results: readonly StreamResult<unknown>[]) => ({
    orders: results.map((result) => ({
      orderId: result.version.streamId,
      ...(result.result as OrderResult),
    })),
  }),
  maxStreams: 32,
});

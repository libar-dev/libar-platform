// The Orders context's sanctioned operations. Each takes a list, so a parent use case makes one call.
import { v, type Infer, type ObjectType } from "convex/values";
import {
  defineOperation,
  planned,
  type StreamResult,
} from "../../../src/context/index.js";
import type { OrderResult } from "../../domain/index.js";
import {
  journal,
  orderLineValidator,
  orderStream,
  type OrderDto,
} from "./streams.js";
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
const cancelInput = { orders: v.array(v.object({ orderId: v.string() })) };
const cancelResult = v.object({
  orders: v.array(
    v.object({ orderId: v.string(), lines: v.array(orderLineValidator) }),
  ),
});
// Each order is cancelled with no expected version, so its own state decides: an order with no event
// is refused orderNotFound and a cancelled one orderAlreadyCancelled. Each cancelled order's lines
// come from its DTO, for the use case to release.
export const cancel = defineOperation<
  ObjectType<typeof cancelInput>,
  Infer<typeof cancelResult>
>(journal, {
  name: "cancel",
  streams: [orderStream],
  input: cancelInput,
  returns: cancelResult,
  plan: ({ orders }) =>
    orders.map(({ orderId }) =>
      planned(orderStream, orderId, { commandType: "cancel" }),
    ),
  combine: (results) => ({
    orders: results.map((result) => ({
      orderId: result.version.streamId,
      lines: (result.dto as OrderDto).lines,
    })),
  }),
  maxStreams: 32,
});

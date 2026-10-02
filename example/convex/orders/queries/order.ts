// The Orders context's queries over its order stream: one definer each.
import { defineGet, defineList } from "../../../../src/context/index.js";
import { journal, orderStream } from "../streams.js";
export const get = defineGet(journal, orderStream);
export const list = defineList(journal, orderStream);

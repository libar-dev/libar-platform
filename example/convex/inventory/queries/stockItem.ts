// The Inventory context's queries over its stock item stream: one definer each.
import { defineGet, defineList } from "../../../../src/context/index.js";
import { journal, stockItemStream } from "../streams.js";
export const get = defineGet(journal, stockItemStream);
export const list = defineList(journal, stockItemStream);

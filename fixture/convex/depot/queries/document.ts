// The depot's queries over its document stream, as a context registers them: one definer each.
/**
 * @sdpAnchor impl:context.context-component.depot-document-query
 * @sdpLabel the depot fixture's document query
 * @sdpReferences spec:context.context-component
 */
import { defineGet, defineList } from "../../../../src/context/index.js";
import { documentStream, journal } from "../streams.js";
export const get = defineGet(journal, documentStream);
export const list = defineList(journal, documentStream);

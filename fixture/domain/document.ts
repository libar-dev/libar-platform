// The fixture's document stream: a small state machine, used through the kernel's transition table.
import {
  transition,
  type DecideResult,
  type Decider,
  type DecisionContext,
  type DomainEvent,
  type Transitions,
} from "../../src/kernel/index.js";
// none is a stream with no events yet, the status initial() returns.
export type DocumentStatus = "none" | "draft" | "submitted" | "shipped";
export type DocumentTrigger = "create" | "submit" | "ship" | "amend";
export type DocumentState = {
  status: DocumentStatus;
  title: string;
  amendments: number;
};
export type DocumentCommand =
  | { commandType: "create"; title: string }
  | { commandType: "submit" }
  | { commandType: "ship" }
  | { commandType: "amend"; title: string };
export type DocumentEvent =
  | DomainEvent<"created", { title: string }>
  | DomainEvent<"submitted", Record<string, never>>
  | DomainEvent<"shipped", Record<string, never>>
  | DomainEvent<"amended", { title: string }>;
// The status the command moved the document to.
export type DocumentResult = { status: DocumentStatus };
export const documentRejectionCodes = {
  // Any command whose trigger the transition table has no entry for in the current status: ship from draft, submit twice, amend once shipped.
  invalidTransition: "invalidTransition",
  // create or amend with a title that is empty or only whitespace.
  titleRequired: "titleRequired",
} as const;
export const documentTransitions: Transitions<DocumentStatus, DocumentTrigger> =
  {
    none: { create: "draft" },
    draft: { submit: "submitted", amend: "draft" },
    submitted: { ship: "shipped", amend: "submitted" },
    shipped: {},
  };
const eventSchemaVersion = 1;
function decide(
  state: DocumentState,
  command: DocumentCommand,
  context: DecisionContext,
): DecideResult<DocumentEvent, DocumentResult> {
  const next = transition(
    documentTransitions,
    state.status,
    command.commandType,
  );
  if (next === undefined)
    return {
      kind: "rejection",
      rejection: {
        code: documentRejectionCodes.invalidTransition,
        message: `A document cannot ${command.commandType} from ${state.status}`,
        details: { from: state.status, trigger: command.commandType },
      },
    };
  if ("title" in command && command.title.trim() === "")
    return {
      kind: "rejection",
      rejection: {
        code: documentRejectionCodes.titleRequired,
        message: "A document needs a title",
      },
    };
  return {
    kind: "applied",
    events: [toEvent(command, context.now)],
    result: { status: next },
  };
}
function toEvent(command: DocumentCommand, occurredAt: number): DocumentEvent {
  switch (command.commandType) {
    case "create":
      return {
        eventType: "created",
        eventSchemaVersion,
        payload: { title: command.title },
        occurredAt,
      };
    case "submit":
      return {
        eventType: "submitted",
        eventSchemaVersion,
        payload: {},
        occurredAt,
      };
    case "ship":
      return {
        eventType: "shipped",
        eventSchemaVersion,
        payload: {},
        occurredAt,
      };
    case "amend":
      return {
        eventType: "amended",
        eventSchemaVersion,
        payload: { title: command.title },
        occurredAt,
      };
  }
}
function evolve(state: DocumentState, event: DocumentEvent): DocumentState {
  switch (event.eventType) {
    case "created":
      return { status: "draft", title: event.payload.title, amendments: 0 };
    case "submitted":
      return { ...state, status: "submitted" };
    case "shipped":
      return { ...state, status: "shipped" };
    case "amended":
      return {
        ...state,
        title: event.payload.title,
        amendments: state.amendments + 1,
      };
  }
}
export const documentDecider: Decider<
  DocumentState,
  DocumentCommand,
  DocumentEvent,
  DocumentResult
> = {
  streamType: "document",
  initial: () => ({ status: "none", title: "", amendments: 0 }),
  decide,
  evolve,
  invariants: [
    {
      name: "aCreatedDocumentHasATitle",
      holds: (state) => state.status === "none" || state.title.trim() !== "",
    },
  ],
};

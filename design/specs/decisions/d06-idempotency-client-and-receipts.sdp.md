---
id: spec:decisions.d06-idempotency-client-and-receipts
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:decisions.d04-four-outcomes
    - spec:decisions.d07-rejections-thrown-not-stored
  constrainedBy:
    - spec:laws.law04-server-scoped-idempotency-key
    - spec:facts.f05-react-client-retries-until-confirmed
    - spec:facts.f06-client-mutations-run-in-order
---
# Convex covers UI retries, receipts cover the rest

Provenance: changed by the review. Feature · Traces: D6, Law 4, Law 5, F5, F6, Probe 1, Sc L1-3, Sc L1-4, Sc L1-5, Sc L1-9.

The Convex React client retries a mutation until it is confirmed, and the backend executes each mutation call once. A lost response to a UI command is already handled. v0.1 required a client request key and a receipt on every public command, which repeats that guarantee. Receipts are now required only where the guarantee does not reach, and a UI double submit, which is two separate calls, is covered for creates by a client-generated entity ID and a uniqueness check. The receipt rules carried from v0.1 apply wherever a receipt exists. The decision depends on D4 and D7 because a rejected command stores nothing, so its key stays unused.

## Intent

- problem: A non-UI caller sends the same command concurrently and again after a lost response; a key is reused with changed input; a rate refusal is followed by a retry of the same intent; the UI submits the same create twice (Sc L1-3, Sc L1-4, Sc L1-5, Sc L1-9)
- outcome: Each business intent executes once: the Convex client guarantee covers UI commands, receipts cover every caller it does not reach, and creates use a client-generated ID with a uniqueness check (D6)
- value: Public UI commands carry no receipt write, and where receipts exist they are thin, so no result format has to stay decodable for the retry window (D6)
- risk: The standing cost is one receipts table in the parent, one read-check-insert per receipted command, an explicit expiry policy and a tombstone for irreversible commands (D6)
- assumption: The React client retries mutations until confirmed and the backend executes each call once (F5)
- assumption: React and Rust clients run one client's mutations one at a time, in order (F6)

### Open questions

- [non-blocking] Probe 1 ran on 2026-10-01: the guarantee holds across a backend restart, a closed client leaves its mutation executed once or not at all, and the HTTP client does not retry; `ConvexHttpClient` is a Convex client the guarantee does not reach, so whether its callers join the callers that need receipts is the owner's ruling (Probe 1, D6)

## Decision

- context: The concern is retries producing one business effect; Convex gives the React client's retry until confirmation with single execution on the backend, and an ordered per-client mutation queue (D6, F5, F6)
- alternative: Do nothing beyond Convex: rely on the client guarantee for every caller; chosen for UI commands and rejected for HTTP actions, webhooks, mutations called from actions, workers, workflow steps, agents and any caller that is not a Convex client, which the guarantee does not reach (D6, Decision method rule 2)
- alternative: v0.1's rule, a client request key and a receipt on every public command; rejected, because it repeats the guarantee Convex already gives (D6)
- alternative: Full-result receipts that store the original response; rejected, because stored results force every result format to stay decodable for the whole retry window, and the client reads state through reactive queries anyway (D6)
- alternative: Thin receipts only where the guarantee does not reach, with the rules carried from v0.1; this is the option chosen (D6)
- decision: Receipts are required for HTTP actions and webhooks, mutations called from actions, workers, workflow steps and agents, and any caller that is not a Convex client; a UI double submit on a create is covered by a client-generated entity ID plus a uniqueness check; the receipt rules carried from v0.1 apply where receipts exist (D6)
- rationale: The Convex React client retries a mutation until it is confirmed and the backend executes each mutation call once, so a lost response to a UI command is already handled (D6, F5)
- rationale: A UI double submit is two separate mutation calls, outside the guarantee, and for creates a client-generated entity ID plus a uniqueness check covers it (D6, F6, Sc L1-4)
- consequence: The server builds the key from tenant, caller namespace, command type and request key; a public caller cannot choose a system namespace (D6, Law 4)
- consequence: The fingerprint covers business input and its contract version, not retry timestamps; the same key with different input is a conflict (D6, Sc L1-5)
- consequence: Authorization is checked again before a stored outcome is disclosed (D6, Law 5)
- consequence: Expiry is explicit; an irreversible command keeps a compact tombstone or relies on a domain uniqueness rule (D6)
- consequence: One transaction reads, checks and inserts the receipt, so concurrent identical requests serialize and only one effect commits; a single-transaction command needs no pending state (D6, Sc L1-3)
- consequence: Rate admission for new intent runs after a duplicate is recognized, so a valid retry is never refused for capacity (D6, Sc L1-9)
- consequence: Receipts are thin: outcome, operation ID, affected IDs and stream versions, never the full original result (D6)
- consequence: A rejected command stores nothing, so its key stays unused (D6, D7)
- consequence: Law 4 is reworded to match: every command a caller can retry outside the Convex client's own retry carries a server-scoped idempotency key (D6, Law 4)
- consequence: The standing cost is one receipts table, one indexed read and one insert per receipted command, an expiry policy and tombstones (D6)

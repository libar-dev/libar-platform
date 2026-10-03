---
id: spec:obligations.do-nothing-check
kind: decision
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  dependsOn:
    - spec:facts.probe-plan
    - spec:decisions.d13-deferred-work-is-an-obligation
  constrainedBy:
    - spec:laws.law08-durable-capability-ships-operations
    - spec:facts.f08-scheduling-commits-with-mutation
    - spec:facts.f09-scheduled-mutation-and-action-retry-semantics
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
    - spec:facts.f13-transactions-have-limits
    - spec:facts.f16-scheduled-functions-table-shows-failed-runs
---
# Do-nothing check at obligation activation

Provenance: new in the doc, carried here as the activation ruling. Layer 3 · Traces: D13, D19, F12, F16, Probe 7, Decision method rule 2, Decision method rule 3.

Before the obligation module is built, the do-nothing option is checked against the Layer 3 scenarios: a plain scheduled mutation for each local reaction plus a scan of `_scheduled_functions` for failed runs. The doc says the obligation table earns its cost through four things: restore, since backups exclude scheduled functions; retention past the system table's window; business visibility; and operator exits. The recheck of 2026-09-30 found the system table's states and its 7-day retention documented, which settles half of Probe 7 in favour of the do-nothing option being at least possible for local reactions. The other half, what a restore leaves of scheduler, Workpool and Workflow state, is still open and is what the probe must show before this ruling stands.

## Intent

- outcome: The obligation table is built only if the do-nothing option fails a Layer 3 scenario, and the failure is recorded here with the probe result that showed it (D13, Decision method rule 3)
- value: A passing do-nothing option would remove a table, six states, a wrapper, a sweeper and five operations for local reactions (D13, Probe 7)
- risk: The check is made on the pinned Convex version and must be repeated when it changes, because the system table's states and retention are documented but not contractual (F16)

### Open questions

- [non-blocking] Probe 7 observes a plain scheduled local reaction and all five states on the pinned native backend; a failed-function scan counts zero documents and bytes but exhausts the 4096-read allowance at 4092 total rows; fresh CLI replacement leaves no scheduler intent, while replacement in place preserves later intent outside restored data; seven-day expiry, hosted dashboard restore, Workpool and Workflow remain open, and the owner confirmed D13 on these observations (Probe 7, F12, F16, F13)

## Decision

- context: The concern is a local reaction that must happen after a transaction; Convex gives a scheduled mutation that commits with the caller and runs exactly once, a system table that shows its state for 7 days, and backups that exclude pending scheduled functions (D13, F8, F9, F12, F16)
- alternative: Do nothing beyond Convex: schedule the reaction as a plain mutation from the command and scan `_scheduled_functions` for failed runs; checked first against Sc L3-1 to Sc L3-4 and Sc L3-7, Sc L3-8; it passes Sc L3-1 through exactly-once execution and fails Sc L3-7 because fresh CLI replacement leaves no pending scheduled function to rerun and in-place replacement can retain intent outside restored data, fails Sc L3-8 because the system table forgets a run after 7 days, and fails Sc L3-4 because a failed run has no operator exit and no business meaning (D13, F9, F12, F16, Decision method rule 2)
- alternative: A copy of every event consumed by workers, an outbox; rejected because an obligation is not a copy of every event (D13)
- alternative: The obligation table with one lifecycle, a wrapper, a sweeper, retention and operator operations; this is the option chosen for the durable profile, subject to Probe 7 (D13)
- decision: The obligation module is activated on its trigger only after Probe 7 has run, and the check is made once for the durable profile, not per reaction: the do-nothing option is rejected for the profile because it fails Sc L3-4, Sc L3-7 and Sc L3-8 as the first alternative records, so every local reaction of an installed durable profile is an obligation and none stays a plain scheduled mutation; the table earns its cost through restore, retention past the system table's window, business visibility and operator exits (D13, Law 8, Probe 7)
- rationale: Only a failing scenario justifies a mechanism, and the cheapest mechanism that passes wins; the four reasons are each a scenario the plain scheduled mutation fails (Decision method rule 3, D13)
- rationale: The system table is read-only metadata for 7 days; it cannot hold business evidence, a stored authority, or an operator's repair (F16, D13)
- consequence: Every local reaction of the durable profile is an obligation and ships the module's recovery, inspection and retention, as Law 8 requires of every installed durable capability; the plain scheduled mutations that remain are the platform's own maintenance batches, rebuild, baseline migration and restore checks, which are operator operations and not deferred business work (D13, Law 8)
- consequence: The probe result is recorded on `spec:facts.f16-scheduled-functions-table-shows-failed-runs` and on `spec:facts.f12-backups-exclude-pending-scheduled-functions`, and the owner confirmed the decision on them (Probe 7, Fact ledger)
- consequence: The standing cost when the profile is activated is the one D13 lists; while the durable profile is not installed, or if Probe 7 lets the do-nothing option stand for the profile, the cost is the scan of the system table, bounded by the scanned-documents ceiling and measured by the probe (D13, F13)

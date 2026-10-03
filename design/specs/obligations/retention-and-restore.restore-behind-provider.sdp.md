---
id: spec:obligations.retention-and-restore.restore-behind-provider
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:obligations.retention-and-restore
  verifies: spec:obligations.retention-and-restore
---
# Restore while provider state has moved past the backup

Sc L3-7 · native backend tier · production composition.

## Intent

- outcome: Dispatch waits until the gap is reconciled; identities stay stable. (Sc L3-7)

```gwt
Given an obligation is {status: "running"} with provider key {key: "eff-7"}
And a backup was taken and afterwards the provider {providerMoved: "confirmed the effect"}
And the module operation under test is {operation: "restore"}
When the module operation runs
Then external dispatch {dispatch: "waits until the gap is reconciled"}
And the obligation identity and provider key are {identities: "unchanged"}
And the obligation evidence {evidence: "survives"}
And irreversible provider effects number {effects: 1}
```

## Verification — executable

- Runs in the native backend tier on the production composition; every test owns its disposable backend.
- The test takes a backup with the obligation running under policy `reconcile first`, lets the provider stub confirm the effect after the backup, restores with `OBLIGATIONS_DISPATCH` off, and asserts no provider call is made and no call-mode claim proceeds until the switch is on, while the reconcile attempt that `rebuildSchedules` claims runs with the switch off (D19, F12).
- The test asserts the obligation's `_id`, `effectKey` and `providerKey` after restore equal those before, and that the reconcile pass settles it succeeded from the provider's evidence without a second call (D19, D14).
- The test runs `sweep` for several ticks, more than the rearm bound, with the switch still off and a second, pending external obligation in the backup, and asserts that this obligation's `rearmCount`, `attemptNumber` and status are unchanged after the ticks, that its dispatch row is a pending `claimAttempt` with its own attempt ID, and that it settles succeeded within a minute of the switch turning on (D19, E-56, Sc L3-7).
- The test asserts the provider stub recorded exactly one irreversible effect (Sc L3-7).

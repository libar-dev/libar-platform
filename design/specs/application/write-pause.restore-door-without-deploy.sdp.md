---
id: spec:application.write-pause.restore-door-without-deploy
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.write-pause
  verifies: spec:application.write-pause
---
# The restore door closes and opens with no deploy

E-42 · native backend tier · fixture composition · no acceptance row; the example shows, on the pinned backend release, that a change of the deployment's environment reaches the next function run, which the restore door rests on.

## Intent

- outcome: Setting `MAINTENANCE_MODE` to `restore` on a running deployment refuses the next write with no deploy, and another value lets the refused request keys apply. (E-42, F12)

```gwt
Given a disposable backend running the fixture composition, where a caller in each of {tenants: 2} tenants holds a grant and one command has applied
When an operator sets the environment variable MAINTENANCE_MODE to {value: "restore"} with admin access and deploys nothing
Then each tenant's next command is refused with the message {message: "write paused for all: restore"}
And the internal entry is refused with the same message {internalRefused: true}
And the gate read by getGate answers restore {restore: true}
And once the variable is set to {reopen: "off"} each refused request key applies {applied: true}
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- The test sets the variable through the admin API's update of environment variables, with no deploy between the change and the next call, and asserts the refusal's data exactly, `{ kind: "transient", code: "writePaused", message }`, and that no receipt beyond the first command's exists while the door is closed.
- The test also sets the value `Restore` and asserts that `getGate` answers `restore` false, because only the exact value closes the door.
- The observation is of the pinned release and is read again when the pin moves.

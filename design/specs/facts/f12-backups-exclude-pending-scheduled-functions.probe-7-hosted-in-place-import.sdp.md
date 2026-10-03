---
id: spec:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-hosted-in-place-import
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f12-backups-exclude-pending-scheduled-functions
  verifies: spec:facts.f12-backups-exclude-pending-scheduled-functions
---
# Probe 7: replacement in place on a hosted deployment preserves schedules that run against restored data

Probe 7 · native backend tier · temporary copy of the fixture composition · hosted deployment.

## Intent

- outcome: CLI export and replacement import in place on a hosted deployment restore the exported documents and keep the destination's scheduler rows, as the local backend does. (Probe 7, F12, E-59)

```gwt
Given the hosted deployment running the hosted driver's temporary copy of the fixture composition, which adds the scheduler references and reactions of the local in-place example
When it exports business documents and five scheduler states with the deploy key, adds documents and schedules, then imports the backup archive in place before pending reactions are due
Then documents including ids and creation times in {scopes: "parent and every mounted component"} equal the exported documents {equal: true}
And every scheduler row in each scope is unchanged {unchanged: true}
And later business changes are gone {removed: true} and the destination environment is unchanged {environmentUnchanged: true}
And kept reactions read {value: "exported"} no earlier than their scheduled time {onTime: true}
And each restored scheduler reference resolves to the kept row {found: true} and cancellation leaves state {state: "canceled"}
```

## Verification — executable

- Runs second in the hosted driver, after F16's retention example; it starts no local backend.
- The copy is the one the retention example ran on, so the table `plantedSchedules` stays in the export and the import restores it as it was at the export.
- The bound values are what the local backend showed on F12; a hosted answer that differs is a finding on F12.
- The test changes business data before the import and fails if it does not reach that boundary; every kept pending schedule is let run before the test ends, so that no later example finds it pending.
- Hosted dashboard restore is not run: the deploy key reaches the deployment through the CLI's export and import only. The fresh-destination case needs a second deployment and is not run.

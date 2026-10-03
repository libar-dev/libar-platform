// The hosted driver: the four examples that run on the one hosted deployment, in this order, under
// npm run test:hosted alone. The retention example reads before anything is deployed or imported;
// the replacement in place runs on the copy it deployed; the production composition's acceptance
// deploys that composition; Probe 3 deploys the copy again and leaves it for the next run.
import { isDeepStrictEqual } from "node:util";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect, vi } from "vitest";
import { probe3HostedFunctionCallsContract } from "../../generated/contracts/facts.f04-nested-calls-cost-more-than-helpers.probe-3-hosted-function-calls.contract.js";
import { probe7HostedInPlaceImportContract } from "../../generated/contracts/facts.f12-backups-exclude-pending-scheduled-functions.probe-7-hosted-in-place-import.contract.js";
import { probe7HostedRetentionContract } from "../../generated/contracts/facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-hosted-retention.contract.js";
import { hostedDeploymentAcceptsProductionCompositionContract } from "../../generated/contracts/platform.native-harness.hosted-deployment-accepts-production-composition.contract.js";
import { required } from "../../harness/native.js";
import {
  acceptanceDeployment,
  deployAndPlace,
  earlierRecorded,
  hostedInPlace,
  inPlaceDeployment,
  ownStates,
  placeOrderRecords,
  quotaDeployment,
  quotaSets,
  readThenPlant,
  retentionDeployment,
  runId,
  type AcceptanceWorld,
  type InPlaceWorld,
  type QuotaWorld,
  type RetentionWorld,
} from "./examples.js";
const retentionAnchor = specTest({
  id: testAnchorId(
    "test:facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-hosted-retention",
  ),
  verifies: ref(
    "spec:facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-hosted-retention",
  ),
});
void retentionAnchor;
const inPlaceAnchor = specTest({
  id: testAnchorId(
    "test:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-hosted-in-place-import",
  ),
  verifies: ref(
    "spec:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-hosted-in-place-import",
  ),
});
void inPlaceAnchor;
const acceptanceAnchor = specTest({
  id: testAnchorId(
    "test:platform.native-harness.hosted-deployment-accepts-production-composition",
  ),
  verifies: ref(
    "spec:platform.native-harness.hosted-deployment-accepts-production-composition",
  ),
});
void acceptanceAnchor;
const quotaAnchor = specTest({
  id: testAnchorId(
    "test:facts.f04-nested-calls-cost-more-than-helpers.probe-3-hosted-function-calls",
  ),
  verifies: ref(
    "spec:facts.f04-nested-calls-cost-more-than-helpers.probe-3-hosted-function-calls",
  ),
});
void quotaAnchor;
vi.setConfig({ testTimeout: 900000 });

bindExample(probe7HostedRetentionContract, (): RetentionWorld => ({}), {
  "the hosted deployment running the hosted driver's temporary copy of the fixture composition, which keeps the parent's schedules earlier runs planted and, in the table `plantedSchedules`, a planting record for each that names the run that planted it":
    (world) => retentionDeployment(world),
  "a run reads `plantedSchedules` and the parent's `_scheduled_functions` before it deploys or imports anything, then plants one succeeded, one failed and one canceled schedule":
    (world) => readThenPlant(world),
  "each planting record is recorded with its age and whether its schedule was read {recorded}":
    (world, { recorded }) => earlierRecorded(world, recorded),
  "the run's own schedules are read in states {states} each with a `completedTime` {completedTime}":
    (world, { states, completedTime }) =>
      ownStates(world, states, completedTime),
});

// The scopes the copy mounts: the parent and every component of the fixture composition, the
// migrations component the depot mounts included.
const copyMounts = [
  "parent",
  "annex",
  "annexClock",
  "migrations",
  "depot",
  "depot/migrations",
  "yard",
];
type InPlace = InPlaceWorld & {
  observation?: Awaited<ReturnType<typeof hostedInPlace>>;
};
const observed = (world: InPlace) =>
  required(world.observation, "the replacement in place");
bindExample(probe7HostedInPlaceImportContract, (): InPlace => ({}), {
  "the hosted deployment running the hosted driver's temporary copy of the fixture composition, which adds the scheduler references and reactions of the local in-place example":
    (world) => inPlaceDeployment(world),
  "it plants business documents and five scheduler states, exports with the deploy key a backup archive that holds no scheduler table, adds documents and schedules, imports the backup archive in place before pending reactions are due, and reads the five states after the import":
    async (world) => {
      world.observation = await hostedInPlace(
        required(world.backend, "the hosted backend"),
        required(world.directory, "the archive directory"),
        { id: runId() },
      );
    },
  "documents including ids and creation times in {scopes} equal the exported documents {equal}":
    (world, { scopes, equal }) => {
      const o = observed(world);
      expect(scopes).toBe("parent and every mounted component");
      // A key is scope/table, and a nested scope holds a slash of its own.
      const read = new Set(
        Object.keys(o.exported).map((key) =>
          key.slice(0, key.lastIndexOf("/")),
        ),
      );
      expect(read).toEqual(new Set(copyMounts));
      expect(isDeepStrictEqual(o.restored, o.exported)).toBe(equal);
    },
  "every scheduler row in each scope is unchanged {unchanged}": (
    world,
    { unchanged },
  ) => {
    const o = observed(world);
    expect(Object.keys(o.before).sort()).toEqual([...copyMounts].sort());
    expect(Object.keys(o.after).sort()).toEqual([...copyMounts].sort());
    for (const scope of Object.keys(o.after))
      expect(isDeepStrictEqual(o.after[scope], o.before[scope])).toBe(
        unchanged,
      );
  },
  "later business changes are gone {removed} and the destination environment is unchanged {environmentUnchanged}":
    (world, { removed, environmentUnchanged }) => {
      const o = observed(world);
      const changed = Object.keys(o.changedData).filter(
        (table) => !isDeepStrictEqual(o.changedData[table], o.exported[table]),
      );
      expect(changed).toEqual(
        expect.arrayContaining(["parent/markers", "depot/streams"]),
      );
      for (const table of changed)
        expect(isDeepStrictEqual(o.restored[table], o.exported[table])).toBe(
          removed,
        );
      expect(isDeepStrictEqual(o.environmentAfter, o.environment)).toBe(
        environmentUnchanged,
      );
    },
  "kept reactions read {value} no earlier than their scheduled time {onTime}": (
    world,
    { value, onTime },
  ) => {
    const o = observed(world);
    expect(o.reactions).toHaveLength(3);
    for (const reaction of o.reactions) {
      const kept = required(reaction.kept, "the kept reaction");
      expect(kept.value).toBe(value);
      expect(Number(kept._creationTime) >= o.due).toBe(onTime);
      expect(
        reaction.effects.filter((row) => row.label === o.exportedLabel),
      ).toHaveLength(0);
    }
  },
  "each restored scheduler reference resolves to the kept row {found} and cancellation leaves state {state}":
    (world, { found, state }) => {
      const o = observed(world);
      expect(o.references).toHaveLength(3);
      for (const reference of o.references) {
        expect(
          isDeepStrictEqual(
            reference.found,
            o.before[reference.scope]!.find((row) => row._id === reference.id),
          ),
        ).toBe(found);
        expect(
          (
            required(reference.canceled, "the canceled row").state as {
              kind: string;
            }
          ).kind,
        ).toBe(state);
      }
    },
});

bindExample(
  hostedDeploymentAcceptsProductionCompositionContract,
  (): AcceptanceWorld => ({}),
  {
    "the hosted deployment named by the run's deployment URL and deploy key, with the fixture issuer's variables set on it":
      (world) => acceptanceDeployment(world),
    "the run deploys the production composition, grants a subject with admin access, and an ordinary client carrying that subject's token places an order of {lines} line":
      (world, { lines }) => deployAndPlace(world, lines, runId()),
    "the deploy completes {deployed}": (world, { deployed }) => {
      const backend = required(world.backend, "the hosted backend");
      expect(backend.facts().composition === "production").toBe(deployed);
    },
    "the command's outcome is {outcome}": (world, { outcome }) => {
      expect(required(world.response, "the answer")).toMatchObject({
        kind: outcome,
      });
    },
    "the function log read with the deploy key holds the command's completion record {records}":
      (world, { records }) => {
        expect(placeOrderRecords(world)).toHaveLength(records);
      },
  },
);

bindExample(probe3HostedFunctionCallsContract, (): QuotaWorld => ({}), {
  "the hosted deployment running the hosted driver's temporary copy of the fixture composition, and a parent mutation that reads the same document {reads} times through a helper function or through a component query":
    (world, { reads }) => quotaDeployment(world, reads),
  "a client calls the parent mutation {calls} times through the component query, then {calls} times through the helper, then {calls} times through the component query again, and the run reads the deployment's function calls before and after each set of calls":
    (world, { calls }) => quotaSets(world, calls),
  "the function calls the helper set adds are {helperCallsPerParentCall} per parent call":
    (world, { helperCallsPerParentCall }) => {
      const [, helper] = required(world.added, "the sets");
      expect(required(helper, "the helper set").functionCalls).toBe(
        helperCallsPerParentCall * required(world.calls, "the call count"),
      );
    },
  "the function calls each component set adds are recorded, and the count is settled only when the two component sets add the same number":
    (world) => {
      const settled = required(world.settled, "the settlement");
      expect(settled.reasons, "the count is not settled").toEqual([]);
      expect(settled.settled).toBe(true);
    },
});

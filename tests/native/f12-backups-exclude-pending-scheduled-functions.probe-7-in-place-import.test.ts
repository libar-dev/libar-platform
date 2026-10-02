import { expect, vi } from "vitest";
import { isDeepStrictEqual } from "node:util";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe7InPlaceImportContract as contract } from "../../generated/contracts/facts.f12-backups-exclude-pending-scheduled-functions.probe-7-in-place-import.contract.js";
import { schedulingBackend } from "./scheduler-composition.js";
import { type SchedulerWorld } from "./scheduler-cases.js";
import { inPlaceImport } from "./scheduler-restore.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-in-place-import",
  ),
  verifies: ref(
    "spec:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-in-place-import",
  ),
});
void anchor;
vi.setConfig({ testTimeout: 300000 });
type World = SchedulerWorld<Awaited<ReturnType<typeof inPlaceImport>>>;

bindExample(contract, (): World => ({}), {
  "a production composition has temporary functions for scheduler references and reactions":
    async (world) => {
      Object.assign(world, await schedulingBackend());
    },
  "it exports business documents and five scheduler states, adds orders and schedules, then imports the snapshot in place before pending reactions are due":
    async (world) => {
      world.observation = await inPlaceImport(world.backend!, world.directory!);
    },
  "documents including ids and creation times in {scopes} equal the exported documents {equal}":
    async (world, { scopes, equal }) => {
      const o = world.observation!;
      for (const scope of scopes.split(",")) {
        const entries = (data: typeof o.restored) =>
          Object.fromEntries(
            Object.entries(data).filter(([key]) => key.startsWith(scope + "/")),
          );
        expect(Object.keys(entries(o.restored)).length).toBeGreaterThan(0);
        expect(
          isDeepStrictEqual(entries(o.restored), entries(o.exported)),
        ).toBe(equal);
      }
    },
  "every scheduler row in each scope is unchanged {unchanged}": async (
    world,
    { unchanged },
  ) => {
    const o = world.observation!;
    expect(Object.keys(o.after).sort()).toEqual([
      "inventory",
      "orders",
      "parent",
    ]);
    for (const scope of Object.keys(o.after))
      expect(isDeepStrictEqual(o.after[scope], o.before[scope])).toBe(
        unchanged,
      );
  },
  "later business changes are gone {removed} and the destination environment is unchanged {environmentUnchanged}":
    async (world, { removed, environmentUnchanged }) => {
      const o = world.observation!;
      for (const table of [
        "parent/receipts",
        "parent/orderSummaries",
        "orders/streams",
        "orders/events",
        "inventory/streams",
        "inventory/events",
      ]) {
        expect(isDeepStrictEqual(o.changedData[table], o.exported[table])).toBe(
          false,
        );
        expect(isDeepStrictEqual(o.restored[table], o.exported[table])).toBe(
          removed,
        );
      }
      expect(isDeepStrictEqual(o.environmentAfter, o.environment)).toBe(
        environmentUnchanged,
      );
    },
  "kept reactions read {value} no earlier than their scheduled time {onTime}":
    async (world, { value, onTime }) => {
      const o = world.observation!;
      expect(o.reactions).toHaveLength(3);
      for (const r of o.reactions) {
        expect(r.kept!.value).toBe(value);
        expect(Number(r.kept!._creationTime) >= o.due).toBe(onTime);
        expect(
          r.effects.filter((row) => row.label === "exported"),
        ).toHaveLength(0);
      }
    },
  "each restored scheduler reference resolves to the kept row {found} and cancellation leaves state {state}":
    async (world, { found, state }) => {
      const o = world.observation!;
      expect(o.references).toHaveLength(3);
      for (const r of o.references) {
        expect(
          isDeepStrictEqual(
            r.found,
            o.before[r.component]!.find((row) => row._id === r.id),
          ),
        ).toBe(found);
        expect((r.canceled!.state as { kind: string }).kind).toBe(state);
      }
    },
});

import { expect, vi } from "vitest";
import { isDeepStrictEqual } from "node:util";
import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { probe7FreshImportContract as contract } from "../../generated/contracts/facts.f12-backups-exclude-pending-scheduled-functions.probe-7-fresh-import.contract.js";
import { schedulingBackend } from "./scheduler-composition.js";
import { type SchedulerWorld } from "./scheduler-cases.js";
import { freshImport } from "./scheduler-restore.js";
const anchor = specTest({
  id: testAnchorId(
    "test:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-fresh-import",
  ),
  verifies: ref(
    "spec:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-fresh-import",
  ),
});
void anchor;
vi.setConfig({ testTimeout: 300000 });
type World = SchedulerWorld<Awaited<ReturnType<typeof freshImport>>>;

bindExample(contract, (): World => ({}), {
  "a production composition can store parent and context documents and typed scheduler references":
    async (world) => {
      Object.assign(world, await schedulingBackend());
    },
  "it creates documents and five scheduler states, then exports and imports the backup archive with replacement into a fresh backend with its own environment":
    async (world) => {
      world.observation = await freshImport(world.backend!, world.directory!);
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
  "the scheduler row counts are parent {parent}, Orders {orders} and Inventory {inventory}":
    async (world, { parent, orders, inventory }) => {
      const s = world.observation!.schedules;
      expect(s.parent).toHaveLength(parent);
      expect(s.orders).toHaveLength(orders);
      expect(s.inventory).toHaveLength(inventory);
    },
  "the destination environment is unchanged {unchanged}": async (
    world,
    { unchanged },
  ) => {
    expect(
      isDeepStrictEqual(
        world.observation!.environmentAfter,
        world.observation!.environment,
      ),
    ).toBe(unchanged);
  },
  "each stored id validates as an argument and on a later write {valid}, system.get is null {missing}, and cancel succeeds {canceled}":
    async (world, { valid, missing, canceled }) => {
      for (const r of world.observation!.references) {
        expect(r.error === null).toBe(valid);
        expect(r.copies).toHaveLength(2);
        expect(r.copies.every((row) => row.dispatchId === r.id)).toBe(valid);
        expect(r.read === null).toBe(missing);
        expect(r.error === null).toBe(canceled);
        expect(r.schedules).toHaveLength(0);
      }
      expect(world.observation!.references).toHaveLength(3);
    },
});

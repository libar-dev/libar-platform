import { onTestFinished } from "vitest";
import type { ConvexClient } from "convex/browser";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { api } from "../../fixture/convex/_generated/api.js";
import { backend, fixture } from "./world.js";
import type { World } from "./world.js";
import { websocketClient, httpClient } from "../../harness/clients.js";
import { waitUntil } from "../../harness/wait.js";
export interface Row {
  _id: string;
  _creationTime: number;
  position: number;
  value: string;
}
export type Page = PaginationResult<Row>;
export interface Subscription<T> {
  value?: T;
  error?: Error;
  stop: () => void;
}
export interface Probe5World extends World {
  ws?: ConvexClient;
  pages?: Subscription<Page>[];
  size?: number;
  rows?: number;
  cap?: number;
  cursor?: string;
  rangeRows?: number;
  split?: string;
  first?: Subscription<Row | null>;
}
export async function setup(w: Probe5World) {
  await fixture(w);
  w.client = httpClient(backend(w).url);
  w.ws = websocketClient(backend(w).url);
  onTestFinished(() => w.ws!.close());
}
export async function seed(w: Probe5World, count: number) {
  await w.client!.mutation(api.probe5.write, {
    rows: Array.from({ length: count }, (_, position) => ({
      position,
      value: `row-${position}`,
    })),
  });
}
export function page(
  w: Probe5World,
  options: PaginationOptions,
): Subscription<Page> {
  const state: Subscription<Page> = { stop: () => {} };
  state.stop = w.ws!.onUpdate(
    api.probe5.page,
    { paginationOpts: options },
    (value) => {
      state.value = value as Page;
    },
    (error) => {
      state.error = error;
    },
  );
  onTestFinished(() => state.stop());
  return state;
}
export async function loaded<T>(s: Subscription<T>, description: string) {
  await waitUntil(
    description,
    () => {
      if (s.error) throw s.error;
      return s.value !== undefined;
    },
    5000,
  );
  return s.value!;
}
export async function whole(w: Probe5World): Promise<Row[]> {
  return ((await backend(w).readTable("rows", "probe")) as Row[]).sort(
    (a, b) =>
      a.position - b.position ||
      a._creationTime - b._creationTime ||
      a._id.localeCompare(b._id),
  );
}
export function joined(w: Probe5World) {
  return w.pages!.flatMap((p) => {
    if (p.error) throw p.error;
    return p.value?.page ?? [];
  });
}
export async function insertInside(w: Probe5World, count: number) {
  await w.client!.mutation(api.probe5.write, {
    rows: Array.from({ length: count }, (_, i) => ({
      position: (i + 1) / (count + 1),
      value: `insert-${i}`,
    })),
  });
}
export async function consistent(w: Probe5World, description: string) {
  const expected = await whole(w);
  await waitUntil(
    description,
    () =>
      JSON.stringify(joined(w).map((r) => r._id)) ===
      JSON.stringify(expected.map((r) => r._id)),
    5000,
  );
  return { actual: joined(w), expected };
}

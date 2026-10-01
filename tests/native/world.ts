import { onTestFinished } from "vitest";
import { startFixture } from "../../harness/backend.js";
import type { Backend } from "../../harness/backend.js";
import type { HarnessHttpClient } from "../../harness/clients.js";
import type { UserIdentity } from "convex/server";
export interface World {
  backend?: Backend;
  client?: HarnessHttpClient;
  identity?: UserIdentity | null;
  error?: unknown;
  result?: unknown;
  subject?: string;
}
export async function fixture(world: World, issuer?: string) {
  const backend = await startFixture(issuer);
  world.backend = backend;
  // bindExample's optional after callback runs only on success. Vitest cleanup also runs on failure.
  onTestFinished(() => backend.stop());
}
export function backend(world: World) {
  if (!world.backend)
    throw new Error("The Given step has not started the fixture");
  return world.backend;
}
export function client(world: World) {
  if (!world.client)
    throw new Error("The Given step has not created the client");
  return world.client;
}

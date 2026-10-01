import type { ConvexClient } from "convex/browser";
import type { Backend } from "../../harness/backend.js";
import { waitUntil } from "../../harness/wait.js";
// How many marker rows each trial left, read with the harness's admin access.
export async function markerRows(
  backend: Backend,
): Promise<Map<string, number>> {
  const rows = new Map<string, number>();
  for (const marker of await backend.admin.readTable("markers")) {
    const trial = String(marker.trial);
    rows.set(trial, (rows.get(trial) ?? 0) + 1);
  }
  return rows;
}
export function connected(client: ConvexClient): Promise<void> {
  return waitUntil(
    "the client's WebSocket to connect",
    () => client.connectionState().isWebSocketConnected,
  );
}

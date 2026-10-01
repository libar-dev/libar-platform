import { ConvexClient, ConvexHttpClient } from "convex/browser";
import type { UserIdentity } from "convex/server";
// Convex 1.46.0 implements these methods but strips them from its public declarations.
// Keep the escape hatch limited to the native harness.
import type {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
  UserIdentityAttributes,
} from "convex/server";
export type HarnessHttpClient = ConvexHttpClient & {
  setAdminAuth(key: string, identity?: UserIdentityAttributes): void;
  function<F extends FunctionReference<"query" | "mutation" | "action">>(
    name: F | string,
    componentPath: string | undefined,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
};
export function httpClient(url: string, token?: string) {
  const client = new ConvexHttpClient(url) as HarnessHttpClient;
  if (token) client.setAuth(token);
  return client;
}
export function websocketClient(url: string, token?: string) {
  const client = new ConvexClient(url);
  if (token) client.setAuth(async () => token);
  return client;
}
export function adminClient(
  url: string,
  adminKey: string,
  identity?: UserIdentity,
) {
  const client = new ConvexHttpClient(url) as HarnessHttpClient;
  client.setAdminAuth(adminKey, identity);
  return client;
}

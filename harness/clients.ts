import { ConvexClient, ConvexHttpClient } from "convex/browser";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { waitUntil } from "./wait.js";
export function ordinaryClient(
  url: string,
  options: { token?: string; fetch?: typeof globalThis.fetch } = {},
): ConvexHttpClient {
  const client = new ConvexHttpClient(
    url,
    options.fetch === undefined ? {} : { fetch: options.fetch },
  );
  if (options.token !== undefined) client.setAuth(options.token);
  return client;
}
export function ordinarySocketClient(
  url: string,
  options: { token?: string; webSocket?: typeof WebSocket } = {},
): ConvexClient {
  const client = new ConvexClient(
    url,
    options.webSocket === undefined
      ? {}
      : { webSocketConstructor: options.webSocket },
  );
  const token = options.token;
  if (token !== undefined) client.setAuth(async () => token);
  return client;
}
export interface CountingFetch {
  readonly fetch: typeof globalThis.fetch;
  requests(): number;
}
export function countingFetch(options: {
  loseResponses: boolean;
}): CountingFetch {
  let requests = 0;
  return {
    requests: () => requests,
    fetch: async (input, init) => {
      requests++;
      const response = await fetch(input, init);
      if (!options.loseResponses) return response;
      // The backend has answered. Read the answer to the end, then lose it.
      await response.arrayBuffer();
      throw new TypeError("The response was lost");
    },
  };
}
export interface HeldWebSocket {
  readonly WebSocket: typeof WebSocket;
  holdResponses(): void;
  pauseConnections(): void;
  release(): void;
}
export function heldWebSocket(): HeldWebSocket {
  const NativeWebSocket = globalThis.WebSocket;
  let holding = false;
  let paused = false;
  const sockets = new Set<Held>();
  class Held {
    onopen: WebSocket["onopen"] = null;
    onclose: WebSocket["onclose"] = null;
    onerror: WebSocket["onerror"] = null;
    onmessage: WebSocket["onmessage"] = null;
    private native: WebSocket | undefined;
    private held: MessageEvent[] = [];
    private closed = false;
    private url: string | URL;
    constructor(url: string | URL) {
      this.url = url;
      sockets.add(this);
      if (!paused) this.connect();
    }
    connect() {
      if (this.native !== undefined || this.closed) return;
      const native = new NativeWebSocket(this.url);
      this.native = native;
      native.onopen = (event) => this.onopen?.call(native, event);
      native.onerror = (event) => this.onerror?.call(native, event);
      native.onclose = (event) => {
        this.held = [];
        sockets.delete(this);
        this.onclose?.call(native, event);
      };
      native.onmessage = (event) => {
        if (holding) this.held.push(event);
        else this.onmessage?.call(native, event);
      };
    }
    deliver() {
      const native = this.native;
      if (native === undefined) return;
      for (const event of this.held) this.onmessage?.call(native, event);
      this.held = [];
    }
    send(data: string) {
      if (this.native === undefined)
        throw new Error("The socket is not connected");
      this.native.send(data);
    }
    close() {
      this.closed = true;
      this.held = [];
      if (this.native !== undefined) return this.native.close();
      sockets.delete(this);
      queueMicrotask(() =>
        this.onclose?.call(
          this as unknown as WebSocket,
          new CloseEvent("close"),
        ),
      );
    }
  }
  return {
    WebSocket: Held as unknown as typeof WebSocket,
    holdResponses() {
      holding = true;
    },
    pauseConnections() {
      paused = true;
    },
    release() {
      holding = false;
      paused = false;
      for (const socket of sockets) {
        socket.connect();
        socket.deliver();
      }
    },
  };
}
export interface QueryWatch<T> {
  readonly values: readonly T[];
  readonly error: Error | undefined;
  until(
    matches: (value: T) => boolean,
    description: string,
    timeoutMs?: number,
  ): Promise<T>;
  stop(): void;
}
export function watchQuery<Query extends FunctionReference<"query">>(
  client: ConvexClient,
  query: Query,
  args: FunctionArgs<Query>,
): QueryWatch<FunctionReturnType<Query>> {
  type Result = FunctionReturnType<Query>;
  const values: Result[] = [];
  let error: Error | undefined;
  let stopped = false;
  const unsubscribe = client.onUpdate(
    query,
    args,
    (value) => {
      values.push(value);
    },
    (failure) => {
      error = failure;
    },
  );
  return {
    values,
    get error() {
      return error;
    },
    async until(matches, description, timeoutMs = 5000) {
      await waitUntil(
        description,
        () => {
          if (error !== undefined) throw error;
          return values.length > 0 && matches(values[values.length - 1]);
        },
        timeoutMs,
      );
      return values[values.length - 1];
    },
    stop() {
      // ConvexClient throws when a subscription is removed twice.
      if (stopped) return;
      stopped = true;
      unsubscribe();
    },
  };
}

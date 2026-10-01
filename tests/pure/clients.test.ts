import { afterEach, expect, test, vi } from "vitest";
import { countingFetch, heldWebSocket } from "../../harness/clients.js";
class FakeSocket {
  static made: FakeSocket[] = [];
  onopen: WebSocket["onopen"] = null;
  onclose: WebSocket["onclose"] = null;
  onerror: WebSocket["onerror"] = null;
  onmessage: WebSocket["onmessage"] = null;
  sent: string[] = [];
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.made.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.call(this as unknown as WebSocket, {} as CloseEvent);
  }
  receive(data: string) {
    this.onmessage?.call(
      this as unknown as WebSocket,
      { data } as MessageEvent,
    );
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  FakeSocket.made = [];
});
function listen(socket: WebSocket): string[] {
  const received: string[] = [];
  socket.onmessage = (event) => received.push(event.data as string);
  return received;
}
test("pure: a held socket sends requests at once and delivers held responses on release", () => {
  vi.stubGlobal("WebSocket", FakeSocket);
  const held = heldWebSocket();
  const socket = new held.WebSocket("ws://backend");
  const received = listen(socket);
  held.holdResponses();
  socket.send("a mutation");
  FakeSocket.made[0]?.receive("its result");
  expect(FakeSocket.made[0]?.sent).toEqual(["a mutation"]);
  expect(received).toEqual([]);
  held.release();
  expect(received).toEqual(["its result"]);
});
test("pure: a held socket that closes drops its held responses, and a paused socket connects on release", () => {
  vi.stubGlobal("WebSocket", FakeSocket);
  const held = heldWebSocket();
  const received = listen(new held.WebSocket("ws://backend"));
  held.holdResponses();
  FakeSocket.made[0]?.receive("a result nobody will see");
  FakeSocket.made[0]?.close();
  held.pauseConnections();
  const second = new held.WebSocket("ws://backend");
  const replayed = listen(second);
  expect(FakeSocket.made).toHaveLength(1);
  expect(() => second.send("too early")).toThrow("The socket is not connected");
  held.release();
  expect(FakeSocket.made).toHaveLength(2);
  expect(received).toEqual([]);
  FakeSocket.made[1]?.receive("the replayed result");
  expect(replayed).toEqual(["the replayed result"]);
});
function answering(body: string) {
  const requested: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    requested.push(input);
    return new Response(body);
  });
  return requested;
}
test("pure: a counting fetch that loses responses delivers the request, then throws", async () => {
  const requested = answering("done");
  const lossy = countingFetch({ loseResponses: true });
  await expect(lossy.fetch("http://backend/api/mutation")).rejects.toThrow(
    "The response was lost",
  );
  expect(lossy.requests()).toBe(1);
  expect(requested).toEqual(["http://backend/api/mutation"]);
});
test("pure: a counting fetch that keeps responses returns them and counts", async () => {
  answering("done");
  const kept = countingFetch({ loseResponses: false });
  expect(await (await kept.fetch("http://backend/1")).text()).toBe("done");
  expect(await (await kept.fetch("http://backend/2")).text()).toBe("done");
  expect(kept.requests()).toBe(2);
});

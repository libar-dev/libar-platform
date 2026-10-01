import { afterEach, expect, test, vi } from "vitest";
import { controlledTransport } from "../native/probe1-transport.js";
class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: WebSocket["onopen"] = null;
  onclose: WebSocket["onclose"] = null;
  onerror: WebSocket["onerror"] = null;
  onmessage: WebSocket["onmessage"] = null;
  sent: string[] = [];
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.call(this as unknown as WebSocket, {} as CloseEvent);
  }
  message(data: string) {
    this.onmessage?.call(
      this as unknown as WebSocket,
      { data } as MessageEvent,
    );
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  FakeSocket.instances = [];
});
test("simulator: response hold passes outgoing requests and releases live responses", () => {
  vi.stubGlobal("WebSocket", FakeSocket);
  const transport = controlledTransport();
  const socket = new transport.constructor("ws://fixture");
  const received: string[] = [];
  socket.onmessage = (e) => received.push(e.data as string);
  transport.holdResponses();
  socket.send("mutation request");
  FakeSocket.instances[0]!.message("confirmation");
  expect(FakeSocket.instances[0]!.sent).toEqual(["mutation request"]);
  expect(received).toEqual([]);
  transport.resume();
  expect(received).toEqual(["confirmation"]);
});
test("simulator: dead responses are discarded and reconnection waits for release", () => {
  vi.stubGlobal("WebSocket", FakeSocket);
  const transport = controlledTransport();
  const old = new transport.constructor("ws://fixture");
  const received: string[] = [];
  old.onmessage = (e) => received.push(e.data as string);
  transport.holdResponses();
  FakeSocket.instances[0]!.message("old response");
  FakeSocket.instances[0]!.close();
  transport.pauseReconnections();
  const next = new transport.constructor("ws://fixture");
  next.onmessage = (e) => received.push(e.data as string);
  expect(FakeSocket.instances).toHaveLength(1);
  transport.resume();
  expect(FakeSocket.instances).toHaveLength(2);
  expect(received).toEqual([]);
  FakeSocket.instances[1]!.message("replayed confirmation");
  expect(received).toEqual(["replayed confirmation"]);
});

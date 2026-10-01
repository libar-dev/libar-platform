// Controls real client transport timing. Requests still go to the native backend.
// Holding responses keeps the call pending; pausing new sockets lets admin access
// read the restarted storage before the open client can replay its request.
export function controlledTransport() {
  const NativeWebSocket = globalThis.WebSocket;
  let holdMessages = false;
  let pauseConnect = false;
  const sockets = new Set<Socket>();
  class Socket {
    onopen: WebSocket["onopen"] = null;
    onclose: WebSocket["onclose"] = null;
    onerror: WebSocket["onerror"] = null;
    onmessage: WebSocket["onmessage"] = null;
    private native?: WebSocket;
    private messages: MessageEvent[] = [];
    private closed = false;
    constructor(private url: string | URL) {
      sockets.add(this);
      if (!pauseConnect) this.connect();
    }
    connect() {
      if (this.native || this.closed) return;
      const ws = new NativeWebSocket(this.url);
      this.native = ws;
      ws.onopen = (e) => this.onopen?.call(ws, e);
      ws.onerror = (e) => this.onerror?.call(ws, e);
      ws.onclose = (e) => {
        this.messages = [];
        sockets.delete(this);
        this.onclose?.call(ws, e);
      };
      ws.onmessage = (e) => {
        if (holdMessages) this.messages.push(e);
        else this.onmessage?.call(ws, e);
      };
    }
    flush() {
      for (const e of this.messages) this.onmessage?.call(this.native!, e);
      this.messages = [];
    }
    send(data: string) {
      if (!this.native) throw new Error("Transport send before connect");
      this.native.send(data);
    }
    close() {
      this.closed = true;
      this.messages = [];
      if (this.native) this.native.close();
      else {
        sockets.delete(this);
        queueMicrotask(() =>
          this.onclose?.call(
            this as unknown as WebSocket,
            new CloseEvent("close"),
          ),
        );
      }
    }
  }
  return {
    constructor: Socket as unknown as typeof WebSocket,
    holdResponses() {
      holdMessages = true;
    },
    pauseReconnections() {
      pauseConnect = true;
    },
    resume() {
      holdMessages = false;
      pauseConnect = false;
      for (const socket of sockets) {
        socket.connect();
        socket.flush();
      }
    },
  };
}

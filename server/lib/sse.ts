// Minimal Server-Sent Events client: Node 24 has EventSource only behind --experimental-eventsource.
// Parsing follows https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream

export interface SSEEvent {
  event: string;
  data: string;
  id?: string;
}

/** Incremental parser: push() arbitrary chunks, onEvent fires per dispatched event. */
export function createSSEParser(onEvent: (e: SSEEvent) => void) {
  let buffer = "";
  let event = "";
  let data: string[] = [];
  let id: string | undefined;
  let pendingCR = false;

  const dispatch = () => {
    if (data.length) onEvent({ event: event || "message", data: data.join("\n"), ...(id !== undefined && { id }) });
    event = "";
    data = [];
  };

  const line = (l: string) => {
    if (l === "") return dispatch();
    if (l.startsWith(":")) return; // comment
    const colon = l.indexOf(":");
    const field = colon < 0 ? l : l.slice(0, colon);
    let value = colon < 0 ? "" : l.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id" && !value.includes("\0")) id = value;
    // "retry" and unknown fields are ignored: reconnect timing is ours.
  };

  return {
    push(chunk: string) {
      // A CR at the end of the previous chunk may be the first half of CRLF.
      if (pendingCR && chunk.startsWith("\n")) chunk = chunk.slice(1);
      pendingCR = false;
      buffer += chunk;
      const parts = buffer.split(/\r\n|\r|\n/);
      buffer = parts.pop() ?? "";
      if (chunk.endsWith("\r")) pendingCR = true;
      for (const p of parts) line(p);
    },
    /** Stream ended: an incomplete event is discarded, as the spec says. */
    end() {
      buffer = "";
      event = "";
      data = [];
    },
  };
}

export interface SubscribeSSEOptions {
  onEvent: (e: SSEEvent) => void;
  onOpen?: () => void;
  onError?: (err: unknown) => void;
  signal: AbortSignal;
  minRetryMs?: number;
  maxRetryMs?: number;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>(resolve => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });

/**
 * Connects, reads events and reconnects with exponential backoff until `signal` aborts.
 * Never throws: every failure goes to onError. Resolves once aborted.
 */
export async function subscribeSSE(url: string, o: SubscribeSSEOptions): Promise<void> {
  const min = o.minRetryMs ?? 1000;
  const max = o.maxRetryMs ?? 30_000;
  const fetchImpl = o.fetchImpl ?? fetch;
  let delay = min;

  while (!o.signal.aborted) {
    try {
      const res = await fetchImpl(url, { signal: o.signal, headers: { accept: "text/event-stream" } });
      if (!res.ok || !res.body) throw new Error(`SSE ${url}: HTTP ${res.status}`);
      if (!res.headers.get("content-type")?.includes("text/event-stream")) {
        throw new Error(`SSE ${url}: kein text/event-stream`);
      }
      o.onOpen?.();
      delay = min;
      const parser = createSSEParser(o.onEvent);
      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.end();
      if (!o.signal.aborted) o.onError?.(new Error(`SSE ${url}: Verbindung beendet`));
    } catch (err) {
      if (o.signal.aborted) break;
      o.onError?.(err);
    }
    await sleep(delay, o.signal);
    delay = Math.min(delay * 2, max);
  }
}

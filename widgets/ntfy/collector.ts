import { defineCollector } from "@shared/widget-contract";
import { config as serverConfig } from "../../server/env";
import { parseActionInput } from "../../server/lib/action-input";
import { subscribeSSE } from "../../server/lib/sse";
import { DismissAllIn, DismissIn, TopicIn, manifest } from "./manifest";
import { parsePoll, topicsUrl } from "./parse";
import { addTopic, applyDismissed, dismiss, dismissAll, loadState, mergeTopics, mutateState, removeTopic, restoreAll, stateFile } from "./store";

// Optional access token for reserved or self-hosted topics; public topics need none.
const authHeader = (env: Record<string, string | undefined>) => {
  const token = env.NTFY_TOKEN?.trim();
  return token ? `Bearer ${token}` : undefined;
};

const untilAborted = (signal: AbortSignal) =>
  new Promise<void>(resolve => (signal.aborted ? resolve() : signal.addEventListener("abort", () => resolve(), { once: true })));

/** dataDir and clock are injectable for tests. */
export function ntfyCollector(dataDir: string, now: () => Date = () => new Date()) {
  // Fires "<instance>" after a topic action, so the SSE subscription reconnects with the new list.
  const changes = new EventTarget();
  const topicNames = async (instance: string, fixed: string[]) =>
    mergeTopics(fixed, (await loadState(stateFile(dataDir, instance))).topics).map(t => t.name);

  return defineCollector(manifest, {
    async collect({ instance, config, env, signal }) {
      const state = await loadState(stateFile(dataDir, instance));
      const topics = mergeTopics(config.topics, state.topics);
      if (!topics.length) return { topics, messages: [], hidden: 0 };
      const auth = authHeader(env);
      const url = `${topicsUrl(config.server, topics.map(t => t.name))}/json?poll=1&since=${config.since}`;
      const res = await fetch(url, { signal, headers: auth ? { authorization: auth } : {} });
      if (!res.ok) throw new Error(`ntfy: HTTP ${res.status}`);
      // Filter before the limit, so dismissing makes room for older messages.
      const { messages, hidden } = applyDismissed(parsePoll(await res.text(), Infinity), state);
      return { topics, messages: messages.slice(0, config.max), hidden };
    },

    subscribe({ instance, config, env, signal, refresh, log }) {
      const auth = authHeader(env);
      // Requests from subscribeSSE carry no custom headers, so ntfy takes the header as ?auth= (base64url).
      const query = auth ? `?auth=${Buffer.from(auth).toString("base64url")}` : "";
      let connected = true;
      void (async () => {
        while (!signal.aborted) {
          const round = new AbortController();
          const stop = () => round.abort();
          // Listen before reading the topics: a change in between must not get lost.
          changes.addEventListener(instance, stop);
          signal.addEventListener("abort", stop, { once: true });
          try {
            const names = await topicNames(instance, config.topics);
            if (!names.length) await untilAborted(round.signal);
            else
              await subscribeSSE(`${topicsUrl(config.server, names)}/sse${query}`, {
                signal: round.signal,
                onOpen: () => (connected = true),
                onEvent: e => {
                  if (e.event === "message") refresh();
                },
                // Log only the first failure after a working connection, not every retry.
                onError: err => {
                  if (!connected) return;
                  connected = false;
                  log("SSE getrennt:", err instanceof Error ? err.message : String(err));
                },
              });
          } catch (err) {
            // Unreadable state file: collect() reports it as status; wait for the next change.
            log("Topics nicht lesbar:", err instanceof Error ? err.message : String(err));
            await untilAborted(round.signal);
          } finally {
            changes.removeEventListener(instance, stop);
            signal.removeEventListener("abort", stop);
          }
        }
      })();
    },

    actions: {
      addTopic: async ({ instance, config, log }, input) => {
        const { topic } = parseActionInput(TopicIn, input);
        await mutateState(stateFile(dataDir, instance), s => ({ ...s, topics: addTopic(config.topics, s.topics, topic) }));
        changes.dispatchEvent(new Event(instance));
        log("Topic hinzugefügt"); // topic names act as passwords on ntfy.sh: never logged
      },
      removeTopic: async ({ instance, config, log }, input) => {
        const { topic } = parseActionInput(TopicIn, input);
        await mutateState(stateFile(dataDir, instance), s => ({ ...s, topics: removeTopic(config.topics, s.topics, topic) }));
        changes.dispatchEvent(new Event(instance));
        log("Topic entfernt");
      },
      // Hiding is local to the dashboard: ntfy and other subscribers keep the message.
      dismiss: async ({ instance }, input) => {
        const { id } = parseActionInput(DismissIn, input);
        await mutateState(stateFile(dataDir, instance), s => dismiss(s, id, now()));
      },
      dismissAll: async ({ instance }, input) => {
        const { until } = parseActionInput(DismissAllIn, input);
        await mutateState(stateFile(dataDir, instance), s => dismissAll(s, until));
      },
      restoreAll: async ({ instance }) => {
        await mutateState(stateFile(dataDir, instance), restoreAll);
      },
    },
  });
}

export const collector = ntfyCollector(serverConfig.dataDir);

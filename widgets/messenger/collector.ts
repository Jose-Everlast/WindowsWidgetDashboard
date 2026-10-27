import { watch } from "node:fs";
import { basename, dirname } from "node:path";
import { defineCollector } from "@shared/widget-contract";
import { config as serverConfig } from "../../server/env";
import { notFound } from "../../server/http";
import { parseActionInput } from "../../server/lib/action-input";
import { appsOf } from "./apps";
import { collectMessenger, dbPathOf, type MessengerDeps } from "./collect";
import { clear, dismiss, markAllRead, markRead, mute, undo, unmute, type Feed } from "./feed";
import { AppIn, EmptyIn, KeyIn, manifest, type MessengerConfig } from "./manifest";
import { messagesFile, mutateFeed } from "./store";
import { readToasts } from "./wpn";

/** Windows writes a new toast into the WAL first, the checkpoint later moves it into the db; -shm is only the index. */
const isDbChange = (file: string | null, db: string) => file === null || file === db || file === `${db}-wal`;

/** dataDir, reader and clock are injectable for tests. */
export function messengerCollector(dataDir: string, deps: Partial<Omit<MessengerDeps, "dataDir">> = {}) {
  const d: MessengerDeps = { dataDir, readToasts: deps.readToasts ?? readToasts, now: deps.now ?? Date.now };

  // Only the dashboard's own feed changes; Windows and the apps stay untouched.
  const change = (instance: string, fn: (feed: Feed, now: number) => Feed) =>
    mutateFeed(messagesFile(dataDir, instance), feed => ({ feed: fn(feed, d.now()), result: undefined }), "conflict");
  const appOf = (config: MessengerConfig, input: unknown) => {
    const { app } = parseActionInput(AppIn, input);
    if (!appsOf(config).some(a => a.id === app)) throw notFound("App");
    return app;
  };

  return defineCollector(manifest, {
    collect: ({ instance, config, env }) => collectMessenger(d, { instance, config, env }),

    subscribe({ config, env, signal, log, refresh }) {
      let db: string;
      try {
        db = dbPathOf(config, env);
      } catch {
        return; // collect() reports the missing path
      }
      const name = basename(db);
      let failing = false; // log the first failure only, polling goes on anyway
      const fail = (err: unknown) => {
        if (failing) return;
        failing = true;
        log("Ordner-Überwachung aus, es bleibt beim Polling:", err instanceof Error ? err.message : String(err));
      };
      try {
        const watcher = watch(dirname(db), { signal }, (_event, file) => {
          if (isDbChange(file, name)) refresh();
        });
        watcher.on("error", fail);
      } catch (err) {
        fail(err);
      }
    },

    actions: {
      markRead: async ({ instance }, input) => {
        const { key } = parseActionInput(KeyIn, input);
        await change(instance, (f, now) => markRead(f, key, now));
      },
      markAllRead: async ({ instance }, input) => {
        parseActionInput(EmptyIn, input);
        await change(instance, (f, now) => markAllRead(f, now));
      },
      // Log the action only: chat keys contain names.
      dismiss: async ({ instance, log }, input) => {
        const { key } = parseActionInput(KeyIn, input);
        await change(instance, (f, now) => dismiss(f, key, now));
        log("Chat ausgeblendet");
      },
      clear: async ({ instance, log }, input) => {
        parseActionInput(EmptyIn, input);
        await change(instance, (f, now) => clear(f, now));
        log("Nachrichten geleert");
      },
      undo: async ({ instance, log }, input) => {
        parseActionInput(EmptyIn, input);
        await change(instance, (f, now) => undo(f, now));
        log("Rückgängig gemacht");
      },
      mute: async ({ instance, config, log }, input) => {
        const app = appOf(config, input);
        await change(instance, (f, now) => mute(f, app, now));
        log(`App ${app} ausgeblendet`);
      },
      unmute: async ({ instance, config, log }, input) => {
        const app = appOf(config, input);
        await change(instance, f => unmute(f, app));
        log(`App ${app} wieder eingeblendet`);
      },
    },
  });
}

export const collector = messengerCollector(serverConfig.dataDir);

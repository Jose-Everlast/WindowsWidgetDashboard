import { join } from "node:path";
import { defineCollector } from "@shared/widget-contract";
import { tokenStoreFor } from "../../server/auth/token-store";
import { config as serverConfig } from "../../server/env";
import { collectMail } from "./collect";
import { manifest } from "./manifest";

// Shared with the /auth routes, so a login and a poll never refresh the same account at once.
const tokens = tokenStoreFor(join(serverConfig.dataDir, "tokens"));

export const collector = defineCollector(manifest, {
  collect: ({ config, env, signal, log }) => collectMail({ config, env, signal, tokens, log }),
});

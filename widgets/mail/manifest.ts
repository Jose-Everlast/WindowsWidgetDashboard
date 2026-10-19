import { z } from "zod";
import { defineManifest } from "@shared/widget-contract";

// Account IDs are token file names (data/tokens/<id>.json): kebab-case only.
const AccountId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "kebab-case erwartet, z. B. gmail-privat");
const Color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Hex-Farbe erwartet, z. B. #60a5fa")
  .optional();
const Base = { id: AccountId, label: z.string().min(1), color: Color };

export const MailAccount = z.discriminatedUnion("provider", [
  z.object({ ...Base, provider: z.literal("gmail") }),
  z.object({ ...Base, provider: z.literal("outlook") }),
  z.object({
    ...Base,
    provider: z.literal("imap"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(993),
    user: z.string().min(1),
    // Name of the .env variable holding the app password: the secret itself never goes into the config.
    passwordEnv: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .default("IMAP_PASSWORD"),
    webmailUrl: z.url({ protocol: /^https$/ }).optional(),
  }),
]);
export type MailAccount = z.infer<typeof MailAccount>;
export type MailProvider = MailAccount["provider"];

export const MailConfig = z.object({
  accounts: z
    .array(MailAccount)
    .min(1)
    .refine(a => new Set(a.map(x => x.id)).size === a.length, "Konto-IDs müssen eindeutig sein"),
  limit: z.number().int().min(1).max(50).default(15),
  perAccount: z.number().int().min(1).max(25).default(10),
});
export type MailConfig = z.infer<typeof MailConfig>;

export const AccountStatus = z.enum(["ok", "unconfigured", "error"]);

export const MailAccountSummary = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.enum(["gmail", "outlook", "imap"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  status: AccountStatus,
  unread: z.number().int().nullable(),
  email: z.string().nullable(),
  error: z.string().optional(),
  /** Relative login path, e.g. /auth/google/start?account=gmail-privat */
  action: z
    .string()
    .regex(/^\/auth\//)
    .optional(),
});
export type MailAccountSummary = z.infer<typeof MailAccountSummary>;

export const MailMessage = z.object({
  id: z.string(),
  account: z.string(),
  from: z.string(),
  subject: z.string(),
  receivedAt: z.string(),
  unread: z.boolean(),
  url: z.url({ protocol: /^https$/ }).nullable(),
});
export type MailMessage = z.infer<typeof MailMessage>;

export const MailData = z.object({
  accounts: z.array(MailAccountSummary),
  messages: z.array(MailMessage).max(50),
});
export type MailData = z.infer<typeof MailData>;

export const manifest = defineManifest({
  id: "mail",
  title: "Mail",
  version: 1,
  category: "comms",
  defaultSize: { w: 3, h: 3 },
  intervalMs: 120_000,
  timeoutMs: 30_000,
  capabilities: ["network"],
  config: MailConfig,
  data: MailData,
});

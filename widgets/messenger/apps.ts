// Which app a toast belongs to and which chat it is part of. Pure: no Node APIs.
import type { App } from "./manifest";

/** The apps this instance shows: config.apps narrowed by only/except, e.g. one tile just for Slack. */
export function appsOf(config: { apps: App[]; only?: string[]; except?: string[] }): App[] {
  return config.apps.filter(a => (!config.only || config.only.includes(a.id)) && !config.except?.includes(a.id));
}

/**
 * AppUserModelIDs seen on Windows 11 (NotificationHandler.PrimaryId), matched as substrings:
 * WhatsApp Desktop 5319275A.WhatsAppDesktop_…!App, Teams MSTeams_…!MSTeams (classic: com.squirrel.Teams.Teams),
 * Discord com.squirrel.Discord.Discord, Slack com.squirrel.slack.slack (Store: com.tinyspeck.slackdesktop_…!Slack),
 * Lark/Feishu, new Outlook Microsoft.OutlookForWindows_…!Microsoft.OutlookforWindows.
 */
export const DEFAULT_APPS: App[] = [
  { id: "whatsapp", label: "WhatsApp", match: ["whatsapp"], color: "#25d366", chatKey: "title" },
  { id: "teams", label: "Teams", match: ["teams"], color: "#7b83eb", chatKey: "title" },
  { id: "discord", label: "Discord", match: ["discord"], color: "#5865f2", chatKey: "title" },
  { id: "slack", label: "Slack", match: ["slack"], color: "#e01e5a", chatKey: "title" },
  { id: "lark", label: "Lark", match: ["lark", "feishu"], color: "#3370ff", chatKey: "title" },
  // Mail, as in the Android widget hub: title = sender, then subject and preview. New Outlook and classic Outlook.
  { id: "outlook", label: "Outlook", match: ["outlookforwindows", "microsoft.office.outlook"], color: "#0f6cbd", chatKey: "title" },
];

export function matchApp(primaryId: string, apps: App[]): App | null {
  const id = primaryId.toLowerCase();
  return apps.find(a => a.match.some(m => id.includes(m.toLowerCase()))) ?? null;
}

export const NO_TITLE = "(ohne Titel)";

/** "<appId>:<value>"; an empty Group or Tag falls back to the title. */
export function chatKeyOf(app: App, toast: { title: string; tag: string; group: string }): string {
  const value = (app.chatKey === "group" ? toast.group : app.chatKey === "tag" ? toast.tag : "") || toast.title || NO_TITLE;
  return `${app.id}:${value}`;
}

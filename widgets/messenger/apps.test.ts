import { describe, expect, it } from "vitest";
import { DEFAULT_APPS, NO_TITLE, appsOf, chatKeyOf, matchApp } from "./apps";
import { App, MessengerConfig } from "./manifest";

describe("appsOf", () => {
  const ids = (c: unknown) => appsOf(MessengerConfig.parse(c)).map(a => a.id);

  it("narrows the apps with only and except, so one app can get its own tile", () => {
    expect(ids({})).toEqual(DEFAULT_APPS.map(a => a.id));
    expect(ids({ only: ["slack"] })).toEqual(["slack"]);
    expect(ids({ except: ["slack"] })).toEqual(["whatsapp", "teams", "discord", "lark", "outlook"]);
  });

  it("rejects unknown app IDs and a filter that leaves no app", () => {
    expect(MessengerConfig.safeParse({ only: ["icq"] }).success).toBe(false);
    expect(MessengerConfig.safeParse({ except: ["icq"] }).success).toBe(false);
    expect(MessengerConfig.safeParse({ only: ["slack"], except: ["slack"] }).success).toBe(false);
  });
});

describe("matchApp", () => {
  it.each([
    ["5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App", "whatsapp"],
    ["MSTeams_8wekyb3d8bbwe!MSTeams", "teams"],
    ["com.squirrel.Teams.Teams", "teams"],
    ["com.squirrel.Discord.Discord", "discord"],
    ["com.squirrel.slack.slack", "slack"],
    ["com.tinyspeck.slackdesktop_8yrtsj140pw4g!Slack", "slack"],
    ["Microsoft.OutlookForWindows_8wekyb3d8bbwe!Microsoft.OutlookforWindows", "outlook"],
    ["Microsoft.Office.OUTLOOK.EXE.15", "outlook"],
  ])("%s → %s", (primaryId, id) => {
    expect(matchApp(primaryId, DEFAULT_APPS)?.id).toBe(id);
  });

  it("ignores every other app", () => {
    expect(matchApp("Docker.DockerForWindows.Settings", DEFAULT_APPS)).toBeNull();
    expect(matchApp("AD2F1837.OMENCommandCenter_v10z8vjag6ke6!AD2F1837.OMENCommandCenter", DEFAULT_APPS)).toBeNull();
  });
});

describe("chatKeyOf", () => {
  const app = (chatKey: "title" | "group" | "tag") => App.parse({ id: "x", label: "X", match: ["x"], chatKey });

  it("uses the configured field and falls back to the title, then to a placeholder", () => {
    const toast = { title: "Chat 1", tag: "t1", group: "g1" };
    expect(chatKeyOf(app("title"), toast)).toBe("x:Chat 1");
    expect(chatKeyOf(app("group"), toast)).toBe("x:g1");
    expect(chatKeyOf(app("tag"), toast)).toBe("x:t1");
    expect(chatKeyOf(app("group"), { ...toast, group: "" })).toBe("x:Chat 1");
    expect(chatKeyOf(app("title"), { ...toast, title: "" })).toBe(`x:${NO_TITLE}`);
  });
});

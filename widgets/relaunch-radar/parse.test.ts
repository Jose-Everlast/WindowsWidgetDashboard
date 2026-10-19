import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RelaunchRadarConfig, RelaunchRadarData } from "./manifest";
import { FeedIn, JobsRunningIn, NotificationFileIn, OverviewIn, fromApi, fromFile, leadUrl } from "./parse";

// Real relaunch-radar responses from 2026-10-19, company names/slugs anonymized ("Firma A", firma-a-de).
const read = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const overviewRaw = read("overview.json");
const overview = OverviewIn.parse(overviewRaw);
const running = JobsRunningIn.parse(read("jobs-running.json"));
const feed = FeedIn.parse(read("notifications.json"));
const config = RelaunchRadarConfig.parse({ attentionLimit: 3, notificationLimit: 4 });
const UI = "http://127.0.0.1:3000";

describe("fromApi", () => {
  const data = fromApi({ overview, running, feed }, config, UI);

  it("produces a valid payload without the lead list", () => {
    expect(RelaunchRadarData.safeParse(data).success).toBe(true);
    expect(JSON.stringify(data)).not.toContain(overviewRaw.leads[0].slug);
    if (process.env.UPDATE_FIXTURES) {
      writeFileSync(
        new URL("./fixtures/relaunch-radar.json", import.meta.url),
        JSON.stringify(fromApi({ overview, running, feed }, RelaunchRadarConfig.parse({}), UI), null, 2) + "\n",
      );
    }
  });

  it("counts attention over all entries but lists only attentionLimit", () => {
    expect(data.attention!.counts).toEqual({
      rate: overview.attention.filter(a => a.kind === "rate").length,
      failed: overview.attention.filter(a => a.kind === "failed").length,
      limit: overview.attention.filter(a => a.kind === "limit").length,
    });
    expect(data.attention!.items).toHaveLength(3);
  });

  it("reads type/slug from request and joins name/eta via the autopilot's jobId", () => {
    expect(data.jobs).toEqual([
      { type: "mockup-create", slug: "firma-k-de", name: "Firma K", startedAt: running[0]!.startedAt, etaMin: 6 },
    ]);
  });

  it("limits notifications and keeps unread from the API", () => {
    expect(data.notifications).toHaveLength(4);
    expect(data.unread).toBe(feed.unread);
    expect(data.mode).toBe("live");
  });
});

describe("fromFile", () => {
  const file = NotificationFileIn.parse(read("notifications-file.json"));

  it("computes unread from seenAt and marks the fallback", () => {
    const all = fromFile(file, config, UI, "fetch failed");
    expect(all).toMatchObject({ mode: "file", apiError: "fetch failed", autopilot: null, jobs: null, attention: null });
    expect(all.unread).toBe(file.items.length); // seenAt null → all unread
    const seenAt = file.items[2]!.at;
    expect(fromFile({ ...file, seenAt }, config, UI, "x").unread).toBe(file.items.filter(n => n.at > seenAt).length);
    expect(RelaunchRadarData.safeParse(all).success).toBe(true);
  });
});

describe("leadUrl", () => {
  it("encodes the slug and tolerates a trailing slash", () => {
    expect(leadUrl("http://127.0.0.1:3000/", "firma-a-de")).toBe("http://127.0.0.1:3000/lead/firma-a-de/uebersicht");
    expect(leadUrl(UI, "a/b?c")).toBe(`${UI}/lead/a%2Fb%3Fc/uebersicht`);
  });
});

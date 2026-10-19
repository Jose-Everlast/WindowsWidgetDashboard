import { readFileSync, writeFileSync } from "node:fs";
import Parser from "rss-parser";
import { describe, expect, it } from "vitest";
import { ListView } from "@shared/widget-contract";
import { formatMeta, toListItems } from "./parse";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const parser = new Parser();

describe("toListItems with real feeds", () => {
  it("merges RSS 2.0 (tagesschau) and Atom (heise) newest first", async () => {
    const tagesschau = await parser.parseString(fixture("tagesschau.xml"));
    const heise = await parser.parseString(fixture("heise.xml"));
    const now = new Date("2026-10-19T12:00:00Z");
    const view = toListItems(
      [
        { label: "tagesschau", items: tagesschau.items },
        { label: "heise", items: heise.items },
      ],
      3,
      now,
    );

    expect(ListView.safeParse(view).success).toBe(true);
    expect(view.items).toHaveLength(6);
    expect(view.items.filter(i => i.subtitle === "heise")).toHaveLength(3);
    for (const item of view.items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.url).toMatch(/^https:\/\//);
    }
    const times = view.items.map(i => {
      const all = [...tagesschau.items, ...heise.items];
      return new Date(all.find(x => x.title?.trim() === i.title)!.isoDate!).getTime();
    });
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    if (process.env.UPDATE_FIXTURES) {
      writeFileSync(new URL("./fixtures/news.json", import.meta.url), JSON.stringify(view, null, 2) + "\n");
    }
  });

  it("skips items without title and caps at 30", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ title: i === 0 ? " " : `T${i}`, link: "https://x.de" }));
    const view = toListItems([{ label: "a", items }], 20, new Date());
    // The empty title is dropped before perFeed applies, so 20 of the 39 valid items remain.
    expect(view.items).toHaveLength(20);
    expect(view.items.some(i => i.title === "")).toBe(false);
    expect(toListItems([{ label: "a", items }, { label: "b", items }], 20, new Date()).items).toHaveLength(30);
  });
});

describe("formatMeta", () => {
  const now = new Date("2026-10-19T12:00:00Z"); // 14:00 in Berlin
  it("shows time today, 'gestern' and a date before that", () => {
    expect(formatMeta("2026-10-19T06:15:00Z", now)).toBe("08:15");
    expect(formatMeta("2026-10-18T20:00:00Z", now)).toBe("gestern");
    expect(formatMeta("2026-10-16T08:00:00Z", now)).toBe("16.10.");
    expect(formatMeta(undefined, now)).toBeUndefined();
    expect(formatMeta("kaputt", now)).toBeUndefined();
  });
});

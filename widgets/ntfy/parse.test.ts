import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NtfyData } from "./manifest";
import { parsePoll, topicsUrl } from "./parse";

const raw = readFileSync(new URL("./fixtures/poll.ndjson", import.meta.url), "utf8");
const fixturePath = new URL("./fixtures/ntfy.json", import.meta.url);

describe("parsePoll", () => {
  it("maps a recorded poll response, newest first", () => {
    const messages = parsePoll(raw, 20);
    expect(messages).toHaveLength(5);
    expect(messages.map(m => m.at)).toEqual([...messages.map(m => m.at)].sort().reverse());
    const rich = messages.find(m => m.id === "000000000005")!;
    expect(rich).toMatchObject({ priority: 4, tags: ["video_game"], click: "https://example.com/", topic: "test" });
    // Defaults: no title → null, no priority → 3
    expect(messages.find(m => m.id === "000000000001")).toMatchObject({ title: null, priority: 3, tags: [], click: null });

    const data = { topics: [{ name: "test", removable: false }], messages, hidden: 0 };
    expect(NtfyData.parse(data)).toEqual(data);
    if (process.env.UPDATE_FIXTURES) writeFileSync(fixturePath, JSON.stringify(data, null, 2) + "\n");
    expect(JSON.parse(readFileSync(fixturePath, "utf8"))).toEqual(data);
  });

  it("skips broken lines, other events and non-http click URLs; honors max", () => {
    const lines = [
      "not json",
      JSON.stringify({ id: "o", time: 1, event: "open", topic: "t" }),
      JSON.stringify({ id: "a", time: 10, event: "message", topic: "t", message: "x", click: "javascript:alert(1)" }),
      JSON.stringify({ id: "b", time: 20, event: "message", topic: "t", message: "y" }),
    ].join("\n");
    expect(parsePoll(lines, 20).map(m => m.id)).toEqual(["b", "a"]);
    expect(parsePoll(lines, 20)[1]!.click).toBeNull();
    expect(parsePoll(lines, 1).map(m => m.id)).toEqual(["b"]);
  });
});

describe("topicsUrl", () => {
  it("joins topics and trims trailing slashes", () => {
    expect(topicsUrl("https://ntfy.sh/", ["a", "b"])).toBe("https://ntfy.sh/a,b");
  });
});

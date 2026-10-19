import { describe, expect, it } from "vitest";
import { relativeTime } from "./time";

const now = new Date("2026-10-19T12:00:00Z").getTime();
const ago = (s: number) => new Date(now - s * 1000).toISOString();

describe("relativeTime", () => {
  it("formats German relative times", () => {
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime(ago(10), now)).toBe("gerade eben");
    expect(relativeTime(ago(3 * 60), now)).toBe("vor 3 Min.");
    expect(relativeTime(ago(2 * 3600), now)).toBe("vor 2 Std.");
    expect(relativeTime(ago(30 * 3600), now)).toBe("gestern");
    expect(relativeTime(ago(4 * 86400), now)).toBe("vor 4 Tagen");
  });
});

import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { readJsonFile, withLock, writeJsonFileAtomic } from "./json-file";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wd-json-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const Doc = z.object({ items: z.array(z.number()) });

describe("json-file", () => {
  it("reads a missing file as null", async () => {
    expect(await readJsonFile(join(dir, "nope.json"), Doc)).toBeNull();
  });

  it("names the file but not its content on bad JSON or schema", async () => {
    const file = join(dir, "bad.json");
    writeFileSync(file, '{"items": [1, "secret"');
    await expect(readJsonFile(file, Doc)).rejects.toThrow(/bad\.json: kein gültiges JSON/);
    writeFileSync(file, '{"items": ["secret"]}');
    const err = (await readJsonFile(file, Doc).catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/unerwartetes Format/);
    expect(err.message).not.toContain("secret");
  });

  it("writes atomically into a new folder without leaving a temp file", async () => {
    const file = join(dir, "sub", "doc.json");
    await writeJsonFileAtomic(file, { items: [1] });
    expect(await readJsonFile(file, Doc)).toEqual({ items: [1] });
    expect(readdirSync(join(dir, "sub"))).toEqual(["doc.json"]);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it("serializes read-modify-write per key, even after a failing step", async () => {
    const file = join(dir, "doc.json");
    await writeJsonFileAtomic(file, { items: [] });
    const append = (n: number) =>
      withLock(file, async () => {
        const doc = (await readJsonFile(file, Doc))!;
        await new Promise(r => setTimeout(r, 5));
        await writeJsonFileAtomic(file, { items: [...doc.items, n] });
      });
    const failing = withLock(file, async () => {
      throw new Error("boom");
    });
    await Promise.all([append(1), failing.catch(() => {}), append(2), append(3)]);
    expect((await readJsonFile(file, Doc))!.items).toEqual([1, 2, 3]);
  });
});

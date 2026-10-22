// Small JSON files under data/: atomic writes and per-key serialization for read-modify-write.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { z } from "zod";

/** null when the file does not exist. Bad JSON or schema → throws with the path, never the content. */
export async function readJsonFile<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T> | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path}: kein gültiges JSON`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(`${path}: unerwartetes Format`);
  return parsed.data;
}

/** Temp file + rename: readers never see half a file. */
export async function writeJsonFileAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await rename(tmp, path);
  } catch (err) {
    // Windows: EPERM/EBUSY while another handle reads the target. Retry once.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EBUSY") throw err;
    await new Promise(r => setTimeout(r, 50));
    await rename(tmp, path);
  }
}

const locks = new Map<string, Promise<unknown>>();

/** Runs fn after every earlier fn with the same key settled, so read-modify-write never interleaves. */
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  locks.set(key, settled);
  void settled.then(() => {
    if (locks.get(key) === settled) locks.delete(key);
  });
  return next;
}

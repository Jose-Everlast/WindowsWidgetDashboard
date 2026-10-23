// npx tsx scripts/record-wpn.ts [--out widgets/messenger/fixtures] [--apps whatsapp,teams,…] [--db <path>]
// Records anonymized fixtures from the Windows notification database for the messenger widget:
// - wpn-schema.sql: CREATE TABLE of Notification and NotificationHandler (no data)
// - wpn-rows.json: toasts of the matched apps; texts, names, IDs and attributes replaced by placeholders
// stdout gets statistics only (counts, timings, encodings), never a message text or a name.
import { watch } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_APPS = ["whatsapp", "teams", "discord", "slack", "lark", "feishu"];
const PER_APP = 40;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const dbPath = arg("db") ?? join(process.env.LOCALAPPDATA ?? "", "Microsoft", "Windows", "Notifications", "wpndatabase.db");
const outDir = arg("out") ?? "widgets/messenger/fixtures";
const apps = (arg("apps") ?? DEFAULT_APPS.join(",")).split(",").map(a => a.trim().toLowerCase());

interface Row {
  id: bigint;
  primaryId: string;
  type: string;
  tag: string | null;
  grp: string | null;
  arrival: bigint;
  payload: Uint8Array | string | null;
}

const QUERY = `SELECT n.Id AS id, h.PrimaryId AS primaryId, n.Type AS type, n.Tag AS tag, n."Group" AS grp,
  n.ArrivalTime AS arrival, n.Payload AS payload
  FROM Notification n JOIN NotificationHandler h ON h.RecordId = n.HandlerId
  ORDER BY n.ArrivalTime DESC`;

function query(path: string): { rows: Row[]; schema: string[] } {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const stmt = db.prepare(QUERY);
    stmt.setReadBigInts(true);
    const rows = stmt.all() as unknown as Row[];
    const schema = (
      db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name IN ('Notification', 'NotificationHandler')").all() as Array<{
        sql: string;
      }>
    ).map(r => r.sql);
    return { rows, schema };
  } finally {
    db.close();
  }
}

function timed<T>(fn: () => T): { value: T; ms: number } {
  const t = performance.now();
  const value = fn();
  return { value, ms: Math.round((performance.now() - t) * 10) / 10 };
}

function decode(payload: Row["payload"]): { text: string; encoding: string } {
  if (payload === null) return { text: "", encoding: "null" };
  if (typeof payload === "string") return { text: payload, encoding: "text" };
  if (payload[0] === 0xff && payload[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(payload.subarray(2)), encoding: "utf-16le-bom" };
  if (payload.length > 1 && payload[1] === 0) return { text: new TextDecoder("utf-16le").decode(payload), encoding: "utf-16le" };
  const bom = payload[0] === 0xef && payload[1] === 0xbb && payload[2] === 0xbf;
  return { text: new TextDecoder("utf-8").decode(bom ? payload.subarray(3) : payload), encoding: bom ? "utf-8-bom" : "utf-8" };
}

// Attribute values that carry no personal data; every other value becomes "…".
const KEEP_ATTRS = new Set([
  "template",
  "placement",
  "hint-style",
  "hint-wrap",
  "hint-maxLines",
  "hint-minLines",
  "hint-align",
  "hint-crop",
  "hint-removeMargin",
  "hint-textStacking",
  "hint-weight",
  "activationType",
  "scenario",
  "duration",
  "useButtonStyle",
  "lang",
  "version",
  "branding",
  "addImageQuery",
  "silent",
  "loop",
  "type",
  "hint-inputId",
  "afterActivationBehavior",
]);

const TEXT = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
const firstText = (xml: string) => {
  for (const m of xml.matchAll(TEXT)) if (!/placement="attribution"/.test(m[1]!) && m[2]!.trim()) return m[2]!.trim();
  return "";
};

class Placeholders {
  private map = new Map<string, string>();
  constructor(private readonly prefix: string) {}
  of(value: string | null): string {
    if (!value) return "";
    let p = this.map.get(value);
    if (!p) this.map.set(value, (p = `${this.prefix}${this.map.size + 1}`));
    return p;
  }
}

function anonymize(xml: string, title: string, messages: { n: number }): string {
  let first = true;
  return xml
    .replace(TEXT, (_m, attrs: string, inner: string) => {
      if (!inner.trim()) return `<text${attrs}>${inner}</text>`;
      if (/placement="attribution"/.test(attrs)) return `<text${attrs}>App</text>`;
      const value = first ? title : `Nachricht ${++messages.n}`;
      first = false;
      return `<text${attrs}>${value}</text>`;
    })
    .replace(/([\w:-]+)="([^"]*)"/g, (m, name: string, value: string) => {
      if (KEEP_ATTRS.has(name)) return m;
      if (name === "src" && value.startsWith("ms-winsoundevent:")) return m;
      return `${name}="…"`;
    });
}

async function main() {
  if (!existsSync(dbPath)) throw new Error(`Datenbank nicht gefunden: ${dbPath}`);
  const say = (line: string) => console.log(line);

  // 1. Original, read-only: does it open, how long does it take, which files does a read touch?
  const dir = join(dbPath, "..");
  const events: string[] = [];
  const watcher = watch(dir, (_e, f) => events.push(String(f)));
  let original: { rows: Row[]; schema: string[] } | null = null;
  try {
    const r = timed(() => query(dbPath));
    original = r.value;
    say(`Original (readOnly): ${r.ms} ms, ${r.value.rows.length} Zeilen`);
  } catch (err) {
    const e = err as { errcode?: number; message?: string };
    say(`Original (readOnly): Fehler errcode=${e.errcode ?? "?"} ${e.message ?? ""}`);
  }
  await new Promise(r => setTimeout(r, 1500));
  watcher.close();
  const touched = [...new Set(events)].filter(f => f.startsWith("wpndatabase"));
  say(`Watch-Events während des Lesens: ${touched.length ? touched.join(", ") : "keine"}`);

  // 2. Copy (db + -wal + -shm) and read it.
  const tmp = await mkdtemp(join(tmpdir(), "wd-wpn-"));
  let data: { rows: Row[]; schema: string[] };
  try {
    const c = performance.now();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(dbPath + suffix)) await copyFile(dbPath + suffix, join(tmp, `wpndatabase.db${suffix}`));
    }
    const copyMs = Math.round(performance.now() - c);
    const r = timed(() => query(join(tmp, "wpndatabase.db")));
    data = r.value;
    say(`Kopie: kopieren ${copyMs} ms, lesen ${r.ms} ms, ${r.value.rows.length} Zeilen`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  if (original && original.rows.length !== data.rows.length) say(`Achtung: Original und Kopie unterscheiden sich in der Zeilenzahl`);

  // 3. All handlers with toasts: app identities only, to find the IDs of the messengers.
  const toasts = data.rows.filter(r => r.type === "toast");
  const byHandler = new Map<string, number>();
  for (const r of toasts) byHandler.set(r.primaryId, (byHandler.get(r.primaryId) ?? 0) + 1);
  say(`\nToasts je PrimaryId (${toasts.length} gesamt):`);
  for (const [id, n] of [...byHandler].sort((a, b) => b[1] - a[1])) say(`  ${n.toString().padStart(4)}  ${id}`);

  // 4. Matched apps: structure statistics and anonymized rows.
  const matchOf = (primaryId: string) => apps.find(a => primaryId.toLowerCase().includes(a));
  const recorded: unknown[] = [];
  const encodings = new Map<string, number>();
  const bodies = new Map<string, { count: number; titles: Set<string> }>();
  const messages = { n: 0 };
  let nextId = 0;
  for (const app of apps) {
    const rows = toasts.filter(r => matchOf(r.primaryId) === app);
    if (!rows.length) continue;
    const titles = new Placeholders(app === "whatsapp" || app === "teams" ? "Chat " : "Kontakt ");
    const tags = new Placeholders("t");
    const groups = new Placeholders("g");
    const groupsPerTitle = new Map<string, Set<string>>();
    const titlesPerGroup = new Map<string, Set<string>>();
    const textCounts = new Map<number, number>();
    for (const r of rows) {
      const { text, encoding } = decode(r.payload);
      encodings.set(encoding, (encodings.get(encoding) ?? 0) + 1);
      const title = firstText(text);
      const grp = r.grp ?? "";
      if (!groupsPerTitle.has(title)) groupsPerTitle.set(title, new Set());
      groupsPerTitle.get(title)!.add(grp);
      if (!titlesPerGroup.has(grp)) titlesPerGroup.set(grp, new Set());
      titlesPerGroup.get(grp)!.add(title);
      const texts = [...text.matchAll(TEXT)].filter(m => m[2]!.trim() && !/placement="attribution"/.test(m[1]!)).map(m => m[2]!.trim());
      textCounts.set(texts.length, (textCounts.get(texts.length) ?? 0) + 1);
      for (const body of texts.slice(1)) {
        const b = bodies.get(body) ?? { count: 0, titles: new Set<string>() };
        b.count++;
        b.titles.add(title);
        bodies.set(body, b);
      }
    }
    const stableGroup = [...groupsPerTitle.values()].filter(s => s.size === 1 && ![...s][0]).length;
    say(`\n${app}: ${rows.length} Toasts, ${groupsPerTitle.size} Titel, ${titlesPerGroup.size} Group-Werte, ${new Set(rows.map(r => r.tag ?? "")).size} Tag-Werte`);
    say(`  Titel mit genau einem Group-Wert: ${[...groupsPerTitle.values()].filter(s => s.size === 1).length}/${groupsPerTitle.size} (davon leer: ${stableGroup})`);
    say(`  Group-Werte mit mehreren Titeln: ${[...titlesPerGroup.entries()].filter(([g, s]) => g && s.size > 1).length}`);
    say(`  leere Group: ${rows.filter(r => !r.grp).length}, leerer Tag: ${rows.filter(r => !r.tag).length}`);
    say(`  <text>-Elemente je Toast: ${[...textCounts].map(([k, v]) => `${k}×${v}`).join(", ")}`);

    for (const r of rows.slice(0, PER_APP)) {
      const { text } = decode(r.payload);
      recorded.push({
        id: ++nextId,
        primaryId: r.primaryId,
        type: r.type,
        tag: tags.of(r.tag),
        group: groups.of(r.grp),
        arrivalTime: r.arrival.toString(),
        payload: anonymize(text, titles.of(firstText(text)) || "", messages),
      });
    }
  }
  say(`\nPayload-Encoding: ${[...encodings].map(([k, v]) => `${k}×${v}`).join(", ") || "–"}`);

  // 5. Status line candidates: short texts repeated across several chats. Check before adopting them.
  const candidates = [...bodies].filter(([t, b]) => b.count >= 3 && b.titles.size >= 2 && t.length <= 60);
  say(`Statustext-Kandidaten (≥ 3×, ≥ 2 Chats): ${candidates.length ? "" : "keine"}`);
  for (const [t, b] of candidates) say(`  ${b.count}×  ${JSON.stringify(t)}`);

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "wpn-schema.sql"), `${data.schema.map(s => `${s};`).join("\n\n")}\n`, "utf8");
  await writeFile(join(outDir, "wpn-rows.json"), `${JSON.stringify(recorded, null, 2)}\n`, "utf8");
  say(`\n${recorded.length} Zeilen → ${join(outDir, "wpn-rows.json")}, Schema → ${join(outDir, "wpn-schema.sql")}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

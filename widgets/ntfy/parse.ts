import { z } from "zod";
import type { NtfyMessage } from "./manifest";

// One line of GET /<topics>/json?poll=1 (https://docs.ntfy.sh/subscribe/api/#json-message-format).
// Unknown fields (icon, actions, attachment, expires) are ignored.
const RawMessage = z.object({
  id: z.string(),
  time: z.number(),
  event: z.string(),
  topic: z.string(),
  title: z.string().optional(),
  message: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  click: z.string().optional(),
});

const httpUrl = z.url({ protocol: /^https?$/ });

/** Parses the NDJSON poll response; broken lines and non-message events are skipped. Newest first. */
export function parsePoll(ndjson: string, max: number): NtfyMessage[] {
  const out: NtfyMessage[] = [];
  for (const line of ndjson.split("\n")) {
    if (!line.trim()) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    const r = RawMessage.safeParse(json);
    if (!r.success || r.data.event !== "message") continue;
    const m = r.data;
    const click = httpUrl.safeParse(m.click);
    out.push({
      id: m.id,
      at: new Date(m.time * 1000).toISOString(),
      topic: m.topic,
      title: m.title?.trim() || null,
      text: m.message ?? "",
      priority: m.priority ?? 3,
      tags: m.tags ?? [],
      click: click.success ? click.data : null,
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, max);
}

/** Base URL plus the comma-joined topics, e.g. https://ntfy.sh/a,b */
export function topicsUrl(server: string, topics: string[]): string {
  return `${server.replace(/\/+$/, "")}/${topics.join(",")}`;
}

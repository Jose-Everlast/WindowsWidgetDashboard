// Title and text of a Windows toast payload (ToastGeneric XML). Pure: no DOM, it runs on the server.
import { MAX_TEXT } from "./manifest";

const TEXT = /<text\b([^>]*?)(?:\/>|>([\s\S]*?)<\/text>)/g;
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(raw: string): string {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1]!;
  return raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Adaptive groups hold decoration, not the message: WhatsApp puts "✉ 1 ungelesene Nachricht" there.
const GROUP = /<group\b[\s\S]*?<\/group>/g;
// Counter lines in place of a preview, e.g. Outlook's "+2 neue E-Mails".
const COUNTER = /^\+\d+ (neue (e-mails?|nachrichten?)|new (e-?mails?|messages?))$/i;

/**
 * First <text> = title (chat or sender), the other top-level ones joined by line breaks = body. Attribution texts
 * (placement="attribution", e.g. "via WhatsApp") and texts inside <group> are skipped. null when there is no
 * body: then it is no message. The result is plain text; it is rendered as text, never as markup.
 */
export function parseToast(xml: string): { title: string; body: string } | null {
  const texts: string[] = [];
  for (const m of xml.replace(GROUP, "").matchAll(TEXT)) {
    if (/\bplacement\s*=\s*["']attribution["']/.test(m[1]!)) continue;
    const text = decode(m[2] ?? "").trim();
    if (text && !(texts.length && COUNTER.test(text))) texts.push(text);
  }
  if (texts.length < 2) return null;
  const body = texts.slice(1).join("\n");
  return { title: texts[0]!, body: body.length > MAX_TEXT ? `${body.slice(0, MAX_TEXT - 1)}…` : body };
}

import { describe, expect, it } from "vitest";
import recorded from "./fixtures/wpn-rows.json";
import { MAX_TEXT } from "./manifest";
import { parseToast } from "./toast";

describe("parseToast on recorded toasts", () => {
  it("WhatsApp Desktop: sender and message, without the unread counter in its adaptive group", () => {
    const whatsapp = recorded.find(r => r.primaryId.includes("WhatsApp"))!;
    expect(whatsapp.payload).toContain("ungelesene Nachricht");
    expect(parseToast(whatsapp.payload)).toEqual({ title: "Chat 1", body: "Nachricht 1" });
  });

  it("Outlook: sender, then subject and preview; a '+1 neue E-Mail' counter is left out", () => {
    const [mail, counted] = recorded.filter(r => r.primaryId.includes("Outlook"));
    expect(parseToast(mail!.payload)).toEqual({ title: "Kontakt 1", body: "Nachricht 1\nNachricht 2" });
    expect(parseToast(counted!.payload)).toEqual({ title: "Kontakt 2", body: "Nachricht 3" });
  });
});

const toastXml = (texts: string) =>
  `<toast launch="…"><visual><binding template="ToastGeneric">${texts}</binding></visual><audio src="ms-winsoundevent:Notification.IM"/></toast>`;

describe("parseToast", () => {
  it("takes the first text as title and the others as body", () => {
    expect(parseToast(toastXml("<text>Chat 1</text><text>Nachricht 1</text><text>Nachricht 2</text>"))).toEqual({
      title: "Chat 1",
      body: "Nachricht 1\nNachricht 2",
    });
  });

  it("decodes entities to plain text instead of markup", () => {
    const t = parseToast(toastXml("<text>A &amp; B</text><text>&lt;b&gt;fett&lt;/b&gt; &quot;x&quot; &#228; &#x1F600;</text>"));
    expect(t).toEqual({ title: "A & B", body: '<b>fett</b> "x" ä 😀' });
  });

  it("skips attribution and empty texts, unwraps CDATA", () => {
    const xml = toastXml(`<text hint-maxLines="1">Kontakt 1</text><text/><text>  </text><text><![CDATA[<i>roh</i>]]></text><text placement="attribution">via App</text>`);
    expect(parseToast(xml)).toEqual({ title: "Kontakt 1", body: "<i>roh</i>" });
  });

  it("drops counter lines only after the title, never the title itself", () => {
    expect(parseToast(toastXml("<text>Kontakt 1</text><text>Betreff</text><text>+2 neue E-Mails</text>"))).toEqual({ title: "Kontakt 1", body: "Betreff" });
    expect(parseToast(toastXml("<text>Kontakt 1</text><text>+3 new messages</text>"))).toBeNull();
    expect(parseToast(toastXml("<text>+1 neue E-Mail</text><text>Text</text>"))).toEqual({ title: "+1 neue E-Mail", body: "Text" });
  });

  it("returns null without a body or without texts, and never throws on broken XML", () => {
    expect(parseToast(toastXml("<text>Nur Titel</text>"))).toBeNull();
    expect(parseToast("<toast><visual>")).toBeNull();
    expect(parseToast("")).toBeNull();
  });

  it(`cuts bodies longer than ${MAX_TEXT} characters`, () => {
    const t = parseToast(toastXml(`<text>T</text><text>${"x".repeat(MAX_TEXT + 50)}</text>`));
    expect(t!.body).toHaveLength(MAX_TEXT);
    expect(t!.body.endsWith("…")).toBe(true);
  });
});

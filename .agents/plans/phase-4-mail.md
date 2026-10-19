# Feature: Phase 4 – Mail-Widget (Gmail, Outlook.de, IMAP)

Der Plan sollte vollständig sein. Prüfe trotzdem vor der Umsetzung Doku, Codebase-Muster und die Sinnhaftigkeit jedes Tasks. Achte auf die exakten Namen bestehender Helfer, Typen und Dateien und importiere aus den richtigen Modulen.

## Feature Description

Ein Widget `mail` zeigt eine **gemeinsame Inbox** aller Mail-Konten:
- Ungelesen-Zähler pro Konto (Konto-Chips mit Farbe)
- die letzten ~15 Mails aller Konten gemischt: Absender, Betreff, Zeit, Konto-Farbe, ungelesen ja/nein
- Ein Klick öffnet die Mail im Webmail des Kontos, im Standardbrowser über `/api/open`.

Angebunden werden **mehrere Gmail-Konten** (Gmail-REST-API, OAuth), **ein privates Microsoft-Konto** (outlook.de, Microsoft Graph, OAuth) und **ein IMAP-Konto** (App-Passwort, `imapflow`). Die Anmeldung läuft über `GET /auth/<provider>/start?account=<id>` → Consent beim Anbieter → `GET /auth/<provider>/callback`. Die Tokens liegen in `data/tokens/<account>.json`.

Alles ist **nur lesend**:
- OAuth-Scopes `gmail.readonly` bzw. `offline_access Mail.Read`
- IMAP öffnet die Inbox nur per `EXAMINE` (read-only) und holt nur ENVELOPE und FLAGS, niemals einen Body.
- Mail-Texte werden nicht abgerufen und nicht gespeichert.

## User Story

Als Nutzer will ich die neuesten Mails aller meiner Konten in einer Liste mit Ungelesen-Zählern sehen, damit mir in einem selten geprüften Postfach nichts entgeht und ich keinen Mail-Client öffnen muss.

*Beispiel:* „Gmail privat 3 · Gmail Agentur 1 · Outlook 0 · IMAP 1“. Darunter steht „Kunde GmbH · Angebot Relaunch · vor 4 Min.“ in der Farbe des IMAP-Kontos. Ein Klick öffnet das Webmail.

## Problem Statement

Mails verteilen sich auf mehrere Gmail-Konten, outlook.de und ein IMAP-Postfach. Selten geprüfte Postfächer fallen durch, und für einen Überblick muss man drei Webmails öffnen.

## Solution Statement

- **Ein Widget-Typ `mail`** mit einer Kontenliste in der Instanz-Config (Discriminated Union nach `provider`).
- **Jedes Konto wird einzeln und parallel abgefragt** (`Promise.allSettled`) und hat einen eigenen Status: `ok`, `unconfigured` (nicht verbunden oder Secret fehlt, mit Login-Link) oder `error`. So bleibt das Widget nutzbar, auch wenn ein Konto nicht verbunden ist.
- **OAuth per `fetch` + PKCE**, ohne SDKs (Entscheidung des Nutzers). Der generische OAuth-Kern liegt in `server/auth/`, laut PRD in Abschnitt 6 ist das Kern-Code.
- **Wegen der Tests sind die Endpunkte injizierbar.** Gmail, Graph und Token-Endpunkt laufen in den Tests gegen einen echten lokalen `node:http`-Server, IMAP gegen einen echten lokalen `node:net`-IMAP-Server.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High (3 Anbieter, OAuth-Flow, Token-Rotation, neue Routen außerhalb von `/api`)
**Primary Systems Affected**: `server/auth/` (neu), `server/routes/auth.ts` (neu), `server/app.ts`, `server/static.ts`, `server/env.ts`, `server/index.ts`, `vite.config.ts`, `widgets/mail/` (neu)
**Dependencies**: `imapflow` (exakt gepinnt, siehe Task 1). Sonst nichts Neues; `fetch` und `node:crypto` sind in Node 24 eingebaut.

---

## CONTEXT REFERENCES

### Relevant Codebase Files – VOR DER UMSETZUNG LESEN

- `CLAUDE.md`, `.agents/reference/widgets.md`, `.agents/reference/security.md`, `.agents/reference/testing.md`: Pflicht.
- `shared/widget-contract.ts`:
  - `defineManifest` / `defineCollector`, `CollectContext` (`config`, `env`, `signal`, `log`), `WidgetProps`, `missingEnv` (am Dateiende)
  - `WidgetManifest.env` (Z. 33) macht die **ganze** Instanz `unconfigured`. Für Mail wird es **nicht** benutzt, weil Teilkonfiguration der Normalfall ist (siehe Design 3).
- `server/scheduler.ts`:
  - `refresh(instance)` (Z. 215) wird nach dem OAuth-Callback aufgerufen.
  - `timeoutMs` und `signal`: Der Scheduler bricht ab und markiert die Instanz als hängend, solange ein Lauf nicht settled.
- `server/routes/api.ts`: Routenmuster (`Hono`, `parseJson`, `HttpError`, `notFound`), `ApiDeps`-Injektion.
- `server/app.ts`: Reihenfolge der Mounts. `dashboardRoutes` muss **zuletzt** kommen (SPA-Fallback).
- `server/static.ts` Z. 33: `RESERVED = /^\/api(\/|$)/`. Um `/auth` erweitern, damit der SPA-Fallback `/auth/...` nicht schluckt.
- `server/guard.ts`: Host-Check für alle Requests. Ändernde Requests prüft er nur unter `/api/`. Die Auth-Routen sind GET und brauchen den OAuth-`state` als CSRF-Schutz (siehe Design 6).
- `server/index.ts`: Bootstrap, `localHosts` (`127.0.0.1:4700`, `localhost:4700`, 5174), Aufbau der `createApp`-Deps.
- `server/env.ts`: `ROOT`, `config`. `dataDir` kommt neu dazu.
- `server/http.ts`: `HttpError`.
- `server/log.ts`: `log(scope, …)` / `logError(scope, …)`.
- `widgets/relaunch-radar/collect.ts`:
  - Kern als reine, injizierbare Funktion (`fetchImpl`, `readFile`)
  - Fehlerklasse `FormatError`
  - `getJson` mit zod-Prüfung fremder Antworten
- `widgets/relaunch-radar/collector.ts`: dünner Wrapper, Import aus `../../server/lib/...` ist erlaubt.
- `widgets/relaunch-radar/collector.test.ts` (Z. 1–60): **Testmuster** mit echtem lokalem HTTP-Server auf Port 0, Routen-Tabelle, Fixtures per `new URL("./fixtures/…", import.meta.url)`, `mkdtempSync` und `afterEach`-Cleanup.
- `widgets/relaunch-radar/manifest.ts`: Aufbau von Config- und Data-Schema, `z.url({ protocol: /^https?$/ })`.
- `widgets/relaunch-radar/Widget.tsx`: Muster für `useNow`, `Section`, Badges, `openUrl`, `relativeTime` sowie die Tailwind-Tokens `text-muted`, `text-good`, `bg-warn/15`, `bg-line` usw.
- `widgets/news/collector.ts`: `Promise.allSettled` über mehrere Quellen; geworfen wird erst, wenn alle scheitern.
- `widgets/agents/collect.ts`: Teilausfälle tolerieren, Hilfsdaten sind `null`.
- `widgets/contract.test.ts`: prüft `fixtures/<id>.json` gegen `manifest.data` für jeden Ordner.
- `server/app.test.ts`: `createApp(deps)` mit `app.request(...)`, `allowedHosts` enthält `"localhost"`; Muster für 403/415-Tests.
- `web/src/lib/openUrl.ts`: Links öffnen. Akzeptiert nur absolute http(s)-URLs, weil der Server sie mit `z.url` prüft.
- `vite.config.ts`: Proxy nur für `/api`. `/auth` kommt dazu.
- `.env.example`, `dashboard.config.example.json`, `README.md` (Abschnitt „Widgets“), `PRD.md` Abschnitte 9, 10 und 12.

### New Files to Create

```
server/auth/pkce.ts                 # verifier/challenge/state (node:crypto)
server/auth/providers.ts            # Google + Microsoft: Endpunkte, authorizeUrl, exchangeCode, refresh; OAuthError
server/auth/token-store.ts          # data/tokens/<account>.json atomar, per-Konto-Lock, getAccessToken()
server/auth/pending.ts              # In-Memory-Store für state → { provider, account, verifier }, TTL 10 min
server/auth/auth.test.ts            # pkce, pending, token-store + providers gegen lokalen HTTP-Server
server/routes/auth.ts               # GET /auth/:provider/start, /auth/:provider/callback
server/routes/auth.test.ts          # Routen-Tests (createApp + lokaler Token-Server)
widgets/mail/manifest.ts            # Config (accounts-Union) + Data-Schema
widgets/mail/parse.ts               # reine Mapper: Gmail/Graph/IMAP → MailMessage, Merge/Sort, Link-Bau (browser-safe)
widgets/mail/parse.test.ts
widgets/mail/gmail.ts               # Gmail-REST per fetch (server-only)
widgets/mail/outlook.ts             # Graph per fetch (server-only)
widgets/mail/imap.ts                # imapflow-Adapter (server-only)
widgets/mail/collect.ts             # collectMail(): Konten parallel, Status pro Konto
widgets/mail/collector.ts           # dünner Wrapper
widgets/mail/collector.test.ts      # gegen lokalen HTTP- und IMAP-Server
widgets/mail/Widget.tsx
widgets/mail/Widget.test.tsx        # jsdom: Chips, Verbinden-Link, Klick öffnet URL
widgets/mail/README.md              # deutsch: Einrichtung Google Cloud, Azure, IMAP
widgets/mail/fixtures/mail.json                 # erwartete Payload (UPDATE_FIXTURES)
widgets/mail/fixtures/gmail-label-inbox.json    # echte, anonymisierte Aufnahmen
widgets/mail/fixtures/gmail-messages-list.json
widgets/mail/fixtures/gmail-message-metadata.json
widgets/mail/fixtures/gmail-profile.json
widgets/mail/fixtures/graph-inbox.json
widgets/mail/fixtures/graph-messages.json
widgets/mail/fixtures/imap-fetch.txt            # untagged FETCH-Antworten aus einer echten Session
```

### Relevant Documentation – VOR DER UMSETZUNG LESEN

- [Google OAuth für Desktop-Apps](https://developers.google.com/identity/protocols/oauth2/native-app): `#step1-code-verifier`, `#create-code-challenge`, Loopback-Redirect, Token-Austausch.
  - Wichtig: Für Desktop-Clients trotzdem **`client_secret` mitsenden**. Laut Doku optional, praktisch oft Pflicht ("client_secret is missing").
- [Google Refresh-Token-Ablauf](https://developers.google.com/identity/protocols/oauth2#expiration): Im Publishing-Status „Testing“ laufen Tokens nach **7 Tagen** ab. Deshalb muss die App auf „In production“ stehen (unverifiziert ist ok, es gibt eine Warnseite und ein Limit von 100 Nutzern).
  - `invalid_grant` = neu anmelden. Das passiert auch nach einer Passwortänderung.
- [Gmail users.labels (Label-Ressource)](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels#Label): `threadsUnread`, `messagesUnread`.
- [Gmail users.messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list) und [users.messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get): `format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`.
- [Gmail-Quota](https://developers.google.com/workspace/gmail/api/reference/quota): `get` kostet 20 Einheiten, `list` 5, `labels.get` 1. Bei 10 Mails sind das ≈ 206 Einheiten pro Poll, das Limit liegt bei 6000 pro Minute.
- [Microsoft Auth-Code-Flow v2](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow): Tenant `consumers`, PKCE, Public Client **ohne Secret**.
  - Beim Token-Request **keinen `Origin`-Header** senden. Sonst wertet Microsoft ihn als SPA-Request, und der Refresh-Token gilt nur 24 h. Node-`fetch` setzt keinen Origin-Header.
- [Microsoft Redirect-URI-Regeln, localhost](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url#localhost-exceptions): Der **Port wird bei `http://localhost` ignoriert**, der Pfad muss exakt passen. Registriert wird `http://localhost/auth/microsoft/callback` (Plattform „Mobile and desktop applications“).
- [Microsoft Refresh Tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens): Jeder Refresh liefert einen **neuen** Refresh-Token, der persistiert werden muss. Lebensdauer 90 Tage, gleitend.
- [Graph mailFolder get](https://learn.microsoft.com/en-us/graph/api/mailfolder-get?view=graph-rest-1.0) (`unreadItemCount`) und [list messages](https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messages?view=graph-rest-1.0) (`$top`, `$select`, `$orderby=receivedDateTime desc`). Das Feld `webLink` ist in der [message-Ressource](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0) beschrieben.
- [imapflow](https://imapflow.com/) und das [README auf GitHub](https://github.com/postalsys/imapflow):
  - `getMailboxLock(path, { readOnly: true })` öffnet per EXAMINE.
  - `status(path, { unseen: true })` liefert die Ungelesen-Zahl.
  - `fetch(range, { envelope, flags, internalDate, uid })`
  - `client.on("error", …)` ist **Pflicht**.
  - Eine Instanz kann sich nicht neu verbinden, deshalb pro Poll eine neue Instanz.
  - Ab Version 2.x sind die Typen mitgeliefert.

### Patterns to Follow

**Pure core + thin wrapper** (aus `widgets/relaunch-radar/collector.ts`):
```ts
export const collector = defineCollector(manifest, {
  collect: ({ config, signal }) => collectRelaunchRadar({ config, signal }),
});
```

**Fremde JSON-Antworten immer mit zod prüfen** (aus `widgets/relaunch-radar/collect.ts:17-23`):
```ts
const res = await (o.fetchImpl ?? fetch)(`${base}${path}`, { signal: o.signal });
if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
const parsed = schema.safeParse(await res.json());
if (!parsed.success) throw new FormatError(`… unerwartetes Format – ${z.prettifyError(parsed.error)}`);
```
Eingangsschemas sind nachsichtig (`z.object`, nicht `strictObject`) und lesen nur die benötigten Felder.

**Teilausfälle** (aus `widgets/news/collector.ts`): `Promise.allSettled`, Fehler pro Quelle loggen, nur werfen, wenn nichts mehr geht.

**Logging:** `ctx.log(...)` im Collector, Scope setzt der Scheduler. In `server/auth/` `log("auth", …)` / `logError("auth", …)`. **Nie Tokens, Codes oder Passwörter loggen.**

**Routen-Fehler:** `throw new HttpError(status, "…")`. `app.onError` mappt nach JSON. Ausnahme: Die Callback-Route antwortet mit `c.text(...)` (deutscher Klartext für den Browser, **kein HTML**), weil der Nutzer sie im Browser sieht.

**Naming:** kebab-case-Dateien, `collectMail`, Konto-IDs in kebab-case (`gmail-privat`), zod-Schemas in PascalCase (`MailConfig`, `MailData`, `GmailLabelIn`).

---

## DESIGN-ENTSCHEIDUNGEN

1. **Ein Widget, viele Konten.** Die Instanz-Config enthält `accounts: Account[]` (Union nach `provider`: `gmail | outlook | imap`). Konto-IDs sind **global eindeutig**, weil sie Token-Dateinamen sind. Das Schema prüft die Eindeutigkeit innerhalb der Instanz. Instanzübergreifend prüft `oauthAccounts()` in `index.ts` und bricht den Start mit einer klaren Meldung ab.
2. **Secrets vs. Einstellungen** (CLAUDE.md):
   - `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MS_CLIENT_ID`, `MS_TENANT` (Default `consumers`), `IMAP_PASSWORD`
   - `dashboard.config.json`: IMAP `host`, `port`, `user`, `webmailUrl`, `passwordEnv` (Name der Variable, Default `IMAP_PASSWORD`, für ein späteres zweites Konto)
   - **Abweichung vom PRD**, dort stehen `IMAP_HOST`/`IMAP_USER` in `.env`. Diese Werte sind aber keine Secrets, deshalb gehören sie laut CLAUDE.md in die Config. Das PRD wird nachgezogen.
3. **Status pro Konto statt `manifest.env`.**
   - `accounts[i].status`:
     - `ok`
     - `unconfigured` mit Grund und optional `action` (relativer Pfad `/auth/google/start?account=<id>`). Gründe: Client-ID fehlt, kein Token, `invalid_grant`, IMAP-Passwort fehlt.
     - `error` mit Meldung
   - Die Instanz ist `ok`, solange **mindestens ein Konto** `ok` oder `unconfigured` ist.
   - **Alle konfigurierten Konten sind `error`** → `collect()` wirft mit den zusammengefassten Meldungen. Der Scheduler zeigt dann `stale` mit den alten Daten oder `error`.
4. **Ungelesen-Zähler:**
   - Gmail: `threadsUnread` von `labels/INBOX`, entspricht der Konversationsansicht im Webmail.
   - Graph: `unreadItemCount` der Inbox.
   - IMAP: `STATUS INBOX (UNSEEN)`.
   - In der Validierung gegen das Webmail prüfen und im README nennen.
5. **Nachrichtenliste:** pro Konto die neuesten `perAccount` (Default 10) Inbox-Mails, zusammengeführt, absteigend nach `receivedAt` sortiert, `limit` (Default 15) Stück. Felder: `id`, `account`, `from` (Name, sonst Adresse), `subject` (leer → „(kein Betreff)“, auf 200 Zeichen gekürzt), `receivedAt` (ISO), `unread`, `url` (absolute https-URL oder `null`). **Kein Snippet, kein Body.**
6. **OAuth-Flow und CSRF:**
   - `start` legt `{ state, verifier, provider, account, createdAt }` in einen In-Memory-Store (TTL 10 min, höchstens 20 Einträge, die ältesten fliegen raus) und leitet per 302 zum Consent weiter.
   - `callback` akzeptiert nur einen **bekannten, unverbrauchten** `state` mit passendem Provider. Der `state` wird beim ersten Zugriff gelöscht (single use).
   - Damit ist Login-CSRF durch fremde Seiten ausgeschlossen. Der Host-Check gilt wie für jede Route.
   - Die Routen nehmen nur Konto-IDs an, die in der Config mit diesem Provider stehen.
7. **Redirect-URIs:**
   - Google (Desktop-Client, jeder Loopback-Port und -Pfad erlaubt): `http://127.0.0.1:<PORT>/auth/google/callback`
   - Microsoft (`localhost` ist ohne Manifest-Bearbeitung registrierbar, der Port wird ignoriert): `http://localhost:<PORT>/auth/microsoft/callback`
   - Beide Hosts stehen schon in `allowedHosts`. Den `state` hält der Server im Speicher, es gibt keine Cookies, deshalb spielt der unterschiedliche Host keine Rolle.
   - Die Redirect-URI wird an **einer** Stelle gebaut (`redirectUri(provider, port)`) und identisch für Authorize und Token-Austausch benutzt.
8. **Token-Store** `data/tokens/<account>.json`:
   - Inhalt: `{ provider, refreshToken, accessToken, expiresAt, email | null, savedAt }`
   - Atomar schreiben (Temp-Datei, dann `rename`).
   - **Per-Konto-Lock** (Map `account → Promise`), damit Collect und Callback nicht gleichzeitig refreshen. Das ist wichtig bei Microsofts Refresh-Token-Rotation.
   - Access-Tokens werden bis 60 s vor `expiresAt` wiederverwendet.
   - Der neue `refresh_token` aus einer Refresh-Antwort wird immer persistiert, wenn vorhanden. Fehlt er (Google), bleibt der alte.
   - `invalid_grant` → `ReauthRequiredError`, das Konto wird `unconfigured` mit Login-Link. Die Datei bleibt liegen, der nächste Login überschreibt sie.
9. **Links:**
   - Gmail: `https://mail.google.com/mail/u/<email>/#all/<threadId>`. `email` kommt aus `users/me/profile`, wird beim Callback abgefragt und im Token-Store gespeichert. Fehlt sie, gibt es `/u/0/`.
   - Graph: `webLink` nur, wenn es `https:` ist und der Host in `outlook.live.com | outlook.office.com | outlook.office365.com` liegt; sonst `null`.
   - IMAP: `webmailUrl` aus der Config (alle Mails dieses Kontos verlinken dorthin) oder `null`.
   - Alle Links gehen nur über `/api/open` hinaus (rundll32, normalisiert).
10. **IMAP sicher und schnell:**
    - Pro Poll eine neue `ImapFlow`-Instanz.
    - `secure: true` (993), `logger: false`, `connectionTimeout: 10_000`, `greetingTimeout: 10_000`, `socketTimeout: 30_000`, `disableAutoIdle: true`
    - `client.on("error", …)` registrieren.
    - Bei `signal.abort` → `client.close()`.
    - `status("INBOX", { unseen: true })`, dann `getMailboxLock("INBOX", { readOnly: true })`, `fetch` über die letzten N Sequenznummern mit `{ uid: true, envelope: true, flags: true, internalDate: true }`.
    - Am Ende `lock.release()` und `logout()` in `finally`.
    - **Nie `rejectUnauthorized: false`.**
11. **Intervall** 120 s (laut PRD), `timeoutMs` 30 s. Die Konten laufen parallel. Jedes Konto bekommt das Scheduler-`signal`, `fetch(…, { signal })`.
12. **Nach dem Callback** ruft die Route `scheduler.refresh(instance)` für jede Instanz vom Typ `mail` auf (aus `cache.all()`, gefiltert nach `type === "mail"`), fire-and-forget mit `.catch(logError)`. Das neue Konto erscheint so sofort.

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation
Dependency, `dataDir`, OAuth-Kern (PKCE, pending, Provider, Token-Store) mit Tests.

### Phase 2: Core
Widget `mail`: Manifest, reine Parser, Gmail-, Graph- und IMAP-Adapter, `collectMail`.

### Phase 3: Integration
Auth-Routen, `app.ts`/`static.ts`/`index.ts`, Vite-Proxy, Widget-UI, Konfiguration, Doku.

### Phase 4: Testing & Validation
Fixtures echt aufnehmen (nach der OAuth-Einrichtung durch den Nutzer), `npm run check`, manueller Abgleich mit dem Webmail.

---

## STEP-BY-STEP TASKS

Tasks der Reihe nach von oben nach unten ausführen. Hinweis: Der PostToolUse-Hook meldet bei Änderungen über mehrere Dateien Typecheck-Zwischenstände; die sind normal.

### 1. ADD Dependency `imapflow`

- **IMPLEMENT:** `npm i -E imapflow@2.5.5`
  - Exakt gepinnt, weil es seit 2.0 (2026-09-07) Releases fast täglich gibt, sieben davon in den letzten drei Tagen.
  - 2.5.5 enthält die Härtung gegen feindliche Server aus 2.5.1.
  - Vorher `npm view imapflow time --json` und das Changelog von 2.5.6/2.5.7 prüfen. Wenn dort ein Fix für `fetch`, `status` oder `getMailboxLock` steht, die neuere Version nehmen und im Commit begründen.
  - **Kein** `@types/imapflow`, die Typen kommen mit.
- **GOTCHA:** Die Abhängigkeit kommt nach `dependencies`, nicht nach `devDependencies`, weil der Server mit tsx läuft.
- **VALIDATE:** `node -e "import('imapflow').then(m => console.log(typeof m.ImapFlow))"` gibt `function` aus.

### 2. UPDATE `server/env.ts`

- **ADD:** `dataDir: join(ROOT, "data")` in `config`. `data/` ist schon gitignored.
- **VALIDATE:** `npm run typecheck`

### 3. CREATE `server/auth/pkce.ts`

- **IMPLEMENT:**
  - `createVerifier()`: `randomBytes(32).toString("base64url")`, ergibt 43 Zeichen.
  - `challengeOf(verifier)`: `createHash("sha256").update(verifier).digest("base64url")`
  - `createState()`: `randomBytes(16).toString("base64url")`
- **IMPORTS:** `import { createHash, randomBytes } from "node:crypto";`
- **VALIDATE:** Test in Task 7. Prüfe den RFC-7636-Testvektor `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`.

### 4. CREATE `server/auth/pending.ts`

- **IMPLEMENT:** `createPendingStore({ ttlMs = 600_000, max = 20, now = Date.now })`
  - `put(entry)` gibt den `state` zurück.
  - `take(state)` liefert den Eintrag oder `undefined`. Der Eintrag wird **immer** gelöscht. Abgelaufene Einträge → `undefined`.
  - Bei mehr als `max` Einträgen fliegt der älteste raus.
- **Typ:** `PendingAuth = { provider: OAuthProviderId; account: string; verifier: string; createdAt: number }`
- **VALIDATE:** Test in Task 7.

### 5. CREATE `server/auth/providers.ts`

- **IMPLEMENT:**
  - `export type OAuthProviderId = "google" | "microsoft";`
  - `export interface OAuthEndpoints { authorize: string; token: string }`
  - Defaults:
    - Google: `https://accounts.google.com/o/oauth2/v2/auth`, `https://oauth2.googleapis.com/token`
    - Microsoft: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize` und `/token`, `tenant = env.MS_TENANT || "consumers"`
  - `SCOPES`:
    - Google: `https://www.googleapis.com/auth/gmail.readonly`
    - Microsoft: `offline_access Mail.Read`
  - `redirectUri(provider, port)`:
    - google → `http://127.0.0.1:${port}/auth/google/callback`
    - microsoft → `http://localhost:${port}/auth/microsoft/callback`
  - `missingCredentials(provider, env)`: `string[]` mit `missingEnv` aus `@shared/widget-contract`
    - google: `["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET"]`
    - microsoft: `["MS_CLIENT_ID"]`
  - `authorizeUrl({ provider, env, port, state, challenge, loginHint? , endpoints? })` gibt einen `string` zurück.
    - Gemeinsam: `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`
    - Google zusätzlich: `access_type=offline`, `prompt=consent`
    - Microsoft zusätzlich: `response_mode=query`, `prompt=select_account`
  - `exchangeCode({ provider, env, port, code, verifier, signal, endpoints?, fetchImpl? })` gibt `TokenSet` zurück.
  - `refreshAccessToken({ provider, env, refreshToken, signal, endpoints?, fetchImpl? })` gibt `TokenSet` zurück.
  - Beide POSTen `application/x-www-form-urlencoded` (`new URLSearchParams`):
    - Google sendet `client_secret` mit.
    - Microsoft sendet **kein** Secret und keinen Origin-Header.
  - `TokenIn = z.object({ access_token: z.string(), expires_in: z.number(), refresh_token: z.string().optional() })` → `TokenSet = { accessToken, expiresAt: number, refreshToken?: string }`
  - Fehler: `res.ok === false` → Body lesen, `z.object({ error: z.string(), error_description: z.string().optional() })`.
    - `error === "invalid_grant"` → `throw new ReauthRequiredError(...)`
    - sonst `throw new OAuthError(\`${provider}: ${error}\`)`
    - In Fehlermeldungen **nie** Request-Parameter übernehmen.
- **IMPORTS:** `zod`, `missingEnv` aus `@shared/widget-contract`
- **GOTCHA:** `expires_in` ist eine Zahl in Sekunden: `expiresAt = now() + expires_in * 1000`. `now` injizierbar machen.
- **VALIDATE:** Test in Task 7 gegen einen lokalen HTTP-Token-Server.

### 6. CREATE `server/auth/token-store.ts`

- **IMPLEMENT:**
  - `StoredToken = z.object({ provider: z.enum(["google","microsoft"]), refreshToken: z.string().min(1), accessToken: z.string().nullable(), expiresAt: z.number().nullable(), email: z.string().nullable(), savedAt: z.string() })`
  - `createTokenStore({ dir, now = Date.now, fetchImpl?, endpoints?: Partial<Record<OAuthProviderId, OAuthEndpoints>> })` mit:
    - `read(account)`: `StoredToken | null`. Fehlende Datei → `null`. Kaputtes JSON oder falsches Schema → werfen mit Dateipfad, ohne Inhalt.
    - `save(account, token)`: `mkdir -p dir`, schreibt `<account>.json.tmp`, dann `rename`.
    - `accessToken(account, provider, env, signal)`: Promise mit einem gültigen Access-Token.
      - Ein Lock pro Konto (`Map<string, Promise<unknown>>`, Kette `prev.then(fn, fn)`).
      - Kein Token → `NotConnectedError`. Gespeicherter `provider` ≠ angefragter → `NotConnectedError`.
      - Noch gültig (`expiresAt - 60_000 > now()`) → zurückgeben.
      - Sonst `refreshAccessToken`, danach `save` mit dem neuen `accessToken`, `expiresAt` und `refreshToken ?? alt`.
  - Kontonamen prüfen: `/^[a-z0-9][a-z0-9-]*$/`, sonst werfen (Path Traversal).
- **Fehlerklassen:** `NotConnectedError`, `ReauthRequiredError` (aus `providers.ts` re-exportieren), `OAuthError`
- **GOTCHA:**
  - `rename` auf Windows kann `EPERM` werfen, wenn die Zieldatei gerade gelesen wird. Einmal nach 50 ms erneut versuchen.
  - Die Datei enthält Secrets: nie loggen, nie über `/api` ausliefern.
- **VALIDATE:** Test in Task 7.

### 7. CREATE `server/auth/auth.test.ts`

- **IMPLEMENT:** Vitest mit Muster aus `widgets/relaunch-radar/collector.test.ts` (lokaler `node:http`-Server auf Port 0, der den Token-Endpunkt spielt und Request-Bodies mitschneidet).
- **Tests:**
  - **PKCE:** RFC-7636-Vektor; die Länge des Verifiers liegt zwischen 43 und 128.
  - **pending:**
    - `take` nur einmal
    - Ablauf nach TTL (`now` injizieren)
    - der älteste fliegt bei `max` raus
  - **authorizeUrl:**
    - Google enthält `code_challenge_method=S256`, `access_type=offline`, die richtige `redirect_uri`.
    - Microsoft nutzt den Tenant aus `MS_TENANT` bzw. `consumers` und `redirect_uri` mit `localhost`.
  - **exchangeCode:**
    - Google-Body enthält `client_secret` und `code_verifier`.
    - Microsoft-Body enthält **kein** `client_secret`.
  - **Token-Store:**
    - `accessToken` refresht nur, wenn abgelaufen.
    - Ein rotierter `refresh_token` wird persistiert, Datei danach lesen.
    - Ohne `refresh_token` in der Antwort bleibt der alte.
    - Zwei parallele `accessToken`-Aufrufe → **ein** Request an den Token-Server (Lock).
    - `invalid_grant` (400) → `ReauthRequiredError`.
    - 500 → `OAuthError` (nicht Reauth).
    - Fehlende Datei → `NotConnectedError`.
    - Konto `../x` → wirft.
- **Fixtures:** Token-Antworten zunächst nach dem Doku-Beispiel bauen. **In Task 21 durch echte, anonymisierte Antworten ersetzen** (Tokens → `"ya29.REDACTED"` / `"M.C5_REDACTED"`).
- **VALIDATE:** `npx vitest run server/auth`

### 8. CREATE `widgets/mail/manifest.ts`

- **IMPLEMENT:**
  ```ts
  const AccountId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "kebab-case erwartet, z. B. gmail-privat");
  const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/).optional();
  const Base = { id: AccountId, label: z.string().min(1), color: Color };
  export const MailAccount = z.discriminatedUnion("provider", [
    z.object({ ...Base, provider: z.literal("gmail") }),
    z.object({ ...Base, provider: z.literal("outlook") }),
    z.object({
      ...Base,
      provider: z.literal("imap"),
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535).default(993),
      user: z.string().min(1),
      passwordEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).default("IMAP_PASSWORD"),
      webmailUrl: z.url({ protocol: /^https$/ }).optional(),
    }),
  ]);
  export const MailConfig = z.object({
    accounts: z.array(MailAccount).min(1).refine(a => new Set(a.map(x => x.id)).size === a.length, "Konto-IDs müssen eindeutig sein"),
    limit: z.number().int().min(1).max(50).default(15),
    perAccount: z.number().int().min(1).max(25).default(10),
  });
  export const AccountStatus = z.enum(["ok", "unconfigured", "error"]);
  export const MailData = z.object({
    accounts: z.array(z.object({
      id: z.string(), label: z.string(), provider: z.enum(["gmail","outlook","imap"]), color: z.string(),
      status: AccountStatus, unread: z.number().int().nullable(), email: z.string().nullable(),
      error: z.string().optional(), action: z.string().regex(/^\/auth\//).optional(),
    })),
    messages: z.array(z.object({
      id: z.string(), account: z.string(), from: z.string(), subject: z.string(),
      receivedAt: z.string(), unread: z.boolean(), url: z.url({ protocol: /^https$/ }).nullable(),
    })).max(50),
  });
  export const manifest = defineManifest({
    id: "mail", title: "Mail", version: 1, category: "comms",
    defaultSize: { w: 3, h: 3 }, intervalMs: 120_000, timeoutMs: 30_000,
    capabilities: ["network"], config: MailConfig, data: MailData,
  });
  ```
- **Farben:** Fehlt `color`, kommt eine Default-Palette nach Index zum Einsatz, z. B. `["#60a5fa","#f472b6","#34d399","#fbbf24","#a78bfa"]`. Die Palette steht in `parse.ts` (`accountColor(i, color?)`).
- **GOTCHA:**
  - Nur `zod` und `@shared` importieren (wird im Browser gebündelt).
  - `z.url({ protocol: /^https$/ })` für Links, Mail-Links sind nie http.
- **VALIDATE:** `npm run typecheck`

### 9. CREATE `widgets/mail/parse.ts` + `parse.test.ts`

- **IMPLEMENT** (rein, browser-safe, kein Node-Import):
  - Eingangsschemas, nachsichtig:
    - `GmailLabelIn = z.object({ threadsUnread: z.number().optional(), messagesUnread: z.number().optional() })`
    - `GmailListIn = z.object({ messages: z.array(z.object({ id: z.string(), threadId: z.string() })).optional() })`. Eine leere Inbox kommt **ohne** `messages`-Feld.
    - `GmailMessageIn = z.object({ id, threadId, labelIds: z.array(z.string()).optional(), internalDate: z.string(), payload: z.object({ headers: z.array(z.object({ name: z.string(), value: z.string() })).optional() }) })`
    - `GmailProfileIn = z.object({ emailAddress: z.string() })`
    - `GraphFolderIn = z.object({ unreadItemCount: z.number() })`
    - `GraphMessagesIn = z.object({ value: z.array(z.object({ id, subject: z.string().nullable(), receivedDateTime: z.string(), isRead: z.boolean(), webLink: z.string().nullable().optional(), from: z.object({ emailAddress: z.object({ name: z.string().optional(), address: z.string().optional() }) }).nullable().optional() })) })`
  - `displayFrom(name?, address?)`:
    - Gmail-Header `From: "Kunde GmbH" <a@b.de>` → `Kunde GmbH`
    - `a@b.de` → `a@b.de`
    - leer → `(unbekannt)`
  - `cleanSubject(s)`: trimmen, leer → `(kein Betreff)`, auf 200 Zeichen mit `…` kürzen.
  - `fromGmail(msg, accountId, email)`:
    - `unread = labelIds.includes("UNREAD")`
    - `receivedAt = new Date(Number(internalDate)).toISOString()`
    - `url = gmailUrl(email, threadId)`
  - `gmailUrl(email | null, threadId)`: `https://mail.google.com/mail/u/${email ? encodeURIComponent(email) : "0"}/#all/${encodeURIComponent(threadId)}`
  - `fromGraph(msg, accountId)` mit `safeOutlookLink(webLink)`: https und Host in der Allowlist, sonst `null`.
  - `fromImap({ uid, envelope, flags, internalDate }, accountId, webmailUrl)`: `id = \`${accountId}:${uid}\``, `unread = !flags.includes("\\Seen")`, Datum aus `envelope.date ?? internalDate`.
  - `mergeMessages(lists, limit)`: flach, sortiert absteigend nach `receivedAt`, `slice(0, limit)`.
- **Tests:**
  - gegen die echten Fixtures (Task 21; bis dahin nach Doku-Struktur)
  - Header-Parsing mit Anführungszeichen und Umlauten (RFC-2047 dekodiert Gmail bereits)
  - leere Inbox ohne `messages`
  - `webLink` mit fremdem Host → `null`
  - `javascript:`-Link → `null`
  - Sortierung, Limit
  - `TZ=UTC` und Europe/Berlin liefern dasselbe ISO
- **VALIDATE:** `npx vitest run widgets/mail/parse.test.ts`

### 10. CREATE `widgets/mail/gmail.ts`

- **IMPLEMENT:** `collectGmail({ account, token: () => Promise<string>, email, perAccount, signal, fetchImpl?, base = "https://gmail.googleapis.com/gmail/v1/users/me" })` gibt `{ unread, messages }` zurück.
  - `getJson(path, schema)` mit `Authorization: Bearer`, `signal`, zod-Prüfung (Muster aus relaunch-radar).
  - Ablauf:
    1. `GET /labels/INBOX` → `threadsUnread ?? messagesUnread ?? null`
    2. `GET /messages?labelIds=INBOX&maxResults=${perAccount}`
    3. `Promise.all` über die IDs: `GET /messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
  - 401 → einmal mit `token({ force: true })` wiederholen; danach `ReauthRequiredError`.
- **GOTCHA:** `metadataHeaders` als wiederholten Parameter senden (`URLSearchParams.append`), keine Komma-Liste.
- **VALIDATE:** Tests in Task 14.

### 11. CREATE `widgets/mail/outlook.ts`

- **IMPLEMENT:** `collectOutlook({ account, token, perAccount, signal, fetchImpl?, base = "https://graph.microsoft.com/v1.0/me" })`
  - `GET /mailFolders/inbox?$select=unreadItemCount`
  - `GET /mailFolders/inbox/messages?$top=${perAccount}&$select=id,from,subject,receivedDateTime,isRead,webLink&$orderby=receivedDateTime desc`
  - Mapping mit `fromGraph`.
- **GOTCHA:** `$`-Parameter mit `URLSearchParams` bauen, das kodiert Leerzeichen korrekt. Kein `$filter` mit `$orderby` kombinieren.
- **VALIDATE:** Tests in Task 14.

### 12. CREATE `widgets/mail/imap.ts`

- **IMPLEMENT:** `collectImap({ account, password, perAccount, signal, transport? })`. `transport` ist test-only: `{ secure: boolean; port?: number }`.
  ```ts
  const client = new ImapFlow({ host, port, secure: transport?.secure ?? true, auth: { user, pass: password },
    logger: false, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000, disableAutoIdle: true,
    doSTARTTLS: transport?.secure === false ? false : undefined });
  client.on("error", err => log?.(...)); // Pflicht, sonst crasht der Prozess
  const onAbort = () => client.close();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    await client.connect();
    const status = await client.status("INBOX", { unseen: true });
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const exists = client.mailbox ? client.mailbox.exists : 0;
      // nur ENVELOPE/FLAGS → niemals \Seen setzen
      for await (const m of client.fetch(`${Math.max(1, exists - perAccount + 1)}:*`, { uid: true, envelope: true, flags: true, internalDate: true })) …
    } finally { lock.release(); }
    await client.logout();
  } finally { signal.removeEventListener("abort", onAbort); client.close(); }
  ```
- **GOTCHA:**
  - `exists === 0` → **kein** fetch (`1:*` würde sonst fehlschlagen).
  - `client.mailbox` kann `false` sein.
  - Den Typ `FetchMessageObject` aus `imapflow` verwenden; `flags` ist ein `Set<string>`, für `fromImap` in ein Array umwandeln.
  - Auth-Fehler (`authenticationFailed`) → klare Meldung `"IMAP-Anmeldung fehlgeschlagen"` als normaler `Error` (Status `error`), nicht `unconfigured`.
  - `client.close()` nach `logout()` ist harmlos (idempotent).
- **IMPORTS:** `import { ImapFlow, type FetchMessageObject } from "imapflow";`
- **VALIDATE:** Test in Task 14 gegen einen lokalen `node:net`-IMAP-Server.

### 13. CREATE `widgets/mail/collect.ts` + `collector.ts`

- **IMPLEMENT** `collectMail({ config, env, signal, tokens: TokenStore, log, adapters? })`. `adapters` ist für Tests: `{ gmailBase?, graphBase?, imapTransport?, fetchImpl? }`.
  - Pro Konto `resolveAccount(account, i)` gibt `{ summary, messages }` zurück und wirft **nie**. Jeder Fehler wird in den Status übersetzt:
    - **gmail/outlook:**
      - `missingCredentials(provider, env)` nicht leer → `unconfigured`, `error: "Fehlt in .env: …"`, ohne `action`
      - `NotConnectedError` → `unconfigured`, `error: "Nicht verbunden"`, `action: "/auth/google/start?account=<id>"` (bzw. `/auth/microsoft/…`)
      - `ReauthRequiredError` → `unconfigured`, `"Anmeldung abgelaufen – neu verbinden"`, `action`
      - andere Fehler → `error`, Meldung
      - `email` aus dem Token-Store
    - **imap:** `env[account.passwordEnv]` fehlt → `unconfigured`, `"Fehlt in .env: IMAP_PASSWORD"`
  - `Promise.all` über die Konten. Das reicht, weil `resolveAccount` nie wirft. Zusätzlich ein `try/catch`-Netz.
  - Sind alle Konten, die nicht `unconfigured` sind, `error` (und es gibt mindestens eins) → `throw new Error(accounts.map(a => \`${a.label}: ${a.error}\`).join(" · "))`
  - `signal.aborted` → werfen, kein Teilergebnis.
  - Ergebnis: `{ accounts, messages: mergeMessages(..., config.limit) }`
- **`collector.ts`:**
  ```ts
  const tokens = createTokenStore({ dir: join(config.dataDir, "tokens") });
  export const collector = defineCollector(manifest, {
    collect: ({ config: c, env, signal, log }) => collectMail({ config: c, env, signal, tokens, log }),
  });
  ```
  - `config` aus `../../server/env` importieren, als `serverConfig` umbenennen, um die Namenskollision zu vermeiden.
- **GOTCHA:**
  - **Derselbe Token-Store-Typ** wird in den Auth-Routen benutzt. Für den Lock teilen sich beide **eine** Instanz pro Verzeichnis: in `token-store.ts` ein Modul-Singleton `tokenStoreFor(dir)` (Map dir → Store), das `collector.ts` und `index.ts` nutzen.
  - Die Test-Instanzen erzeugen weiter frei mit `createTokenStore`.
- **VALIDATE:** `npm run typecheck`

### 14. CREATE `widgets/mail/collector.test.ts`

- **IMPLEMENT** (echte lokale Server, keine Modul-Mocks):
  - **HTTP-Server** mit einer Routen-Tabelle für Gmail (`/gmail/labels/INBOX`, `/gmail/messages`, `/gmail/messages/<id>`), Graph (`/graph/mailFolders/inbox`, `/graph/mailFolders/inbox/messages`) und Token (`/token`) aus den Fixtures. Er prüft den `Authorization`-Header und antwortet sonst mit 401.
  - **IMAP-Server** (`node:net`, Port 0), generisch und befehlsbasiert:
    - Greeting: `* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] ready`
    - Jede Zeile in `tag command args` zerlegen. Befehle mitschneiden, um sie später zu prüfen.
    - `CAPABILITY` → `* CAPABILITY IMAP4rev1 AUTH=PLAIN` + `tag OK`
    - `LOGIN`/`AUTHENTICATE`:
      - Erfolg → `tag OK`
      - falsches Passwort → `tag NO [AUTHENTICATIONFAILED]`
      - `AUTHENTICATE PLAIN` mit Continuation `+ ` bedienen, oder kein `AUTH=PLAIN` anbieten, sodass imapflow `LOGIN` nutzt. **Einfacher: `AUTH=PLAIN` nicht in den Capabilities.**
    - `STATUS` → `* STATUS INBOX (UNSEEN 1 MESSAGES 3)` + `tag OK`
    - `EXAMINE` → `* 3 EXISTS`, `* 0 RECENT`, `* FLAGS (\Seen)`, `tag OK [READ-ONLY] EXAMINE completed`
    - `SELECT` → `tag NO select not allowed in test`. So fällt jeder Schreibzugriff auf.
    - `FETCH`/`UID FETCH` → die Zeilen aus `fixtures/imap-fetch.txt` + `tag OK`
    - `LOGOUT` → `* BYE` + `tag OK` + Ende
    - alles andere (`ID`, `NAMESPACE`, `ENABLE`, `NOOP`) → `tag OK`
- **Tests:**
  1. **Zwei Gmail-Konten + Outlook + IMAP, alle ok:**
     - Zähler wie in den Fixtures
     - gemischte, sortierte Liste
     - Gmail-Link mit `/u/<email>/`
     - Outlook-`webLink` erhalten
  2. **Ohne Token-Datei:** Gmail-Konto `unconfigured` mit `action` `/auth/google/start?account=gmail-privat`. Die anderen bleiben `ok`.
  3. **Ohne `GOOGLE_CLIENT_ID`:** `unconfigured` ohne `action`.
  4. **Abgelaufener Access-Token:** genau ein Refresh, danach ok. Der rotierte Microsoft-Refresh-Token steht in der Datei.
  5. **Token-Endpunkt antwortet `invalid_grant`:** `unconfigured` „Anmeldung abgelaufen“.
  6. **Graph antwortet 500:** Outlook `error`, der Rest ok, die Instanz wirft nicht.
  7. **Alle Konten `error`:** `collectMail` wirft eine Meldung mit allen Labels.
  8. **IMAP:**
     - Befehlsliste enthält `EXAMINE` und **kein** `SELECT`/`STORE`.
     - `FETCH` ohne `BODY[` (nur `BODY.PEEK` oder gar nicht)
     - falsches Passwort → `error` „IMAP-Anmeldung fehlgeschlagen“
     - leere Inbox (`* 0 EXISTS`) → kein FETCH
  9. **`signal` abgebrochen** während der IMAP-Server hängt (antwortet nicht auf `STATUS`) → Promise settled in < 1 s, keine `unhandledRejection` (Muster aus `server/scheduler.test.ts`).
  10. **Fixture-Erzeugung:** `if (process.env.UPDATE_FIXTURES) writeFileSync(fixtures/mail.json, …)` aus Test 1 (Muster aus den anderen Widgets, z. B. `widgets/relaunch-radar/collector.test.ts`).
- **GOTCHA:**
  - Kommt imapflow mit dem generischen Server nicht klar (z. B. erwartet es eine bestimmte Antwort), den Ablauf einmal mit `logger: console` gegen den echten Server ansehen (Task 21) und den Server gezielt ergänzen. **Höchstens 30 Minuten.** Danach den IMAP-Integrationstest auf die Fälle EXAMINE/kein SELECT/Login-Fehler reduzieren und das im Report notieren.
  - Echte Timer und `expect.poll` verwenden, keine Fake-Timer bei Sockets.
- **VALIDATE:** `npx vitest run widgets/mail`

### 15. CREATE `server/routes/auth.ts`

- **IMPLEMENT:**
  ```ts
  export interface AuthDeps {
    port: number;
    env: Record<string, string | undefined>;
    accounts: Array<{ id: string; provider: OAuthProviderId }>; // aus der Mail-Config
    tokens: TokenStore;
    pending: PendingStore;
    onConnected: (account: string) => void;  // → refresh der mail-Instanzen
    endpoints?: Partial<Record<OAuthProviderId, OAuthEndpoints>>;
    fetchImpl?: typeof fetch;
  }
  ```
  - **`GET /:provider/start?account=<id>`:**
    - `provider` ∈ `google|microsoft`, sonst 404.
    - Konto mit diesem Provider muss in `accounts` stehen, sonst 404 `"Konto nicht konfiguriert"`.
    - `missingCredentials` → 409 mit deutscher Meldung.
    - Sonst `verifier`/`state` erzeugen, `pending.put`, `c.redirect(authorizeUrl(...), 302)`.
  - **`GET /:provider/callback`:**
    - Query `error` → `c.text("Anmeldung abgebrochen: <error>", 400)`. Nur den `error`-Code ausgeben, gekürzt auf 100 Zeichen. Es ist Text, kein HTML.
    - `state` per `pending.take`. Fehlt der Eintrag oder passt der Provider nicht → `c.text("Ungültiger oder abgelaufener Anmeldeversuch – bitte erneut starten", 400)`.
    - `code` fehlt → 400.
    - `exchangeCode`. Fehlt der `refreshToken` → 400 `"Kein Refresh-Token erhalten – Zugriff in den Google-Kontoeinstellungen entfernen und erneut verbinden"`.
    - Bei Google `users/me/profile` holen und die `email` speichern (Fehler → `email: null`, nur loggen). Microsoft: `email: null`, der Link braucht sie nicht.
    - `tokens.save(...)`, `onConnected(account)`.
    - Antwort `c.text("Verbunden: <account>. Dieses Fenster kann geschlossen werden.", 200)`.
    - Fehler aus `exchangeCode` → `c.text("Anmeldung fehlgeschlagen: <message>", 502)`. Die Meldung enthält keine Secrets (Task 5).
  - Header für alle Antworten: `cache-control: no-store`, `referrer-policy: no-referrer`. Code und State stehen in der URL, deshalb darf kein Referer sie weitertragen.
- **GOTCHA:**
  - `c.text` statt `c.html`, damit nichts aus der Query als HTML gerendert wird (security.md Regel 5).
  - Die Gmail-Profil-Base muss für Tests injizierbar sein (`gmailBase` in `AuthDeps`).
- **VALIDATE:** Test in Task 17.

### 16. UPDATE `server/app.ts`, `server/static.ts`, `server/index.ts`, `vite.config.ts`

- **`app.ts`:**
  - `AppDeps` um `auth?: AuthDeps` erweitern, optional, damit bestehende Tests unverändert laufen.
  - `if (deps.auth) app.route("/auth", authRoutes(deps.auth));` **vor** `dashboardRoutes`.
- **`static.ts`:**
  - `RESERVED = /^\/(api|auth)(\/|$)/`
  - Kommentar anpassen: `// API and OAuth routes keep their own 404.`
- **`index.ts`:**
  - `const mailAccounts = oauthAccounts(instances)` (Helfer in `server/auth/accounts.ts`):
    - nimmt aus allen `instances` mit `type === "mail"` und `parsedConfig` das Feld `accounts`
    - mappt `gmail → google`, `outlook → microsoft`, IMAP fällt weg
    - doppelte IDs über Instanzen hinweg → `throw new Error("Mail-Konto-ID \"x\" ist doppelt …")`
    - Das bleibt typ-agnostisch per `z.object({ accounts: z.array(z.object({ id: z.string(), provider: z.string() })) }).safeParse(parsedConfig)`. So importiert der Kern kein Widget-Manifest.
  - `auth: { port: config.port, env: process.env, accounts: mailAccounts, tokens: tokenStoreFor(join(config.dataDir, "tokens")), pending: createPendingStore(), onConnected: () => { for (const s of cache.all()) if (s.type === "mail") void scheduler.refresh(s.instance).catch(err => logError("auth", …)); } }`
- **`vite.config.ts`:** `proxy: { "/api": {...}, "/auth": { target: api, changeOrigin: false } }`
- **VALIDATE:** `npm run typecheck && npx vitest run server`

### 17. CREATE `server/routes/auth.test.ts` und `server/auth/accounts` testen

- **IMPLEMENT** mit `createApp(deps)` + `app.request(...)` (Muster aus `server/app.test.ts`), `allowedHosts` inklusive `"localhost"`, einem lokalen HTTP-Token-Server und Gmail-Profil.
- **Tests:**
  - `start` ohne bzw. mit unbekanntem `account` → 404.
  - `start` mit IMAP-Konto-ID oder falschem Provider → 404.
  - `start` ohne `GOOGLE_CLIENT_ID` → 409.
  - `start` ok → 302:
    - `Location` beginnt mit dem Authorize-Endpunkt.
    - `state` steht im Pending-Store.
    - `redirect_uri` = `http://127.0.0.1:4700/auth/google/callback`
  - **callback-Pfad:**
    - Vollständiger Durchlauf (start → `state` aus `Location` lesen → callback mit `code`) → 200 Text, Token-Datei geschrieben (inklusive `email`), `onConnected` aufgerufen.
    - Derselbe `state` ein zweites Mal → 400.
    - `state` von Google an `/auth/microsoft/callback` → 400.
    - `?error=access_denied` → 400 Text.
    - `?error=<script>…` → `content-type` ist `text/plain`.
    - Fremder Host (`Host: evil.example`) → 403 vom Guard.
  - `/auth/unknown` liefert JSON-404, nicht `index.html` (SPA-Fallback greift nicht).
  - `oauthAccounts`: doppelte ID → wirft; IMAP-Konten fehlen in der Liste.
- **VALIDATE:** `npx vitest run server/routes server/auth`

### 18. CREATE `widgets/mail/Widget.tsx` + `Widget.test.tsx`

- **IMPLEMENT** (Muster aus `widgets/relaunch-radar/Widget.tsx`, deutsche Texte):
  - **Kopfzeile:** Konto-Chips (`flex flex-wrap gap-1.5`), je Chip ein Farbpunkt (`style={{ backgroundColor: a.color }}`, Farbe validiert per Regex), `label` und die Zählung:
    - `ok`: Zahl, fett, wenn > 0
    - `unconfigured`: Button „verbinden“, wenn `action` gesetzt ist. Klick → `openUrl(new URL(a.action, window.location.origin).href)`. Ohne `action` nur „nicht eingerichtet“ mit `title={a.error}`.
    - `error`: `text-bad`, „Fehler“, `title={a.error}`
  - **Liste:** je Mail eine Zeile `button` (nur wenn `url` gesetzt ist):
    - Farbbalken links (Kontofarbe)
    - `from` (fett bei `unread`), `subject` (`truncate`), `relativeTime(receivedAt, now)` rechts
    - `title` = vollständiger Betreff
  - Leere Liste → „Keine Mails in der Inbox“.
  - Nur Text rendern (`{m.subject}`), kein `dangerouslySetInnerHTML`.
- **Tests** (`// @vitest-environment jsdom`, `vi.mock("../../web/src/lib/openUrl")` wie in `web/src/views/GenericView.test.tsx`):
  - Chips zeigen die Zähler.
  - Der Button „verbinden“ ruft `openUrl` mit `http://localhost:3000/auth/google/start?account=gmail-privat` auf (jsdom-Origin).
  - Ein Klick auf eine Mail öffnet ihre `url`.
  - Ein Betreff mit `<b>` erscheint als Text.
- **VALIDATE:** `npx vitest run widgets/mail/Widget.test.tsx`

### 19. UPDATE Konfiguration und Doku

- **`.env.example`:** den Block „Mail (Phase 4)“ hinzufügen, mit Kommentaren, woher die Werte kommen:
  ```
  # Google Cloud Console → APIs & Dienste → Anmeldedaten → OAuth-Client-ID, Typ „Desktop-App“.
  # Secret wird nur einmal angezeigt. Consent-Screen auf „In Produktion“ (sonst laufen Tokens nach 7 Tagen ab).
  GOOGLE_CLIENT_ID=
  GOOGLE_CLIENT_SECRET=
  # Azure-Portal → App-Registrierungen → „Nur persönliche Microsoft-Konten“,
  # Plattform „Mobile und Desktop“, Redirect-URI http://localhost/auth/microsoft/callback. Kein Secret.
  MS_CLIENT_ID=
  MS_TENANT=consumers
  # App-Passwort des IMAP-Kontos (nicht das Login-Passwort). Host/User stehen in dashboard.config.json.
  IMAP_PASSWORD=
  ```
- **`dashboard.config.example.json`:** Instanz `mail` (`x: 9, y: 3`) einfügen. `external-beispiel` dafür auf `x: 9, y: 6` legen, damit sich nichts überlappt.
  - Konten: `gmail-privat`, `gmail-agentur` (gmail), `outlook` (outlook), `imap` (imap mit `host: "imap.example.com"`, `user: "jose@example.com"`, `webmailUrl: "https://webmail.example.com"`)
- **Lokale `dashboard.config.json`:** dieselbe Instanz mit den echten Konten. Den Nutzer nach IMAP-Host, User und Webmail-URL fragen und die Werte nicht raten.
- **`widgets/mail/README.md`** (deutsch):
  - was das Widget zeigt
  - Zähler-Semantik (Gmail: Konversationen)
  - Datenschutz: keine Mail-Texte; Tokens in `data/tokens/`
  - **Einrichtung Schritt für Schritt:**
    1. **Google:** Projekt anlegen, Gmail API aktivieren, Consent-Screen „Extern“ mit Scope `gmail.readonly` und auf „In Produktion“ setzen (die Warnseite „nicht verifiziert“ bestätigen), OAuth-Client „Desktop-App“ anlegen, ID und Secret nach `.env`.
    2. **Azure:** kostenloses Azure-Konto anlegen, falls noch kein Verzeichnis existiert (App-Registrierungen ohne Verzeichnis gibt es nicht mehr). App registrieren mit „Nur persönliche Microsoft-Konten“, Plattform „Mobile und Desktop“, Redirect-URI `http://localhost/auth/microsoft/callback`, API-Berechtigung `Mail.Read` (delegiert). Client-ID nach `.env`.
    3. **IMAP:** App-Passwort beim Anbieter erzeugen, `IMAP_PASSWORD` setzen, Host und User in die Config.
    4. **Verbinden:** Server starten, in der Kachel auf „verbinden“ klicken (öffnet den Browser), anmelden. Bei mehreren Gmail-Konten das jeweils richtige Konto wählen.
  - **Fehlerbilder:**
    - „Anmeldung abgelaufen“ (Passwort geändert, 6 Monate ungenutzt, Testing-Modus)
    - „Kein Refresh-Token“ (Zugriff unter myaccount.google.com/permissions entfernen und neu verbinden)
- **`README.md`:** in „Widgets“ eine Zeile zu Mail mit Link auf `widgets/mail/README.md`.
- **`PRD.md`:**
  - Abschnitt 9: IMAP-Host/User in die Config, `IMAP_PASSWORD` bleibt in `.env`; der Bibliotheksteil nennt `fetch` + PKCE statt `googleapis`/`msal-node`.
  - Abschnitt 10: `/auth/<provider>/start?account=<id>`; der Callback antwortet mit einer Textseite statt eines Redirects auf `/` (er läuft im Standardbrowser, nicht in Lively).
  - Abschnitt 12, Phase 4: „✔ umgesetzt“.
  - Bei der Gelegenheit bei Phase 2 „✔ erledigt“ nachtragen.
- **`.agents/reference/security.md`:** Regel 7 „OAuth“ hinzufügen:
  - Pflicht sind `state` (single use, TTL) und PKCE S256.
  - Callback-Antworten nur als `text/plain` mit `no-store` und `no-referrer`.
  - Tokens nur in `data/tokens`, nie loggen und nie über `/api` ausliefern.
  - Nur Lese-Scopes.
  - IMAP nur per `EXAMINE`.
- **`.agents/reference/widgets.md`:** in den Collector-Regeln ergänzen:
  - Status pro Teilquelle in der Payload, wenn eine Instanz mehrere Konten hat (Mail-Muster).
  - `manifest.env` nur für Variablen, ohne die **gar nichts** geht.
- **VALIDATE:** `npm run typecheck && npx vitest run widgets/contract.test.ts`

### 20. PAUSE – Einrichtung durch den Nutzer

- Den Nutzer bitten, die Einrichtung aus `widgets/mail/README.md` durchzuführen (Google, Azure, IMAP-App-Passwort, `.env`) und Bescheid zu geben.
- Bis dahin weiter mit `npm run check`; alle Tests laufen ohne echte Konten.

### 21. Fixtures echt aufnehmen und anonymisieren

- **IMPLEMENT** nach Verbindung aller Konten (`npm start`, „verbinden“ in der Kachel):
  - Gmail und Graph mit dem Access-Token aus `data/tokens/<id>.json` per `curl -s -H "Authorization: Bearer …"` abrufen. Die Endpunkte sind dieselben wie in Task 10 und 11. Die Antworten in die Fixture-Dateien schreiben.
  - IMAP: einmal `logger: console` lokal in einem Wegwerf-Skript im Scratchpad (nicht im Repo) aktivieren und die untagged `* n FETCH (…)`-Zeilen nach `fixtures/imap-fetch.txt` kopieren.
  - Token-Antworten (Task 7) nur strukturell übernehmen, Werte durch `REDACTED` ersetzen.
- **Anonymisieren** (`.agents/reference/widgets.md` → Tests):
  - Absender: Namen → `Absender 1…n`, Adressen → `absender1@example.com`
  - Betreffs → `Betreff 1…n`
  - eigene Adressen → `jose@example.com`
  - IDs → Platzhalter gleicher Form (`18f0000000000001`)
  - `webLink`-`ItemID` → `AAAA…`
  - LAN-IPs → `192.0.2.x`
  - **mindestens eine ungelesene und eine gelesene Mail je Quelle** stehen lassen (Pitfall „Fixture trimming“)
- **Danach:** `UPDATE_FIXTURES=1 npx vitest run widgets/mail`
- **VALIDATE:**
  - `grep -rnE "benja|jbmj|vazquez|192\.168\.|ya29\.[A-Za-z0-9_-]{10}|M\.C[0-9]_[A-Za-z0-9]{10}" widgets/mail/fixtures server/auth` findet nichts.
  - `npx vitest run widgets/mail server/auth`

### 22. Manuelle Validierung (echt)

- `npm run build && npm start`, dann `http://127.0.0.1:4700` mit den Chrome-Tools öffnen (`/e2e-test` läuft auf nativem Windows nicht).
- **Prüfen:**
  - Jedes Konto zeigt den Status `ok`.
  - Die Zähler stimmen mit dem jeweiligen Webmail überein (Gmail: Konversationen in der Inbox).
  - Ein Klick auf eine Mail jedes Kontotyps öffnet die richtige Mail bzw. das Webmail im Standardbrowser. **Gmail-Deep-Link und Outlook-`webLink` hier ausdrücklich bestätigen**, beide sind nicht offiziell dokumentiert.
  - Eine Mail im Webmail auf ungelesen setzen, „aktualisieren“ in der Kachel → der Zähler steigt. Danach im Webmail prüfen: Die Mail ist **noch ungelesen**, das Dashboard hat nichts markiert. Das gilt besonders für IMAP.
  - Eine Token-Datei umbenennen → nach dem Refresh steht das Konto auf „verbinden“, die anderen bleiben ok.
  - `GOOGLE_CLIENT_ID` leeren → Neustart → beide Gmail-Konten „nicht eingerichtet“, Outlook und IMAP bleiben ok.
- **VALIDATE:** `curl -s http://127.0.0.1:4700/api/widgets/mail | head -c 600`

---

## TESTING STRATEGY

### Unit Tests
- `server/auth/auth.test.ts`: PKCE, pending, authorizeUrl, Token-Austausch und Refresh (gegen den lokalen HTTP-Server), Lock, Rotation, Fehlerklassen
- `widgets/mail/parse.test.ts`: Mapper gegen echte Fixtures, Link-Allowlist, Header-Parsing, Sortierung, TZ
- `widgets/mail/Widget.test.tsx`: Darstellung und Klicks

### Integration Tests
- `widgets/mail/collector.test.ts`: `collectMail` gegen den lokalen HTTP-Server (Gmail, Graph, Token) und den lokalen IMAP-Server. Status pro Konto, Teilausfälle, Abbruch.
- `server/routes/auth.test.ts`: OAuth-Durchlauf durch `createApp` inklusive Guard und SPA-Fallback.
- `widgets/contract.test.ts`: `fixtures/mail.json` gegen `MailData`. Läuft automatisch.

### Edge Cases
- leere Inbox: Gmail ohne `messages`-Feld, IMAP `0 EXISTS`, Graph `value: []`
- Betreff fehlt bzw. `null`, Absender fehlt
- Header mit Anführungszeichen und Umlauten
- Microsoft rotiert den Refresh-Token; Google liefert keinen neuen
- parallele Refreshes desselben Kontos
- `invalid_grant` gegenüber 5xx beim Token-Endpunkt
- 401 von Gmail/Graph trotz frischem Token → einmal force-refresh, dann Reauth
- `state` doppelt, abgelaufen oder vom falschen Provider; `error`-Parameter im Callback
- Konto-ID mit `..` (Traversal) bzw. doppelt über Instanzen
- `webLink` mit fremdem Host oder `javascript:`
- Abbruch während eines hängenden IMAP-Servers
- DST: `receivedAt` aus `internalDate` (ms epoch) ist zeitzonenunabhängig, mit `TZ=UTC` prüfen

---

## VALIDATION COMMANDS

Alle Befehle über **Bash**, nicht PowerShell.

### Level 1: Syntax & Style
```bash
npm run typecheck
npm run lint
```

### Level 2: Unit Tests
```bash
npx vitest run server/auth widgets/mail/parse.test.ts widgets/mail/Widget.test.tsx
TZ=UTC npx vitest run widgets/mail
```

### Level 3: Integration Tests
```bash
npx vitest run widgets/mail server/routes server
npm run check
```

### Level 4: Manual Validation
Task 22: echte Konten, Abgleich mit dem Webmail, Links, read-only-Prüfung, Fehlerzustände.

### Level 5: Additional Validation
Die UI mit den Chrome-Tools gegen `http://127.0.0.1:4700` prüfen (Kachel, Chips, Klick, Verbinden-Flow). Den `/e2e-test`-Skill **nicht** verwenden, er läuft auf nativem Windows nicht.

---

## ACCEPTANCE CRITERIA

- [ ] Das Widget `mail` zeigt Ungelesen-Zähler pro Konto für mehrere Gmail-Konten, Outlook.de und IMAP, dazu die letzten 15 Mails gemischt mit Absender, Betreff, Zeit und Kontofarbe.
- [ ] Die Zähler stimmen mit den Webmails überein (Gmail: Konversationen).
- [ ] Ein Klick öffnet die Mail bzw. das Webmail im Standardbrowser über `/api/open`.
- [ ] Ein nicht verbundenes Konto zeigt „verbinden“. Der OAuth-Flow über `/auth/<provider>/start?account=<id>` speichert das Token, und das Konto erscheint ohne Neustart.
- [ ] Fehlen Credentials in `.env`, ist das betroffene Konto `unconfigured`. Die anderen Konten und Widgets laufen weiter.
- [ ] Nur lesend:
  - Scopes `gmail.readonly` und `offline_access Mail.Read`
  - IMAP nur per `EXAMINE`, ohne `STORE`/`SELECT`/`BODY[]`; das ist per Test belegt.
  - Mails bleiben nach dem Abruf ungelesen; das ist manuell geprüft.
- [ ] Sicherheit:
  - `state` single use mit TTL, PKCE S256
  - Callback antwortet nur mit `text/plain` und `no-store`
  - Tokens nur unter `data/tokens/` und nie in Logs oder `/api`
  - Host-Guard gilt auch für `/auth`
  - `/auth/*` fällt nicht in den SPA-Fallback
- [ ] Microsofts Refresh-Token-Rotation wird persistiert, parallele Refreshes sind serialisiert.
- [ ] Fixtures sind echt und anonymisiert; der grep-Check findet nichts.
- [ ] `npm run check` ist grün.
- [ ] Doku ist nachgezogen: README, Widget-README, `.env.example`, `dashboard.config.example.json`, PRD und die Referenzdokumente.

---

## COMPLETION CHECKLIST

- [ ] Alle Tasks sind der Reihe nach erledigt, nach jedem Task lief seine Validierung.
- [ ] `npm run check` ist grün, zusätzlich `TZ=UTC npx vitest run widgets/mail`.
- [ ] Die manuelle Validierung (Task 22) ist durchgeführt, Abweichungen stehen im Report.
- [ ] Der grep-Check der Fixtures ist leer.
- [ ] Es ist kein Commit erfolgt; der kommt mit `/commit` nach `/validate` und `/code-review`.

---

## NOTES

- **Warum kein SDK:** Entscheidung des Nutzers am 2026-10-19.
  - `fetch` + PKCE sind ≈ 150 Zeilen eigener Code. Dafür lassen sich die Endpunkte injizieren und gegen echte lokale Server testen (Projektregel), und es kommen keine großen Abhängigkeiten dazu.
  - Wenn die Token-Logik später wächst (Kalender), kann man auf ein SDK wechseln, ohne die Collector-Schnittstelle zu ändern.
- **Google `client_secret`:** Bei Desktop-Clients ist das Secret laut Google nicht vertraulich. Es liegt trotzdem in `.env`, damit Secrets an einer einzigen Stelle stehen.
- **Unterschiedliche Redirect-Hosts** (127.0.0.1 für Google, localhost für Microsoft) sind Absicht.
  - Microsoft erlaubt `http://127.0.0.1` nur über die Bearbeitung des Manifests, `http://localhost` dagegen direkt im Portal, und ignoriert dabei den Port.
  - Der Guard erlaubt beide Hosts schon.
- **Unverifizierte Google-App:** Für eine Person mit weniger als 100 Nutzern ist das zulässig. Der Nutzer sieht beim Verbinden die Warnseite „Google hat diese App nicht überprüft“ (Erweitert → Weiter).
- **Phase 6 (Snapshot für die KI)** nutzt später nur `accounts[].unread`, `from` und `subject`. Mail-Texte gibt es in der Payload ohnehin nicht.
- **Offen bzw. erst manuell bestätigt:**
  - Format des Gmail-Deep-Links
  - `webLink` bei outlook.com
  - ob Google den Pfad `/auth/google/callback` für Desktop-Clients akzeptiert (laut Doku jeder Loopback-Pfad)
  - Fällt eins davon durch, die Links in `parse.ts` anpassen. Die Kernlogik bleibt.
- **Nicht in dieser Phase:** IMAP IDLE/Push (Polling alle 2 min reicht), Token-Verschlüsselung per DPAPI, Kalender.

# Fächerbagger

Current and upcoming road construction sites ("Baustellen") in the
TechnologieRegion Karlsruhe, as a map and a list. A static React app that is
easier to read than TRK's map-only portal.

The name combines Karlsruhe's nickname *Fächerstadt* (fan-shaped city) with
*Bagger* (excavator). The UI is German; code, comments and commits are English.

## The app

- **Für mich** is the start page. Before anything is set up it asks for one
  place; the setup then offers notifications. Afterwards it shows new
  notifications, then sites near the visitor's places or marked with a star,
  split into *Beginnt bald* (within 14 days), *Läuft gerade* and *Später
  geplant*.
- **Karte** shows all sites with search, filters, a map and a list.
- **Einstellungen** holds places, notification options, the app itself, sources
  and feeds.
- On phones the three sections sit in a bottom bar.
- Each site has a shareable page that answers "can I get through?" first.
- Works offline as a PWA, with optional Web Push notifications that are matched
  on the device.

## How it works

The browser never talks to the WFS directly (CORS is unverified and the payload
is large). Instead a scheduled GitHub Action runs the pipeline and commits static
JSON into the repo; the client only ever fetches those files.

```
TRK GeoServer WFS ──(GitHub Action, twice daily)──▶ scripts/fetch-construction-sites.ts
                                                          │
                                       fetch + reproject + dedupe + normalize
                                                          │
                                                          ▼
       public/data/baustellen.json · baustellen-geometrie.json
                     meta.json · changes.json · ereignisse.json
                                                          │
                                          (committed, shipped by Vite)
                                                          ▼
                              React app  ──fetch──▶  public/data/*.json
```

### Pipeline (`scripts/fetch-construction-sites.ts`)

For each of the two source layers (`baustellen_aktuell` = active,
`baustellen_vorschau` = upcoming) it:

1. **Fetches** GeoJSON from the WFS with:
   - `srsName=EPSG:4326` — the server reprojects from its native EPSG:25832 with
     correct GeoJSON `[lon, lat]` axis order, so **no `proj4` is needed**;
   - `CQL_FILTER=gemeinde IS NOT NULL` — excludes the Alsace/France records
     (`datenquelle = "Collectivité européenne d'Alsace"`, which have a null
     `gemeinde`) at the source;
   - `propertyName=…` — only the fields we use (`geom` must be listed explicitly
     or GeoServer drops the geometry).
2. **Deduplicates** by `vorgangsnummer`: every Vorgang appears as multiple
   features (points + polygons/lines). One record is produced per Vorgang, with a
   representative point (mean of member points, for lists and distance) and the
   full geometry merged for the map. Coordinates are published at six decimals
   (~0.11 m); the source's full double precision was a large share of the
   payload and means nothing for road works.
3. **Normalizes**: maps the free-form `art` to a fixed category set, `sperrung`
   to an ordinal closure severity, sanitizes the HTML/CRLF `zusatzinfo` to plain
   text, and converts timestamps to Europe/Berlin calendar dates.
4. **Diffs** against the previous run (`stand` timestamp + `vorgangsnummer`) to
   produce `changes.json`. Modifications that moved the *period* or the
   *closure* are recorded separately, so a notification can tell a corrected
   typo from a new full closure.
5. **Derives notification events** (`ereignisse.json`): newly announced sites,
   sites starting in 7 or 1 days, and relevant modifications. Each carries a
   stable signature so it is announced exactly once. See
   [notifications](#notifications) for why this is precomputed.
6. **Generates feeds** from one shared `feed` model in RSS 2.0 and Atom 1.0
   formats.

Outputs (committed to the repo, served by Vite from `public/`):

| File | Contents |
| --- | --- |
| `public/data/baustellen.json` | Normalized, deduplicated records (~290 kB) |
| `public/data/baustellen-geometrie.json` | Map geometry by record id; fetched only when a map opens |
| `public/data/meta.json` | Fetch timestamp, counts, source attribution |
| `public/data/changes.json` | Records added / modified / removed since last run |
| `public/data/ereignisse.json` | This run's notification events (a few kB) |
| `public/baustellen.xml` | RSS 2.0 feed of current records, newest revisions first |
| `public/baustellen.atom` | Atom 1.0 feed generated from the same feed model |

The shared domain model lives in [`src/types/`](src/types/) and is imported by
both the Node pipeline and the React app — one source of truth.

## Running locally

Requires Node ≥ 24 (see `.nvmrc`).

```bash
npm ci            # install the locked dependencies
npm run data      # fetch the WFS and (re)generate public/data/*.json
npm run feeds     # regenerate RSS and Atom from the existing local JSON
npm run dev       # start the dev server
npm test          # run all tests (app and Worker, Vitest)
npm run typecheck # strict TypeScript check (app + node projects)
npm run build     # production build into dist/
npm run preview   # serve the production build
```

`npm run data` requires network access to `mobil.trk.de`. The generated JSON is
committed to the repo, so `dev`/`build` work offline once it exists.

### Deployment configuration

Copy [`.env.example`](.env.example) to `.env.local` for local overrides. A
public build must identify its operator so the German-language Impressum,
privacy policy and accessibility statement can render real contact details:

| Build variable | Purpose |
| --- | --- |
| `VITE_PUSH_API_URL` | Optional Web Push Worker URL; notifications are unavailable when omitted |
| `VITE_OPERATOR_NAME` | Name of the person or organization responsible for the deployment |
| `VITE_OPERATOR_ADDRESS` | Postal address, with lines separated by `\n` in an env file |
| `VITE_OPERATOR_EMAIL` | Operator contact address |
| `VITE_OPERATOR_ACCESSIBILITY_CONTACT` | Optional accessibility contact; defaults to the operator email |

Without the required operator values the legal pages show a warning. Set them
where `npm run build` runs; Vite embeds them at build time.

## PWA, offline data and notifications

The production build is installable as a PWA. Its service worker precaches the
application shell and fonts, keeps the core Baustellen JSON files in a
network-first runtime cache, and refreshes them:

- through Periodic Background Sync where the browser permits it;
- through one-off Background Sync where available;
- whenever the installed app starts, returns online, or becomes visible.

Geometry is not part of that set: it is fetched lazily the first time a map is
shown and then served from the same runtime cache.

### Notifications

**No watched location ever reaches the server.** Areas, radii, followed sites
and notification choices live in IndexedDB on the device. D1 holds only what
Web Push delivery needs: endpoints, keys and timestamps.

A run therefore works like this:

1. The pipeline writes `ereignisse.json`, retaining three calendar days of
   events so quiet hours and temporary delivery failures do not discard them.
2. `scripts/send-push.ts` sends every eligible subscriber the same contentless
   wake-up push. It retries retained events within the existing daily guard;
   global event claims are no longer used for broadcast delivery.
3. The service worker wakes, fetches `ereignisse.json`, loads the device's own
   preferences from IndexedDB, and keeps the events inside the device's areas
   or about a followed site. It shows one aggregated notification, deep-linked
   to the site when there is only one, or to the local inbox for a batch.
   Event receipts on the device suppress duplicates. The inbox keeps up to 500
   delivered events for 30 days, with an explicit read action and unread count.

The default planning horizon is 14 days. Start reminders have distinct
signatures for 14 days and the optional day-before reminder. A successful run
catches reminder thresholds crossed since the previous fetch. Early
announcements beyond 14 days are opt-in; explicitly followed sites also qualify
for early notices. Changes consider both old and new closure severity so an
improvement is not accidentally filtered out. A postponement of an imminent
site remains notifiable even when the new date falls outside the horizon.
The personal overview always shows the long-term timeline, independently of
notification severity filters. Dates use the current Europe/Berlin calendar
with a separate warning when the dataset is stale.

The sender cannot tell who an event concerns. That is why the wake-up has no
content and the events file stays small enough to fetch on every push.

Delivery is gated to 09:00–21:00 Europe/Berlin. The pipeline runs at 04:00 and
16:00 UTC (05:00/17:00 in winter, 06:00/18:00 in summer), so the morning run
defers to the evening one. A 12-hour per-device guard backs that roughly daily
cadence against manual re-runs.

Because matching happens after the push, a device whose areas match nothing
shows no notification. Browsers expect `userVisibleOnly` subscriptions to
display something, so a failed events fetch falls back to a generic notice
rather than staying silent.

The optional Cloudflare Worker in [`push-worker/`](push-worker/) stores the
subscriptions, claims events, and can send a single on-demand delivery test —
its `web-push.ts` implements RFC 8291 message encryption and RFC 8292 VAPID on
WebCrypto, verified against the RFC's worked example in `test/web-push.test.ts`.

## GitHub Actions

- **`deploy.yml`** — builds and deploys to GitHub Pages on pushes to `main`, on
  manual dispatch, and after a successful data update (via `workflow_run`, since
  commits made with `GITHUB_TOKEN` do not trigger `push`). After data-triggered
  deployments it broadcasts the idempotent Web Push update.
- **`update-data.yml`** — fetches the TRK WFS at 04:00 and 16:00 UTC (06:00 and
  18:00 Europe/Berlin in summer), regenerates the committed data and feeds, and
  triggers deployment when its commit succeeds.
- **`deploy-push-worker.yml`** — manually deploys the subscription API and
  applies its D1 schema after the one-time Cloudflare setup.

The Vite `base` defaults to `/faecherbagger/` (a project Pages subpath) and can
be overridden at build time with the `BASE_PATH` env var. Enable Pages with the
"GitHub Actions" source in the repository settings.

## Tech choices

- **React 19 + TypeScript (strict)** + **Vite**. Function components and hooks.
- **KERN UX** via **`@kern-ux-annex/kern-react-kit`** (community React
  implementation, EUPL-1.2) plus `@kern-ux/native` for CSS and Fira Sans. Chosen
  over `@publicplan/kern-react-kit` for its layout primitives, release history
  and zero runtime dependencies. Both wrappers lag `@kern-ux/native`, so native
  KERN classes fill the gaps.
- **MapLibre GL JS directly, without a React map binding.** Filtered GeoJSON is
  rendered as clustered overview points and detailed line/polygon geometry on
  an OpenFreeMap/OpenStreetMap basemap. Data is loaded with plain `fetch`.

### Data model highlights

See
[`src/types/construction-site.ts`](src/types/construction-site.ts). Notable
normalizations:

- `id` = `vorgangsnummer` (a **string**, e.g. `"2026V2026"`).
- `phase` = `"active"` | `"upcoming"` (from the source layer, not recomputed
  from dates).
- `category` = fixed set mapped from `art`; unknown values log and fall back to
  `"other"`.
- `closure` = ordinal severity from `sperrung`
  (`none` < `obstruction` < `one-direction` < `full`, `unknown` for null).
- `endDate` is nullable (open-ended construction).
- `point` is kept in every construction-site record for lists and distance.
  Full map geometry is keyed separately by `id` in
  `baustellen-geometrie.json` and loaded only when a map is shown.

## Data source & licensing

Data: **TechnologieRegion Karlsruhe (TRK) – Mobilitätsportal**
(`https://mobil.trk.de/geoserver/TBA/ows`). Source municipalities are surfaced
from the `datenquelle` field and attributed in the UI (Stadt Karlsruhe, Bruchsal,
Ettlingen, Rastatt, Rheinstetten, Stutensee, Baden-Baden).

The WFS `GetCapabilities` reports `Fees: NONE` and `AccessConstraints: NONE`.
**Before publishing**, confirm the formal terms of use / licence for the TRK
mobility data and adjust attribution accordingly.

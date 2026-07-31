# Fächerbagger

Understandable view of current and upcoming road construction sites
("Baustellen") in the TechnologieRegion Karlsruhe. A static React app that makes
the data easier to grasp than the existing map-only view provided by TRK.

The name is a pun on Karlsruhe's nickname *Fächerstadt* (fan-shaped city) and
*Bagger* (excavator). UI language is German; code, comments and commits are
English.

> **Status:** The app includes the data pipeline, a personal "was fängt bei mir
> demnächst an" view with optional Web Push filtered by radius and closure level,
> filterable map and list views, distance sorting, and responsive
> construction-site details.

## What the app is for

The primary job is **lead time**: something is about to be dug up near the
visitor, and they hear about it early enough to plan around it. Everything else
supports that answer.

"Kurzfristig" is the app's central idea and has exactly one definition, in
[`construction-site-timing.ts`](src/shared/construction-site-timing.ts): a
construction site starts within `SHORT_NOTICE_LEAD_DAYS` days, or started within
that many days and is still running. The default list, the ranking and the push
message all derive from it, so the notification and the screen it opens cannot
disagree. "Heute" is the dataset's own `fetchedAt` day in the Europe/Berlin
calendar, never the browser clock.

- **Mein Umkreis** (default screen, [`ConstructionSiteSurroundings.tsx`](src/components/ConstructionSiteSurroundings.tsx)) —
  the answer, with no setup in front of it. It selects over the visitor's *home
  area* (a center plus a radius) and shows one list at a time, picked by a single
  segmented control — "Kurzfristig", "Läuft", "Geplant", "Alle", most urgent
  first — which also carries the counts. Ranking follows the question each list
  answers: short notice by urgency then distance, "Läuft" by distance, "Geplant"
  by start date. Records that arrived since the last visit are marked. With no
  stored area the screen falls back to Karlsruhe and says so in one quiet line;
  it is never gated behind configuration. It *states* the radius and links to
  "Benachrichtigungen" to change it — there is no second, view-only editor here,
  and no map: a distance-sorted list already answers "was ist bei mir neu?", and
  the map that used to sit above it pushed the answer off a phone screen.
  "Neu" means one thing everywhere in the app — the pipeline had not seen this
  construction site before — so the badge, the list and the push notification
  always agree; a source edit to a record someone already knows about does not
  resurface it.
- **Benachrichtigungen** ([`NotificationSettings.tsx`](src/components/NotificationSettings.tsx)) —
  the first tab, because switching notifications on is the one thing a visitor
  does that keeps working after they close the app. It carries the switch and
  what to do when the browser, the deployment or a denied permission gets in the
  way, and it owns both halves of what a notification is about: the home area
  ([`HomeAreaSetup.tsx`](src/components/HomeAreaSetup.tsx), *where* to look — the
  center comes from the device location or, as a fallback, a municipality in the
  data, and saving is explicit because it re-syncs the push subscription) and the
  closure level ([`NotificationClosureLevelSetup.tsx`](src/components/NotificationClosureLevelSetup.tsx),
  *what* is worth saying — one click, saved on change). The distance is what a
  notification is about, so the switch and the radius are one decision on one
  screen; the controls live in one place only.
- **Alle Baustellen** (secondary screen, [`ConstructionSiteExplorer.tsx`](src/components/ConstructionSiteExplorer.tsx)) —
  the full region: search, filters, sorting, map and list. The power-user
  surface, one step away.

The active screen is part of the shareable URL state
(`?bereich=benachrichtigungen|umkreis|alle`, default `umkreis`), so a link opens
where its author intended. The home area and the "seen" acknowledgement are
personal state and stay in `localStorage` — they are never put in the URL.

The three sections are a tab row from 48rem up and a fixed bottom bar below it,
where they stay in thumb reach; notifications come first, the Umkreis tab
carries the count of unacknowledged changes, and the notification tab a dot for
the current state — that dot is the only place outside the notification section
that states it.

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
        public/data/baustellen.json · geometrien.json · meta.json · changes.json
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
   full geometry merged for the map.
3. **Normalizes**: maps the free-form `art` to a fixed category set, `sperrung`
   to an ordinal closure severity, sanitizes the HTML/CRLF `zusatzinfo` to plain
   text, and converts timestamps to Europe/Berlin calendar dates.
4. **Stamps `firstSeenAt`** by carrying the value forward from the previous
   `baustellen.json`; ids that were not there before get this run's timestamp.
   The source publishes no creation date, so this is the only thing that
   distinguishes a new construction site from an edited one.
5. **Derives the recent window** from each record's `firstSeenAt` to produce
   `changes.json`. This is a window over additions, not a diff of the whole
   dataset and not a window over `stand`: edits stay out of it.
6. **Splits the geometry off** into `geometrien.json`, keyed by record id. It is
   roughly seven eighths of the bytes and has exactly one reader — the map,
   which is loaded on demand and absent from the default screen altogether. The
   list every visitor downloads is ~36 kB gzipped instead of ~232 kB.
7. **Generates feeds** from one shared `feed` model in RSS 2.0 and Atom 1.0
   formats.

Outputs (committed to the repo, served by Vite from `public/`):

| File | Contents |
| --- | --- |
| `public/data/baustellen.json` | Normalized, deduplicated records, without geometry |
| `public/data/geometrien.json` | Map geometry of those records, by id; fetched only when a map opens |
| `public/data/meta.json` | Fetch timestamp, counts, source attribution |
| `public/data/changes.json` | Records first seen in the last 7 days, newest first, with both timestamps |
| `public/baustellen.xml` | RSS 2.0 feed of current records, newest revisions first |
| `public/baustellen.atom` | Atom 1.0 feed generated from the same feed model |

The shared domain model lives in [`src/types/`](src/types/) and is imported by
both the Node pipeline and the React app — one source of truth.

### Code layout

`src/` is split by lifecycle, so what runs where is visible from the import
path and a browser bundle can never pull in build-time code:

| Directory | Runs in | Contents |
| --- | --- | --- |
| [`src/shared/`](src/shared/) | app, pipeline, worker | Recency, timing and the short-notice window, notification relevance, home-area geometry and validation, distance, labels. Depends only on `src/types/`. |
| [`src/lib/`](src/lib/) | browser | Selection, filtering, sorting, URL state, storage, map layers, data loading. |
| [`src/pipeline/`](src/pipeline/) | Node, build time | WFS client, normalization, `firstSeenAt`, feeds, the additions artifact. |
| [`src/context/`](src/context/) | browser | `DatasetProvider`, `PersonalProvider`, `ViewProvider` — the three things a screen reads instead of taking props. |

The single selector [`selectConstructionSites`](src/lib/select-construction-sites.ts)
turns the dataset plus a `ConstructionSiteScope`
([construction-site-scope.ts](src/lib/construction-site-scope.ts)) into
everything a screen renders, annotating each record once
with distance, recency, timing, short notice and unseen, and handing back the
day it measured against. Both screens go through it, so the tab badge,
the surroundings list and the explorer's counts cannot disagree.

## Running locally

Requires Node ≥ 24 (see `.nvmrc`).

```bash
npm install       # install dependencies
npm run data      # fetch the WFS and (re)generate public/data/*.json
npm run feeds     # regenerate RSS and Atom from the existing local JSON
npm run dev       # start the dev server
npm test          # run the normalizer tests (Vitest)
npm run typecheck # strict TypeScript check (app + node projects)
npm run build     # production build into dist/
npm run preview   # serve the production build
```

`npm run data` requires network access to `mobil.trk.de`. The generated JSON is
committed to the repo, so `dev`/`build` work offline once it exists.

## PWA, offline data and notifications

The production build is installable as a PWA. Its service worker precaches the
application shell and fonts, keeps the Baustellen JSON files in a network-first
runtime cache, and refreshes the record list and its metadata:

- through Periodic Background Sync where the browser permits it;
- through one-off Background Sync where available;
- whenever the installed app starts, returns online, or becomes visible.

`geometrien.json` is deliberately left out of that background refresh: it is the
largest file, only a map reads it, and the same network-first route already
picks it up when one is opened.

### What is worth a notification

A record being new to the pipeline is not on its own a reason to interrupt
someone. The fan-out sends a construction site only when both hold:

- it is **kurzfristig** — `isShortNoticeConstructionSite`, the same definition
  the surroundings screen opens on. `firstSeenAt` says when *we* learned about a
  record, not when the work happens, and the source does backfill records whose
  work began months ago;
- its closure reaches the subscription's own **level**
  ([`notification-relevance.ts`](src/shared/notification-relevance.ts)): `all`,
  `obstruction` (the default — everything a visitor notices on the way) or
  `full`. The level is stored per subscription in D1, so a device keeps being
  filtered the way its owner asked even if the app is never opened again. An
  unstated `sperrung` is reported at every level except `full`: not knowing is
  not the same as knowing it is harmless.

Notifications are opted into in the "Benachrichtigungen" section, which also
owns the home area and the closure level they apply to; both travel to the
worker as one `NotificationPreferences` object. Every
surface that mentions notifications renders the single description from
[`describeNotificationState`](src/lib/notification-state.ts), so a switch is
never offered where it cannot succeed. A successful opt-in sends a local test
notification. The
optional Cloudflare Worker in
[`push-worker/`](push-worker/) stores Web Push subscriptions in D1; after Pages
deployment, GitHub Actions sends VAPID-authenticated pushes and removes expired
subscriptions. This wakes the service worker and refreshes cached data on iOS,
where periodic background sync is unavailable. On iPhone/iPad, the site must
first be added to the Home Screen before notification permission is available.

## Deployment

Three GitHub Actions (`.github/workflows/`):

- **`update-data.yml`** — cron (06:00 & 18:00 UTC, i.e. 08:00 & 20:00 Berlin in
  summer) + manual dispatch. Runs the pipeline and commits any changed data.
- **`deploy.yml`** — builds and deploys to GitHub Pages on pushes to `main`, on
  manual dispatch, and after a successful data update (via `workflow_run`, since
  commits made with `GITHUB_TOKEN` do not trigger `push`). After data-triggered
  deployments it broadcasts the idempotent Web Push update: of the construction
  sites whose `firstSeenAt` is newer than the last *completed* broadcast — which
  the push worker reports via `GET /broadcasts/last` — only the ones that are
  also kurzfristig, and then per device only those reaching that subscription's
  closure level. Editing an existing record never notifies anyone, a backfilled
  record whose work is months old notifies nobody either, and a fan-out that dies
  is caught up by the next run rather than skipped.
- **`deploy-push-worker.yml`** — manually deploys the subscription API and
  applies its D1 schema after the one-time Cloudflare setup.

The Vite `base` defaults to `/faecherbagger/` (a project Pages subpath) and can
be overridden at build time with the `BASE_PATH` env var. Enable Pages with the
"GitHub Actions" source in the repository settings.

## Tech choices

- **React 19 + TypeScript (strict)** + **Vite**. Function components and hooks.
- **KERN UX** via **`@kern-ux-annex/kern-react-kit`** (community React
  implementation, EUPL-1.2) plus `@kern-ux/native` for CSS and Fira Sans. This
  was preferred over the alternative `@publicplan/kern-react-kit` for its
  built-in Tabs (a fit for the planned map/table switch), layout primitives,
  dark-mode toggle, longer release history and zero runtime dependencies. Both
  React wrappers lag `@kern-ux/native` by a few months, so we fall back to native
  KERN CSS classes where a component or token is missing.
- **MapLibre GL JS directly, without a React map binding.** Filtered GeoJSON is
  rendered as clustered overview points and detailed line/polygon geometry on
  an OpenFreeMap/OpenStreetMap basemap. Data is loaded with plain `fetch`.

### Data model highlights

See
[`src/types/construction-site.ts`](src/types/construction-site.ts). Notable
normalizations:

- `id` = `vorgangsnummer` (a **string**, e.g. `"2026V2026"`).
- `phase` = `"active"` | `"upcoming"` (from the source layer, robust to date).
- `category` = fixed set mapped from `art`; unknown values log and fall back to
  `"other"`.
- `closure` = ordinal severity from `sperrung`
  (`none` < `obstruction` < `one-direction` < `full`, `unknown` for null).
- `endDate` is nullable (open-ended construction).
- `point` (representative) rides on the record; the full geometry is published
  separately in `geometrien.json` and joined by id when a map needs it.

## Data source & licensing

Data: **TechnologieRegion Karlsruhe (TRK) – Mobilitätsportal**
(`https://mobil.trk.de/geoserver/TBA/ows`). Source municipalities are surfaced
from the `datenquelle` field and attributed in the UI (Stadt Karlsruhe, Bruchsal,
Ettlingen, Rastatt, Rheinstetten, Stutensee, Baden-Baden).

The WFS `GetCapabilities` reports `Fees: NONE` and `AccessConstraints: NONE`.
**Before publishing**, confirm the formal terms of use / licence for the TRK
mobility data and adjust attribution accordingly.

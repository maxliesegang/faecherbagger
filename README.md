# Fächerbagger

Understandable view of current and upcoming road construction sites
("Baustellen") in the TechnologieRegion Karlsruhe. A static React app that makes
the data easier to grasp than the existing map-only view provided by TRK.

The name is a pun on Karlsruhe's nickname *Fächerstadt* (fan-shaped city) and
*Bagger* (excavator). UI language is German; code, comments and commits are
English.

> **Status:** The app includes the data pipeline, a personal "what is new around
> me" view with optional Web Push, filterable map and list views, distance
> sorting, and responsive construction-site details.

## What the app is for

The primary job is one question: **"Gibt es neue Baustellen in meiner
Umgebung?"** Everything else supports that answer.

- **Meine Umgebung** (default screen, [`ConstructionSiteSurroundings.tsx`](src/components/ConstructionSiteSurroundings.tsx)) —
  the visitor defines a *home area* once (a center from the device
  location or, as a fallback, from a municipality in the data, plus a radius).
  The screen then lists the construction sites inside that area that appeared
  within the visitor's time window, newest and nearest first, and marks the ones
  that arrived since the last visit. "Neu" means one thing everywhere in the
  app — the pipeline had not seen this construction site before — so the badge,
  the list and the push notification always agree; a source edit to a record
  someone already knows about does not resurface it. The same area powers Web
  Push, so an alert can arrive without opening the app. Secondary detail (all
  sites in the area, an area map, the area/notification settings) sits in
  disclosures below the answer.
- **Alle Baustellen** (secondary screen, [`ConstructionSiteExplorer.tsx`](src/components/ConstructionSiteExplorer.tsx)) —
  the full region: search, filters, sorting, map and list.

The active screen is part of the shareable URL state (`?bereich=umgebung|alle`,
default `umgebung`), so a link opens where its author intended. The home area
and the "seen" acknowledgement are personal state and stay in `localStorage` —
they are never put in the URL.

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
                     public/data/baustellen.json · meta.json · changes.json
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
6. **Generates feeds** from one shared `feed` model in RSS 2.0 and Atom 1.0
   formats.

Outputs (committed to the repo, served by Vite from `public/`):

| File | Contents |
| --- | --- |
| `public/data/baustellen.json` | Normalized, deduplicated records |
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
| [`src/shared/`](src/shared/) | app, pipeline, worker | Recency, home-area geometry and validation, distance, labels. Depends only on `src/types/`. |
| [`src/lib/`](src/lib/) | browser | Selection, filtering, sorting, URL state, storage, map layers, data loading. |
| [`src/pipeline/`](src/pipeline/) | Node, build time | WFS client, normalization, `firstSeenAt`, feeds, the additions artifact. |
| [`src/context/`](src/context/) | browser | `DatasetProvider`, `PersonalProvider`, `ViewProvider` — the three things a screen reads instead of taking props. |

The single selector [`selectSites`](src/lib/select-sites.ts) turns the dataset
plus a `SiteScope` into everything a screen renders, annotating each record once
with distance, recency and unseen. Both screens go through it, so the tab badge,
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
application shell and fonts, keeps the three Baustellen JSON files in a
network-first runtime cache, and refreshes them:

- through Periodic Background Sync where the browser permits it;
- through one-off Background Sync where available;
- whenever the installed app starts, returns online, or becomes visible.

Notifications are opted into where the home area is defined, on the
"Meine Umgebung" screen: the area is the subject of the notification, so both
are one decision. A successful opt-in sends a local test notification. The
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
  deployments it broadcasts the idempotent Web Push update: only construction
  sites whose `firstSeenAt` is newer than the last *completed* broadcast, which
  the push worker reports via `GET /broadcasts/last`. Editing an existing record
  never notifies anyone, and a fan-out that dies is caught up by the next run
  rather than skipped.
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
- `point` (representative) and `geometry` (full, for the map) are both kept.

## Data source & licensing

Data: **TechnologieRegion Karlsruhe (TRK) – Mobilitätsportal**
(`https://mobil.trk.de/geoserver/TBA/ows`). Source municipalities are surfaced
from the `datenquelle` field and attributed in the UI (Stadt Karlsruhe, Bruchsal,
Ettlingen, Rastatt, Rheinstetten, Stutensee, Baden-Baden).

The WFS `GetCapabilities` reports `Fees: NONE` and `AccessConstraints: NONE`.
**Before publishing**, confirm the formal terms of use / licence for the TRK
mobility data and adjust attribution accordingly.

# Fächerbagger

Understandable view of current and upcoming road construction sites
("Baustellen") in the TechnologieRegion Karlsruhe. A static React app that makes
the data easier to grasp than the existing map-only view provided by TRK.

The name is a pun on Karlsruhe's nickname *Fächerstadt* (fan-shaped city) and
*Bagger* (excavator). UI language is German; code, comments and commits are
English.

> **Status:** The app includes the data pipeline, filterable map and list views,
> distance sorting, and responsive construction-site details.

## How it works

The browser never talks to the WFS directly (CORS is unverified and the payload
is large). Instead a scheduled GitHub Action runs the pipeline and commits static
JSON into the repo; the client only ever fetches those files.

```
TRK GeoServer WFS ──(GitHub Action, twice daily)──▶ scripts/fetch-baustellen.ts
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

### Pipeline (`scripts/fetch-baustellen.ts`)

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
4. **Diffs** against the previous run (`stand` timestamp + `vorgangsnummer`) to
   produce `changes.json` — the basis for later notifications.
5. **Generates feeds** from one shared `feed` model in RSS 2.0 and Atom 1.0
   formats.

Outputs (committed to the repo, served by Vite from `public/`):

| File | Contents |
| --- | --- |
| `public/data/baustellen.json` | Normalized, deduplicated records |
| `public/data/meta.json` | Fetch timestamp, counts, source attribution |
| `public/data/changes.json` | Records added / modified / removed since last run |
| `public/baustellen.xml` | RSS 2.0 feed of current records, newest revisions first |
| `public/baustellen.atom` | Atom 1.0 feed generated from the same feed model |

The shared domain model lives in [`src/types/`](src/types/) and is imported by
both the Node pipeline and the React app — one source of truth.

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

Users opt in to notifications from the app. A successful opt-in sends a local
test notification. Later background refreshes compare `meta.fetchedAt` and show
a local summary based on `changes.json`. The optional Cloudflare Worker in
[`push-worker/`](push-worker/) stores Web Push subscriptions in D1; after Pages
deployment, GitHub Actions sends VAPID-authenticated pushes and removes expired
subscriptions. This wakes the service worker and refreshes cached data on iOS,
where periodic background sync is unavailable. On iPhone/iPad, the site must
first be added to the Home Screen before notification permission is available.

## Deployment

Three GitHub Actions (`.github/workflows/`):

- **`update-data.yml`** — cron (04:00 & 16:00 UTC) + manual dispatch. Runs the
  pipeline and commits any changed data.
- **`deploy.yml`** — builds and deploys to GitHub Pages on pushes to `main`, on
  manual dispatch, and after a successful data update (via `workflow_run`, since
  commits made with `GITHUB_TOKEN` do not trigger `push`). After data-triggered
  deployments it broadcasts the idempotent Web Push update.
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

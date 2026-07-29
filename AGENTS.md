# Repository Guidelines

## Project Overview

- Fächerbagger is a static React 19, TypeScript, and Vite PWA for current and
  upcoming road construction sites in the Karlsruhe region.
- The UI is German. Keep code, comments, commit messages, and developer
  documentation in English.
- The browser reads committed JSON from `public/data/`; it must not query the
  TRK WFS directly.
- The optional backend in `push-worker/` is a Cloudflare Worker backed by D1.
  It stores Web Push subscriptions; GitHub Actions perform notification fan-out.
- Preserve compatibility with the GitHub Pages project base path. Use
  `import.meta.env.BASE_URL` or URLs resolved against the service-worker scope
  for app-owned assets rather than root-relative paths.

## Repository Layout

- `src/components/`: React UI and component-specific CSS.
- `src/hooks/`: browser lifecycle and asynchronous React state.
  `useAppURLState` owns the shareable view state and the History API; every
  in-app navigation goes through it rather than touching `window.history`.
- `src/App.tsx`: page shell. It mounts the three providers, renders the load
  states, and picks the screen.
- `src/context/`: `DatasetProvider` (the published data), `PersonalProvider`
  (home area, acknowledgement, location, push — device-local, never shareable)
  and `ViewProvider` (the address-bar state plus the derived time window).
  Screens read these instead of receiving them as props.
- `src/shared/`: pure domain used by all three runtimes — recency, home-area
  geometry and validation, distance, labels. Depends on nothing but `src/types`.
- `src/lib/`: browser-only. Selection, filtering, sorting, URL state, storage,
  map layers, data loading.
- `src/pipeline/`: build-time only. WFS client, normalization, `firstSeenAt`,
  feeds, the additions artifact. Never imported by the app.
- `src/types/`: shared domain and WFS types used by the app and data pipeline.
- `src/sw.ts`: inject-manifest service worker and offline refresh behavior.
- `scripts/fetch-construction-sites.ts`: WFS fetch, normalization,
  deduplication, diff,
  and generation of `public/data/*.json`.
- `scripts/*push*.ts`: VAPID, GitHub configuration, and notification fan-out.
- `push-worker/`: subscription API, D1 schema/migrations, and Wrangler config.
- `test/`: Vitest tests; WFS samples belong in `test/fixtures/`.
- `.github/workflows/`: scheduled data refresh, Pages deployment, and Worker
  deployment.

## Product Focus

- The app's purpose is telling a visitor about **new construction sites in their
  own surroundings**. `ConstructionSiteSurroundings` is the default screen and
  must stay the shortest path to that answer; the region-wide explorer, filters,
  sorting and full map are secondary and stay one step away.
- The home area (center plus radius) is one shared concept: it scopes the
  surroundings screen, the map overlay and the Web Push subscription. Do not
  introduce a second, view-only radius. It is called `HomeArea` throughout the
  app; only `push-worker/` keeps the `notification_*` vocabulary, because there
  the name is accurate and it is the deployed wire format and D1 schema.
- Keep the surroundings screen usable without notifications and without a device
  location: the municipality center is the fallback, and a blocked, unsupported
  or unconfigured push service must degrade to an explanatory hint.
- New nearby records are ranked by detection time and then distance, and changes
  newer than the stored acknowledgement are highlighted. Personal state
  (area, acknowledgement) stays in `localStorage` and out of the URL.

## Development Practices

- Use Node.js 24 (see `.nvmrc`) and npm. From a clean checkout, install with
  `npm ci`.
- Keep TypeScript strict and use explicit, narrow types. Avoid `any`; narrow
  `unknown` at external boundaries.
- Include `.ts`/`.tsx` extensions in local imports and use `import type` for
  type-only imports, matching the existing `verbatimModuleSyntax` setup.
- Use full domain nouns for exported symbols and component props. Prefer
  `constructionSite`/`constructionSites` over generic `item`/`data`, predicate
  prefixes such as `is`, `has`, or `show` for booleans, and `on...` for event
  callbacks.
- Capitalize standard acronyms in identifiers (`URL`, `JSON`, `WFS`, `ISO`).
  Keep established third-party domain names such as MapLibre's `LngLat`.
- Keep German TRK field names only in WFS and serialized-data boundary code;
  use normalized English names everywhere else.
- Prefer pure helpers for behavior that can be tested without the DOM, in
  `src/shared/` when the pipeline or worker could want them too. Keep components
  focused on rendering and interaction wiring.
- "Neu" means one thing everywhere: the pipeline had not seen this construction
  site before (`firstSeenAt`). Badge, list, filter and push notification all
  derive from `getConstructionSiteRecency`. A source edit to a known record is
  not new — do not reintroduce a `lastModified`-based window.
- Both screens go through `selectSites`, which annotates each record once with
  distance, recency and unseen. Read those fields; never recompute them.
- Reuse the shared building blocks instead of repeating their markup:
  `ClientNavigationLink` for every in-app link (it keeps new-tab and modified
  clicks working), `ConstructionSiteBadges` for describing a record,
  `LoadingStatus` for waiting, and `LazyConstructionSiteMap` for the map.
- Reach `localStorage` only through `src/lib/browser-storage.ts`. Private
  browsing and a full quota make the API throw, and no personal state is worth
  a blank page.
- Preserve the established formatting: two spaces, double quotes, semicolons,
  and trailing commas where valid. There is no repository-wide formatter or
  linter command, so do not introduce broad formatting-only changes.
- Add or update focused tests whenever behavior changes. Tests should describe
  public behavior and use small fixtures rather than live network requests.
- Maintain accessible HTML: keyboard operation, visible focus, useful labels,
  semantic landmarks, and appropriate live regions are required.
- Reuse KERN UX components and tokens where they fit; use native KERN classes or
  local CSS for gaps rather than introducing another design system.
- Do not modify unrelated files in a dirty worktree.

## Data and Geometry Invariants

- `Baustelle.id` is the string `vorgangsnummer`; never coerce it to a number.
- `phase` comes from the source layer (`active` or `upcoming`), not from a
  recalculation using today's date.
- GeoJSON and application coordinates use `[longitude, latitude]`.
- Request WFS data as `EPSG:4326`. Keep `geom` in `propertyName`; GeoServer
  omits geometry when that property is absent.
- Deduplicate source features by `vorgangsnummer`, retaining both a
  representative point for lists/distance and merged geometry for the map.
- Convert WFS timestamps to Europe/Berlin calendar dates and keep `endDate`
  nullable. Do not let the machine's local timezone change normalized output.
- Treat free-form source fields as untrusted. Normalize categories and closure
  severity, sanitize additional information to plain text, and handle missing
  or malformed geometry defensively.
- Keep output ordering deterministic. Unknown construction categories must
  remain observable through warnings and fall back to `other`.

## Generated Data

- `public/data/baustellen.json`, `meta.json`, `changes.json`,
  `public/baustellen.xml`, and `public/baustellen.atom` are generated and
  committed artifacts. Do not hand-edit them.
- Regenerate them only with `npm run data`; this requires network access to
  `mobil.trk.de`. It reads the committed `baustellen.json` to carry `firstSeenAt`
  forward — that field is what the push pipeline notifies on, so regenerating
  from an empty `public/data/` would mark every record new.
- A normal UI or domain-logic change should not refresh generated data.
- If pipeline behavior changes, test the normalization and window logic with
  fixtures before regenerating data, and review all three generated files.

## Map, PWA, and Push Guidance

- Create the MapLibre instance once, remove it during effect cleanup, and update
  existing GeoJSON sources or layer filters when props change. Avoid rebuilding
  the map for React state updates.
- Preserve intentional map layer ordering: home area, detailed
  geometries, clusters/points, selection, and user location. Batch each logical
  source update with one `GeoJSONSource.setData` call where practical.
- Keep the map dynamically imported so the initial UI bundle stays small.
- The service worker uses network-first caching for the three data files.
  Changes to cache names, update messages, sync tags, or notification handling
  must preserve offline startup and refresh behavior.
- Web Push subscription data and location-radius preferences are sensitive.
  Validate request bodies and origins, keep administrator endpoints
  authenticated, use parameterized D1 queries, and never log or commit
  endpoints, auth keys, VAPID private keys, admin tokens, or local secret files.
- D1 schema changes require an additive migration under
  `push-worker/migrations/` and corresponding Worker type/query updates. Do not
  rewrite an already-applied production migration.
- Load deployment values through environment variables, GitHub
  variables/secrets, or Wrangler secrets. Never hard-code private credentials.

## Verification

Run the checks relevant to the files changed:

```sh
npm test
npm run typecheck
npm run build
```

- Run the focused Vitest file first while iterating, for example:
  `npx vitest run test/construction-site-normalization.test.ts`.
- `npm run build` already runs `npm run typecheck`, but run both when reporting
  their results independently.
- For pipeline changes, also run `npm run data` when network access and an
  intentional data refresh are in scope; otherwise state that it was not run.
- For push Worker changes, run the typecheck and use local Wrangler/D1 commands
  when the behavior needs integration testing. Never target the remote database
  or deploy unless explicitly requested.
- Do not report completion while a required check is failing. If a check cannot
  be run, say which check and why.

## Deployment and Licensing

- `main` deploys the static site through GitHub Actions; scheduled data updates
  trigger deployment through `workflow_run`.
- Keep the default Vite base `/faecherbagger/` working and preserve support for
  the `BASE_PATH` override.
- The code is EUPL-1.2. Keep additions license-compatible.
- Do not broaden claims about the TRK data license. Preserve attribution and the
  README's requirement to confirm formal data terms before publication.

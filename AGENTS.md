# Repository Guidelines

## Project Overview

- Fächerbagger is a static React 19, TypeScript, and Vite PWA for current and
  upcoming road construction sites in the Karlsruhe region.
- The UI is German. Keep code, comments, commit messages, and developer
  documentation in English.
- The browser reads committed JSON from `public/data/`; it must not query the
  TRK WFS directly.
- The optional backend in `push-worker/` is a Cloudflare Worker backed by D1.
  It stores Web Push subscriptions — endpoints only — and GitHub Actions
  broadcast a contentless wake-up push. Notification areas and preferences stay
  on the device; the service worker decides locally what to show. Never add a
  location, radius or preference column to that database.
- Preserve compatibility with the GitHub Pages project base path. Use
  `import.meta.env.BASE_URL` or URLs resolved against the service-worker scope
  for app-owned assets rather than root-relative paths.

## Repository Layout

- `src/components/`: React UI and component-specific CSS.
- `src/hooks/`: browser lifecycle and asynchronous React state.
- `src/lib/`: framework-independent domain, filtering, mapping, data-loading,
  notification, and push helpers.
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
- Prefer pure helpers in `src/lib/` for behavior that can be tested without the
  DOM. Keep components focused on rendering and interaction wiring.
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

- `public/data/baustellen.json`, `baustellen-geometrie.json`, `meta.json`,
  `changes.json`, `ereignisse.json`, `public/baustellen.xml`, and
  `public/baustellen.atom` are generated and committed artifacts. Do not
  hand-edit them.
- Regenerate them only with `npm run data`; this requires network access to
  `mobil.trk.de` and intentionally diffs against the previous committed data.
- A normal UI or domain-logic change should not refresh generated data.
- If pipeline behavior changes, test the normalization/diff logic with fixtures
  before regenerating data, and review all three generated files.

## Map, PWA, and Push Guidance

- Create the MapLibre instance once, remove it during effect cleanup, and update
  existing GeoJSON sources or layer filters when props change. Avoid rebuilding
  the map for React state updates.
- Preserve intentional map layer ordering: notification area, detailed
  geometries, clusters/points, selection, and user location. Batch each logical
  source update with one `GeoJSONSource.setData` call where practical.
- Keep the map dynamically imported so the initial UI bundle stays small.
- `baustellen.json` carries no geometry: shapes live in
  `baustellen-geometrie.json` and are fetched only once a map mounts
  (`useConstructionSiteGeometries`). Lists, search, sorting and distance use
  `point` alone — do not reach for geometry outside the map.
- Notification rules (`src/lib/notification-events.ts`,
  `notification-message.ts`, `notification-preferences.ts`) are pure and shared
  by the pipeline, the service worker and the tests. Put behaviour there rather
  than in `src/sw.ts` or `scripts/send-push.ts`, both of which are untestable.
- Notification preferences live in IndexedDB
  (`notification-preferences-store.ts`), not `localStorage`: the service worker
  has to read the same record and cannot reach `localStorage`.
- The result list renders either the table or the cards, chosen from the
  measured width of the results column (`useResultLayout`) and paged by
  `useIncrementalList`. Do not reintroduce a CSS `display` toggle — it built
  every record twice.
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

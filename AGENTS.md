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

- `src/components/`: React UI and component-specific CSS. A component's rules
  live in its own stylesheet — including its media queries, its `pointer: coarse`
  targets and its reduced-motion overrides — so one component is one file to
  read. `src/App.css` holds only what is app-wide: the design tokens, the
  notification tones, the page shell and bar, and the `.app-screen` column that
  every top-level screen shares.
- `src/hooks/`: browser lifecycle and asynchronous React state.
  `useAppURLState` owns the shareable view state and the History API; every
  in-app navigation goes through it rather than touching `window.history`.
- `src/App.tsx`: page shell. It mounts the three providers, renders the load
  states, and picks the screen. The section tabs stay mounted above a detail
  page, so the bottom bar is never lost on a phone.
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

- The app's purpose is giving a visitor **lead time on construction sites in
  their own surroundings**: something starts near them in the next few days and
  they get to hear about it early enough to plan around it. The notification is
  the product, and `NotificationSettings` carries everything it depends on.
  `ConstructionSiteSurroundings` is the default screen and answers the same
  question in the app. The region-wide explorer with its filters, sorting, table
  and map is the power-user surface and stays one step away.
- "Kurzfristig" is the app's central idea and has one definition, in
  `src/shared/construction-site-timing.ts`: a site starts within
  `SHORT_NOTICE_LEAD_DAYS` days or started within that many days and is still
  running. The default list, the ranking and the push message all derive from
  it, so the notification and the screen it opens cannot disagree.
- Timing (`running`, `starting-soon`, `later`, `ended`) is derived from the
  dates against the dataset's own day and is a *display* classification. It
  never replaces `phase`, which stays exactly as the source layer set it; a
  record whose `endDate` has passed reads as `ended` without its `phase` being
  rewritten.
- There are three top-level sections: `NotificationSettings`, surroundings and
  explorer, in that tab order — notifications first because that switch is the
  one setting that keeps working after the app is closed, and on a phone the
  first slot is the easiest to reach. The default section stays `surroundings`,
  so a bare URL opens the answer. They render as a tab row from 48rem up and as
  a fixed bottom bar below it; keep both shapes working and keep the section in
  the URL.
- Say a thing once. Each surface owns one concern, and a second copy of it is a
  bug: the area is edited in the notification section only, the notification
  state is spelled out in `NotificationStatusCard` only (the tab dot is the one
  abbreviation of it elsewhere), the data timestamp lives in the page bar, and
  the feeds live with the notification section they are the alternative to. The
  surroundings screen shows one list at a time, picked by one segmented control
  ("Kurzfristig", "Läuft", "Geplant", "Alle") in that order, most urgent first —
  a second list stacked above the first renders the same record twice on one
  screen. The control carries the counts; do not restate a count beside it.
- Anything that states the notification state — the tab dot, the status card —
  renders `describeNotificationState` rather than re-deriving the combination of
  browser support, deployment configuration, permission and area. Its tone
  becomes a `notification-tone--*` class, and `src/App.css` is the only place
  that turns a tone into a colour. `unavailable` is the one tone a surface may
  drop, because it is the only one without a next step for the visitor.
- The home area (center plus radius) is one shared concept: it scopes the
  surroundings screen, the map overlay and the Web Push subscription. It is
  edited in `HomeAreaSetup`, which is rendered by `NotificationSettings` and
  nowhere else — the distance is what a notification is about, so the switch and
  the radius are one decision on one screen. The surroundings screen states the
  radius and links to that section instead of rendering a second editor; do not
  introduce a second, view-only radius. `HomeAreaSetup` owns the draft radius
  and saving stays explicit, because saving re-syncs the push subscription. It
  is called `HomeArea` throughout the app and `Umkreis` throughout the German
  UI; only `push-worker/` keeps the `notification_*` vocabulary, because there
  the name is accurate and it is the deployed wire format and D1 schema.
- The closure level (`NotificationClosureLevelSetup`) is the second half of that
  same decision and lives in the same section: the area says where to look, the
  level says what is worth saying. Unlike the radius it saves on change — one
  click is the whole choice — and it reports through the push controller's
  message channel rather than growing one of its own. Both travel to the service
  as one `NotificationPreferences` object.
- Use a map only where the question is spatial. The explorer has one, and a
  detail page has one. The surroundings screen does not: it answers "was ist bei
  mir neu?" with a distance-sorted list, and the map that used to sit above that
  list pushed the answer off a phone screen without adding to it.
- Keep the surroundings screen usable without notifications and without a device
  location, and never gate it behind setup: with no stored area it selects over
  `FALLBACK_HOME_AREA` (Karlsruhe, `effectiveArea` in `PersonalContext`) and says
  so in one quiet line. Everything that *acts* on an area — the push
  subscription, the notification state, the editor — reads `area` and must never
  see the fallback. A blocked, unsupported or unconfigured push service must
  degrade to an explanatory hint.
- Ranking follows the question the list answers: short notice by urgency then
  distance, "Läuft" by distance, "Geplant" by start date. Records newer than the
  stored acknowledgement are highlighted. Personal state (area, acknowledgement)
  stays in `localStorage` and out of the URL.
- Colour on a card means traffic impact and nothing else: `danger` and `warning`
  belong to closure severity. "Neu" is a neutral accent chip, and the phase
  badges are neutral too — a card states when it happens in words
  (`describeConstructionTiming`), which is more than a two-value badge can say.
- A card leads with the street, then the timing sentence, then the source's own
  `notes`. Distance is metadata: inside a radius the visitor chose, it decides
  far less than either of the first two.
- Lists render a first screenful and an explicit "weitere N anzeigen". A radius
  can hold hundreds of records and none of them are worth an unbounded page.

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
  callbacks. The record is a `ConstructionSite` everywhere it is named in an
  export or a prop — never a bare `Site`, which was how `ScopedSite` and
  `SiteScope` drifted away from the `ConstructionSite*` types beside them. A
  short local (`scoped`, `candidate`, `left`/`right` in a comparator) is fine.
- One concept, one name, spelled the same from the context that owns it to the
  prop that receives it: `getConstructionSiteDetailHref`,
  `openConstructionSiteDetail`, `showConstructionSiteOnMap`. If a screen has to
  rename a value while destructuring it — `openSiteDetails: onDetailOpen` — the
  two names are the bug, not the aliasing.
- Callbacks take one of two shapes and nothing else: `on<Noun>Change` when a
  value is being replaced (`onFiltersChange`,
  `onSelectedConstructionSiteIdChange`) and `on<Verb><Noun>` when an action is
  being requested (`onOpenConstructionSiteDetail`, `onShowList`). A `Request`
  suffix is neither; it was a third spelling of the second shape.
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
  not new — do not reintroduce a `lastModified`-based window. "Neu" marks a
  record; it does not rank one, because when the work happens is what a visitor
  acts on and `firstSeenAt` says nothing about that.
- Both screens go through `selectConstructionSites`, which annotates each record
  once with
  distance, recency, timing, short notice and unseen, and hands back the lists
  and the day it measured against. Read those fields; never recompute them, and
  never reach for the browser clock — "heute" comes from the data's `fetchedAt`
  in the Europe/Berlin calendar.
- Reuse the shared building blocks instead of repeating their markup:
  `ClientNavigationLink` for every in-app link (it keeps new-tab and modified
  clicks working), `ConstructionSiteBadges` for describing a record,
  `LoadingStatus` for waiting, and `LazyConstructionSiteMap` for the map.
- Report the outcome of an action next to the control that triggered it:
  `HomeAreaSetup` owns the message about the area, and `NotificationStatusCard`
  renders the push controller's. Do not borrow another controller's message
  channel to say something about your own concern.
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
- Design mobile-first and verify at 320 px: no horizontal page scroll, touch
  targets of at least 2.75rem under `@media (pointer: coarse)`, and content that
  clears the fixed bottom navigation including `env(safe-area-inset-bottom)`.
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
- The two are published apart: `ConstructionSite` carries the point,
  `geometrien.json` carries the geometry by id, and
  `splitConstructionSiteGeometries` is the one place they separate. Geometry is
  most of the payload and only the map reads it, so nothing outside
  `src/pipeline/` and the map may expect it on a record — reach for
  `loadConstructionSiteGeometries` instead of widening the type back.
- Convert WFS timestamps to Europe/Berlin calendar dates and keep `endDate`
  nullable. Do not let the machine's local timezone change normalized output.
- Treat free-form source fields as untrusted. Normalize categories and closure
  severity, sanitize additional information to plain text, and handle missing
  or malformed geometry defensively.
- Keep output ordering deterministic. Unknown construction categories must
  remain observable through warnings and fall back to `other`.

## Generated Data

- `public/data/baustellen.json`, `geometrien.json`, `meta.json`, `changes.json`,
  `public/baustellen.xml`, and `public/baustellen.atom` are generated and
  committed artifacts. Do not hand-edit them.
- Regenerate them only with `npm run data`; this requires network access to
  `mobil.trk.de`. It reads the committed `baustellen.json` to carry `firstSeenAt`
  forward — that field is what the push pipeline notifies on, so regenerating
  from an empty `public/data/` would mark every record new.
- A normal UI or domain-logic change should not refresh generated data.
- If pipeline behavior changes, test the normalization and window logic with
  fixtures before regenerating data, and review every generated file.

## Map, PWA, and Push Guidance

- Create the MapLibre instance once, remove it during effect cleanup, and update
  existing GeoJSON sources or layer filters when props change. Avoid rebuilding
  the map for React state updates.
- Preserve intentional map layer ordering: home area, detailed
  geometries, clusters/points, selection, and user location. Batch each logical
  source update with one `GeoJSONSource.setData` call where practical.
- Keep the map dynamically imported so the initial UI bundle stays small, and
  keep `geometrien.json` behind it: the map component fetches it on mount
  through the shared, memoized `loadConstructionSiteGeometries`, and draws every
  record as a point until it arrives. A missing geometry is a normal first
  paint, never an error state.
- The service worker uses network-first caching for the data files but refreshes
  only `baustellen.json` and `meta.json` in the background. Changes to cache
  names, update messages, sync tags, or notification handling must preserve
  offline startup and refresh behavior.
- A notification needs two reasons, not one: `isNotifiableConstructionSite` in
  `src/shared/notification-relevance.ts` requires that the record is short
  notice *and* that its closure reaches the subscription's level. Do not push on
  `firstSeenAt` alone — it is when the pipeline learned about a record, not when
  the work happens, and the source backfills.
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

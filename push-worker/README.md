# Fächerbagger Web Push Worker

This Cloudflare Worker stores Web Push subscriptions in D1.

**It stores delivery data, not locations.** Rows hold the endpoint, encryption
keys, expiration, timestamps and, for Safari and Firefox devices, the date of the next
planned push. Areas, radii and preferences stay on the device, where the service worker
decides what to show. Do not add a location, radius or preference column.

The Worker does not fan out pushes. After a Pages deployment, the GitHub
Actions runner reads subscriptions in pages and broadcasts the wake-up push,
which avoids Worker subrequest limits and stays in the free tier. The only push
the Worker sends itself is the delivery test, hence `src/web-push.ts`.

## Production

The production resources already exist:

- Worker: `https://faecherbagger-push.faecherbagger.workers.dev`
- D1 database: `faecherbagger-push`, created with a Western Europe location hint
  (a hint is not a verified EU jurisdiction constraint)
- Allowed web origin: `https://maxliesegang.github.io`

### Deploying

Deploy only through the **Deploy push worker** workflow. It runs on every push
to `main` that touches `push-worker/`, and manually via
`gh workflow run deploy-push-worker.yml`. In order, it:

1. checks that every variable and secret below is set,
2. applies pending D1 migrations (`npm run push:db:migrate:remote`),
3. deploys the Worker and sets all four Worker secrets,
4. checks the live Worker: `/config` must return the VAPID public key and the
   delivery test must answer 404, not 503, for an unknown endpoint.

Do not run `wrangler deploy` by hand: it uploads the code but neither the
secrets nor the migrations. That gap once left the delivery test answering
503.

### Schema changes

Add a numbered file to `migrations/` and update `schema.sql` to match. The
workflow applies new files through `wrangler d1 migrations`, which records them
in the `d1_migrations` table. Never edit a migration that has already run.

`scripts/prepare-push-database.ts` creates that ledger the first time. On an
empty database it loads `schema.sql`; on one migrated by hand it records the
migrations whose effect it can see. Once the ledger exists it does nothing.

### GitHub configuration

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `PUSH_API_URL` | Worker URL |
| Variable | `APP_URL` | `https://maxliesegang.github.io/faecherbagger/` |
| Variable | `VAPID_PUBLIC_KEY` | Public VAPID key |
| Variable | `VAPID_SUBJECT` | Same as `APP_URL` |
| Secret | `VAPID_PRIVATE_KEY` | Private VAPID key |
| Secret | `PUSH_ADMIN_TOKEN` | Admin token for the Worker |
| Secret | `CLOUDFLARE_API_TOKEN` | API token, see below |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

`npm run push:github:setup` writes the first six from the git-ignored
`push-worker/.production-secrets.local.json` (mode `0600`), the recovery copy
created by `npm run push:secrets:setup`. That script refuses to overwrite
existing keys: rotating VAPID keys invalidates every browser subscription.

For `CLOUDFLARE_API_TOKEN`, create a token in the Cloudflare dashboard (My
Profile → API Tokens) from the "Edit Cloudflare Workers" template and add
**Account → D1 → Edit**. Then:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID   # from `npx wrangler whoami`
```

### First-time provisioning

For a new Cloudflare account:

```bash
npx wrangler login
npx wrangler d1 create faecherbagger-push --jurisdiction eu
npm run push:secrets:setup
npm run push:github:setup
```

Put the new `database_id` into `wrangler.jsonc`, set the two Cloudflare
secrets, and run the workflow.

## Local Worker

Copy `.dev.vars.example` to `.dev.vars`, then run:

```bash
npm run push:db:init:local
npm run push:dev
```

For local end-to-end browser testing, also copy the repository `.env.example`
to `.env.local`, point it to the local Worker, and ensure the local Worker
allows the Vite origin.

## Endpoints

- `GET /health` — unauthenticated health check.
- `GET /config` — returns the public VAPID key.
- `POST /subscriptions` — creates or refreshes a browser subscription.
- `DELETE /subscriptions` — removes a browser subscription.
- `POST /subscriptions/list` — administrator-only cursor-paginated export;
  JSON body `{ "limit": 500, "after": "" }`, then the returned `nextCursor`
  as `after`. Do not put endpoints in URLs.
- `POST /subscriptions/status` — JSON body `{ "endpoint": "…" }`; tells an allowed browser origin
  whether its current subscription is still registered.
- `POST /subscriptions/rotate` — atomically replaces a browser-managed push
  endpoint after `pushsubscriptionchange`.
- `POST /notifications/test` — sends one real, rate-limited test delivery to a
  registered endpoint.
- `POST /events/claim` — administrator-only, idempotently claims notification
  event signatures before a broadcast.
- `POST /subscriptions/notified` — administrator-only, records successful sends
  for the per-device delivery cap.

Endpoints and encryption keys identify browser subscriptions; they are not
anonymous. D1 also stores delivery timestamps, expiration and the single next
push date. There are no user accounts or separate analytics identifiers.

## Privacy operations

All JSON responses use `Cache-Control: no-store`. The app uses request bodies,
omits cookies and referrers on push requests, and stores pending deletion
requests in IndexedDB before ending the browser subscription. Pending requests
are retried when the app opens, returns online or becomes visible. Keep local
app storage until deletion is confirmed. A deployment that changes the API URL
does not forward old endpoints to a different API; finish pending deletions
before changing providers. Invalid endpoints are removed when the push service
returns 404 or 410 during a send.

Automatic invocation logs and traces are disabled in `wrangler.jsonc`. Query
redaction also protects custom log metadata from query-based requests made by
older clients. Only a fixed error code is emitted for unexpected request
failures; never log exceptions, request URLs, bodies, headers or SQL values.
GitHub Actions records only aggregate delivery counts and status codes, but its
runner still processes subscriptions and keys in memory. Cloudflare's own
operational processing is separate from these application logging settings.

Deploy the Worker through **Deploy push worker** before releasing the app and
updated sender. The old GET status/export APIs now return 405; existing cached
apps need to update to the new build. During the transition an old client can
show an unknown subscription status, while existing push delivery is unchanged.
The deploy workflow's subscription probe does not send a real push.

Before publication, record the actual account plan, log retention, D1 backup
window, applicable provider contracts and international transfer safeguards.
The public notice gives upper bounds: seven days for Workers Logs and thirty
days for D1 recovery history (currently three/seven and seven/thirty days for
Free/Paid respectively). Deleting a row does not instantly erase recovery
history. After a database restore, check for reinstated subscriptions before
resuming delivery. Do not claim that overwriting `next_push_on` removes all
historical copies.

Cloudflare's DPA is incorporated by section 6.1 of its Self-Serve Subscription
Agreement for covered personal data. Archive the applicable version and review
GitHub's applicable terms as well; configuration alone is not a compliance
assessment. Resources:

- [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)
- [Self-Serve Subscription Agreement](https://www.cloudflare.com/terms/)
- [Cloudflare GDPR FAQ](https://www.cloudflare.com/trust-hub/gdpr/)
- [Workers Logs and retention](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [D1 recovery history](https://developers.cloudflare.com/d1/reference/time-travel/)
- [GitHub privacy information](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)

### EU database jurisdiction

No production database was inspected or migrated as part of the source change.
A `weur` location hint does not establish EU-only storage. Inspect the database
details in the Cloudflare dashboard (or D1 database-details API) and record its
`jurisdiction`. For new databases, use `--jurisdiction eu` as shown above.
Jurisdiction cannot be added to an existing database.

If the current database has no EU constraint, migrate during a maintenance
window:

1. Pause broadcasts and subscription writes so an export cannot miss updates or
   resurrect deletions. Create a new D1 database with `--jurisdiction eu`.
2. Export and import the database using secure temporary storage outside the
   repository. Treat the entire export as sensitive; do not attach it to an
   issue, CI log or workflow artifact. Preserve the migration ledger and event
   bookkeeping along with subscriptions.
3. Update the D1 binding's database name and ID in `wrangler.jsonc`, plus the
   database target in the npm migration commands and provisioning script.
   Deploy through **Deploy push worker**, which applies migrations and secrets.
4. Verify registration, deletion and a user-triggered test delivery against the
   new database, then resume writes and broadcasts. Complete the old database's
   retirement and document its backup lifecycle. Do not resume sending from an
   old snapshot as a rollback without reconciling deletions first.

An EU D1 jurisdiction does not regionalize Worker execution, GitHub Actions,
browser push services or all Cloudflare operational metadata. Do not describe
the whole service as EU-only.

- [D1 jurisdiction documentation](https://developers.cloudflare.com/d1/configuration/data-location/)
- [Worker regional processing](https://developers.cloudflare.com/data-localization/how-to/workers/)

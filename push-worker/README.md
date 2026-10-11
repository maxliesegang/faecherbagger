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
- D1 database: `faecherbagger-push` in Western Europe
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
npx wrangler d1 create faecherbagger-push --location weur
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
- `GET /subscriptions` — administrator-only cursor-paginated export.
- `GET /subscriptions/status?endpoint=…` — tells an allowed browser origin
  whether its current subscription is still registered.
- `POST /subscriptions/rotate` — atomically replaces a browser-managed push
  endpoint after `pushsubscriptionchange`.
- `POST /notifications/test` — sends one real, rate-limited test delivery to a
  registered endpoint.
- `POST /events/claim` — administrator-only, idempotently claims notification
  event signatures before a broadcast.
- `POST /subscriptions/notified` — administrator-only, records successful sends
  for the per-device delivery cap.

Only endpoint URLs and their Web Push encryption keys are stored. There are no
user accounts or analytics identifiers.

# Fächerbagger Web Push Worker

This Cloudflare Worker stores standards-based Web Push subscriptions and their
anonymous radius preferences in D1.
It deliberately does not fan out pushes itself: after a successful Pages
deployment, the existing GitHub Actions runner reads subscriptions in paginated
batches and sends the encrypted notifications. This avoids Worker subrequest
limits and stays inside the free tier.

## One-time production setup

Requirements: a free Cloudflare account and administrator access to the GitHub
repository.

The production resources for this repository are already provisioned:

- Worker: `https://faecherbagger-push.faecherbagger.workers.dev`
- D1 database: `faecherbagger-push` in Western Europe
- Allowed web origin: `https://maxliesegang.github.io`

The one-time provisioning was performed with:

```bash
npx wrangler login
npx wrangler d1 create faecherbagger-push --location weur
npm run push:db:init:remote
npm run push:deploy
npm run push:secrets:setup
npm run push:github:setup
```

Migrations under `migrations/` are additive and applied once, in order, **before
the Worker that needs them is deployed** — `schema.sql` only creates missing
tables and cannot add a column to an existing one:

```bash
# Only for a database created before radius filtering:
npx wrangler d1 execute faecherbagger-push --remote \
  --file=push-worker/migrations/0001_notification_radius.sql \
  --config=push-worker/wrangler.jsonc

# Required for the broadcast completion tracking:
npx wrangler d1 execute faecherbagger-push --remote \
  --file=push-worker/migrations/0002_broadcast_completion.sql \
  --config=push-worker/wrangler.jsonc
```

`push:secrets:setup` refuses to overwrite an existing local secret set because
rotating VAPID keys invalidates every current browser subscription. The ignored
file `push-worker/.production-secrets.local.json` is mode `0600` and is the
recovery copy for the GitHub Actions secrets.

The GitHub repository contains these values:

| Kind | Names |
| --- | --- |
| Variables | `PUSH_API_URL`, `APP_URL`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` |
| Secrets | `PUSH_ADMIN_TOKEN`, `VAPID_PRIVATE_KEY` |

Future Worker deployments can be done locally with `npm run push:deploy`.
Alternatively, configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as
GitHub secrets and run the manual **Deploy push worker** workflow.

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
- `POST /subscriptions` — creates or refreshes a browser subscription and
  optionally stores `{ preferences: { center: [longitude, latitude],
  radiusKm } }`.
- `DELETE /subscriptions` — removes a browser subscription. A browser must
  prove possession by sending the subscription's `auth` key alongside the
  endpoint, so knowing an endpoint URL alone cannot unsubscribe someone else's
  device. The administrator token skips the proof, because the fan-out prunes
  endpoints the push service has rejected and holds no key for them.
- `GET /subscriptions` — administrator-only cursor-paginated export.
- `POST /broadcasts/claim` — administrator-only claim of one data run for one
  sender. A run that was claimed but never completed becomes claimable again
  after 30 minutes, so a fan-out that died half-way is retried instead of
  leaving the remaining subscriptions unnotified.
- `POST /broadcasts/complete` — administrator-only; the sender reports that it
  walked every subscription. Individual delivery failures do not reopen a
  broadcast, because a retry would notify the devices that already received it.

Only endpoint URLs and their Web Push encryption keys are stored. There are no
user accounts or analytics identifiers.

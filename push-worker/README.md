# Fächerbagger Web Push Worker

This Cloudflare Worker stores standards-based Web Push subscriptions in D1.

**It stores delivery data, not watched locations** — no coordinates, no radius,
no notification preferences. Those stay on the subscriber's device, and the
service worker decides locally which of a run's events to show. Subscription
rows contain the endpoint, encryption keys, expiration and operational
timestamps only. Keep it that way: do not add a location, radius or preference
column.

It deliberately does not fan out pushes itself: after a successful Pages
deployment, the GitHub Actions runner reads subscriptions in paginated batches
and broadcasts the wake-up push. This avoids Worker subrequest limits and stays
inside the free tier. The Worker does send one push on its own — the on-demand
delivery test — which is why `src/web-push.ts` exists.

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

Apply outstanding migrations once before deploying the updated Worker, oldest
first:

```bash
npx wrangler d1 execute faecherbagger-push --remote \
  --file=push-worker/migrations/0002_notification_preferences.sql \
  --config=push-worker/wrangler.jsonc
```

`0002` drops the stored radius columns (superseded by device-local matching) and
adds the event ledger. `0001_notification_radius.sql` is only needed for
databases created before it.

The Worker additionally needs `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` as
secrets, for the delivery test; `deploy-push-worker.yml` sets them.

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

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

For an existing database created before radius filtering, apply the migration
once before deploying the updated Worker:

```bash
npx wrangler d1 execute faecherbagger-push --remote \
  --file=push-worker/migrations/0001_notification_radius.sql \
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
- `DELETE /subscriptions` — removes a browser subscription.
- `GET /subscriptions` — administrator-only cursor-paginated export.
- `POST /broadcasts/claim` — administrator-only idempotency claim.

Only endpoint URLs and their Web Push encryption keys are stored. There are no
user accounts or analytics identifiers.

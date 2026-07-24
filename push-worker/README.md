# Fächerbagger Web Push Worker

This Cloudflare Worker stores standards-based Web Push subscriptions in D1.
It deliberately does not fan out pushes itself: after a successful Pages
deployment, the existing GitHub Actions runner reads subscriptions in paginated
batches and sends the encrypted notifications. This avoids Worker subrequest
limits and stays inside the free tier.

## One-time production setup

Requirements: a free Cloudflare account and administrator access to the GitHub
repository.

1. Generate one VAPID key pair and a separate administrator token:

   ```bash
   npm run push:keys
   openssl rand -hex 32
   ```

   Keep the private key and administrator token secret. VAPID keys must remain
   stable; replacing them invalidates existing browser subscriptions.

2. Authenticate Wrangler and create the free D1 database:

   ```bash
   npx wrangler login
   npx wrangler d1 create faecherbagger-push
   ```

3. In `wrangler.jsonc`:

   - replace `REPLACE_WITH_D1_DATABASE_ID` with the returned database ID;
   - replace the `ALLOWED_ORIGINS` placeholder with the Pages origin, for
     example `https://example.github.io` (no path).

4. Configure the Worker secrets, initialize D1, and deploy:

   ```bash
   npx wrangler secret put ADMIN_TOKEN --config push-worker/wrangler.jsonc
   npx wrangler secret put VAPID_PUBLIC_KEY --config push-worker/wrangler.jsonc
   npm run push:db:init:remote
   npm run push:deploy
   ```

5. Add these GitHub repository **variables**:

   | Name | Value |
   | --- | --- |
   | `PUSH_API_URL` | Worker URL printed by `push:deploy` |
   | `APP_URL` | Full Pages app URL, including `/faecherbagger/` |
   | `VAPID_PUBLIC_KEY` | Generated public VAPID key |
   | `VAPID_SUBJECT` | A contact `mailto:` URL or the HTTPS app URL |

6. Add these GitHub repository **secrets**:

   | Name | Value |
   | --- | --- |
   | `PUSH_ADMIN_TOKEN` | Random administrator token from step 1 |
   | `VAPID_PRIVATE_KEY` | Generated private VAPID key |
   | `CLOUDFLARE_API_TOKEN` | Token allowed to edit Workers, Worker secrets, and D1 |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

7. Run the **Deploy to GitHub Pages** workflow once. The public
   `PUSH_API_URL` variable is embedded during the Vite build. Future Worker
   changes can be deployed through the manually triggered **Deploy push
   worker** workflow.

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
- `POST /broadcasts/claim` — administrator-only idempotency claim.

Only endpoint URLs and their Web Push encryption keys are stored. There are no
user accounts or analytics identifiers.

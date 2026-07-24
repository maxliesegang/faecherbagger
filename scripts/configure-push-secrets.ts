import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import webpush from "web-push";

const outputPath = resolve(
  "push-worker/.production-secrets.local.json",
);
if (existsSync(outputPath)) {
  throw new Error(
    `${outputPath} already exists. Refusing to rotate VAPID keys because that would invalidate current subscriptions.`,
  );
}

const vapid = webpush.generateVAPIDKeys();
const values = {
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  PUSH_ADMIN_TOKEN: randomBytes(32).toString("hex"),
};

await writeFile(outputPath, JSON.stringify(values, null, 2) + "\n", {
  mode: 0o600,
});
await chmod(outputPath, 0o600);

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "faecherbagger-push-secrets-"),
);
const bulkPath = join(temporaryDirectory, "worker-secrets.json");
try {
  await writeFile(
    bulkPath,
    JSON.stringify({
      ADMIN_TOKEN: values.PUSH_ADMIN_TOKEN,
      VAPID_PUBLIC_KEY: values.VAPID_PUBLIC_KEY,
    }),
    { mode: 0o600 },
  );
  execFileSync(
    "npx",
    [
      "wrangler",
      "secret",
      "bulk",
      bulkPath,
      "--config",
      "push-worker/wrangler.jsonc",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log("Cloudflare Worker secrets configured.");
console.log(`GitHub secret values saved with mode 0600 at ${outputPath}`);
console.log(`VAPID public key: ${values.VAPID_PUBLIC_KEY}`);

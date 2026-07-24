import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import sodium from "libsodium-wrappers";

interface LocalSecrets {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  PUSH_ADMIN_TOKEN: string;
}

interface RepositoryPublicKey {
  key_id: string;
  key: string;
}

const repository = "maxliesegang/faecherbagger";
const secrets = JSON.parse(
  await readFile(
    "push-worker/.production-secrets.local.json",
    "utf8",
  ),
) as LocalSecrets;

const credentialOutput = execFileSync("git", ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
  stdio: ["pipe", "pipe", "inherit"],
});
const credential = Object.fromEntries(
  credentialOutput
    .trim()
    .split("\n")
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const token = credential.password;
if (!token) {
  throw new Error(
    "No GitHub HTTPS credential is available. Authenticate Git first, then retry.",
  );
}

const variables = {
  PUSH_API_URL: "https://faecherbagger-push.faecherbagger.workers.dev",
  APP_URL: "https://maxliesegang.github.io/faecherbagger/",
  VAPID_PUBLIC_KEY: secrets.VAPID_PUBLIC_KEY,
  VAPID_SUBJECT: "https://maxliesegang.github.io/faecherbagger/",
};

for (const [name, value] of Object.entries(variables)) {
  await upsertVariable(name, value);
}

const publicKey = await github<RepositoryPublicKey>(
  `/repos/${repository}/actions/secrets/public-key`,
);
await sodium.ready;
for (const [name, value] of Object.entries({
  PUSH_ADMIN_TOKEN: secrets.PUSH_ADMIN_TOKEN,
  VAPID_PRIVATE_KEY: secrets.VAPID_PRIVATE_KEY,
})) {
  const encryptedValue = sodium.to_base64(
    sodium.crypto_box_seal(
      sodium.from_string(value),
      sodium.from_base64(
        publicKey.key,
        sodium.base64_variants.ORIGINAL,
      ),
    ),
    sodium.base64_variants.ORIGINAL,
  );
  await github(`/repos/${repository}/actions/secrets/${name}`, {
    method: "PUT",
    body: JSON.stringify({
      encrypted_value: encryptedValue,
      key_id: publicKey.key_id,
    }),
  });
}

console.log(
  "GitHub Actions variables and encrypted push secrets configured.",
);

async function upsertVariable(name: string, value: string) {
  const current = await githubResponse(
    `/repos/${repository}/actions/variables/${name}`,
  );
  if (current.status === 404) {
    await github(`/repos/${repository}/actions/variables`, {
      method: "POST",
      body: JSON.stringify({ name, value }),
    });
    return;
  }
  if (!current.ok) await throwGithubError(current);
  await github(`/repos/${repository}/actions/variables/${name}`, {
    method: "PATCH",
    body: JSON.stringify({ name, value }),
  });
}

async function github<T = unknown>(path: string, init?: RequestInit) {
  const response = await githubResponse(path, init);
  if (!response.ok) await throwGithubError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function githubResponse(path: string, init?: RequestInit) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2026-03-10",
      ...init?.headers,
    },
  });
}

async function throwGithubError(response: Response): Promise<never> {
  const message = (await response.text()).slice(0, 1000);
  throw new Error(`GitHub API ${response.status}: ${message}`);
}

/**
 * Web Push from a Cloudflare Worker: message encryption (RFC 8291, `aes128gcm`)
 * and VAPID authentication (RFC 8292), on WebCrypto alone.
 *
 * The bulk fan-out still runs in GitHub Actions with the `web-push` package —
 * that stays inside the Worker subrequest limits. What the Worker needs is the
 * ability to send *one* push on demand, so that "Zustellung testen" proves the
 * whole path (subscription stored, keys valid, push service reachable) instead
 * of only proving that the browser can display a notification locally.
 *
 * Verified against the worked example in RFC 8291 §5; see
 * `test/web-push.test.ts`.
 */

const RECORD_SIZE = 4_096;
const VAPID_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

export interface WebPushSubscription {
  endpoint: string;
  /** Receiver's P-256 public key, base64url, uncompressed (65 bytes). */
  p256dh: string;
  /** Receiver's authentication secret, base64url (16 bytes). */
  auth: string;
}

export interface VapidKeys {
  /** base64url, uncompressed P-256 point. */
  publicKey: string;
  /** base64url, 32-byte private scalar. */
  privateKey: string;
  /** `mailto:` or `https:` URL identifying the sender. */
  subject: string;
}

export function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

const encodeText = (value: string): Uint8Array =>
  new TextEncoder().encode(value);

/** Length-prefixed info label, per RFC 8291 §3.3. */
const infoLabel = (label: string): Uint8Array =>
  concatBytes(encodeText(label), Uint8Array.of(0));

async function hkdf(
  salt: Uint8Array,
  inputKeyMaterial: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    inputKeyMaterial as BufferSource,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Splits an uncompressed P-256 point into its base64url `x` and `y` halves. */
function splitPublicKey(publicKey: Uint8Array): { x: string; y: string } {
  return {
    x: base64UrlEncode(publicKey.subarray(1, 33)),
    y: base64UrlEncode(publicKey.subarray(33, 65)),
  };
}

async function importEcdhPrivateKey(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<CryptoKey> {
  const { x, y } = splitPublicKey(publicKey);
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d: base64UrlEncode(privateKey), ext: true },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
}

/**
 * Encrypts a payload for one subscription.
 *
 * `senderKeyPair` and `salt` are parameters only so the RFC's example vector
 * can be reproduced in a test; production always passes freshly generated ones.
 */
export async function encryptPushPayload(
  payload: string,
  subscription: Pick<WebPushSubscription, "p256dh" | "auth">,
  senderKeyPair?: { publicKey: Uint8Array; privateKey: Uint8Array },
  salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
): Promise<Uint8Array> {
  const receiverPublicKey = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);

  let senderPublicKey: Uint8Array;
  let senderPrivateKey: CryptoKey;
  if (senderKeyPair) {
    senderPublicKey = senderKeyPair.publicKey;
    senderPrivateKey = await importEcdhPrivateKey(
      senderKeyPair.privateKey,
      senderKeyPair.publicKey,
    );
  } else {
    const generated = (await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    )) as CryptoKeyPair;
    senderPublicKey = new Uint8Array(
      (await crypto.subtle.exportKey(
        "raw",
        generated.publicKey,
      )) as ArrayBuffer,
    );
    senderPrivateKey = generated.privateKey;
  }

  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiverPublicKey as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      // Cast through the parameter type rather than a named algorithm type:
      // Workers and DOM disagree on the name, and Workers' variant omits
      // `public`, which ECDH requires and the runtime does accept.
      { name: "ECDH", public: receiverKey } as unknown as Parameters<
        SubtleCrypto["deriveBits"]
      >[0],
      senderPrivateKey,
      256,
    ),
  );

  // RFC 8291 §3.3: the auth secret is the salt of the first extraction, and the
  // info binds the derived key to both parties' public keys.
  const pseudoRandomKey = await hkdf(
    authSecret,
    sharedSecret,
    concatBytes(
      infoLabel("WebPush: info"),
      receiverPublicKey,
      senderPublicKey,
    ),
    32,
  );
  const contentEncryptionKey = await hkdf(
    salt,
    pseudoRandomKey,
    infoLabel("Content-Encoding: aes128gcm"),
    16,
  );
  const nonce = await hkdf(
    salt,
    pseudoRandomKey,
    infoLabel("Content-Encoding: nonce"),
    12,
  );

  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  // A single record, so the padding delimiter is 0x02 ("last record").
  const plaintext = concatBytes(encodeText(payload), Uint8Array.of(2));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      plaintext as BufferSource,
    ),
  );

  // Header per RFC 8188 §2.1: salt | record size | key id length | key id.
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE);
  return concatBytes(
    salt,
    recordSize,
    Uint8Array.of(senderPublicKey.length),
    senderPublicKey,
    ciphertext,
  );
}

/** Signs the VAPID JWT that authenticates this sender to the push service. */
export async function createVapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  now: Date = new Date(),
): Promise<string> {
  const publicKey = base64UrlDecode(keys.publicKey);
  const { x, y } = splitPublicKey(publicKey);
  const signingKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x,
      y,
      d: base64UrlEncode(base64UrlDecode(keys.privateKey)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = base64UrlEncode(
    encodeText(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const claims = base64UrlEncode(
    encodeText(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp:
          Math.floor(now.getTime() / 1_000) + VAPID_TOKEN_LIFETIME_SECONDS,
        sub: keys.subject,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  // WebCrypto emits the raw r||s form that JWS requires; no DER unwrapping.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      encodeText(signingInput) as BufferSource,
    ),
  );
  return `vapid t=${signingInput}.${base64UrlEncode(signature)}, k=${keys.publicKey}`;
}

export interface SendWebPushResult {
  ok: boolean;
  status: number;
  /** True when the push service says this subscription is gone for good. */
  isExpired: boolean;
}

export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: string,
  keys: VapidKeys,
  options: { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high" } = {},
): Promise<SendWebPushResult> {
  const [body, authorization] = await Promise.all([
    encryptPushPayload(payload, subscription),
    createVapidAuthorization(subscription.endpoint, keys),
  ]);

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      authorization,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(options.ttlSeconds ?? 12 * 60 * 60),
      urgency: options.urgency ?? "normal",
    },
    body: body as BodyInit,
  });

  return {
    ok: response.ok,
    status: response.status,
    isExpired: response.status === 404 || response.status === 410,
  };
}

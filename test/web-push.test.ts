import { describe, expect, it } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  createVapidAuthorization,
  encryptPushPayload,
} from "../push-worker/src/web-push.ts";

/**
 * The worked example from RFC 8291 §5. Because the sender key pair and the salt
 * are pinned, the encryption is fully deterministic and must reproduce the
 * body byte for byte — which is what makes a hand-written implementation of the
 * key derivation safe to rely on.
 */
const RFC_8291_EXAMPLE = {
  plaintext: "When I grow up, I want to be a watermelon",
  receiverPublicKey:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  senderPublicKey:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  senderPrivateKey: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
} as const;

describe("encryptPushPayload", () => {
  it("reproduces the RFC 8291 example message byte for byte", async () => {
    const encrypted = await encryptPushPayload(
      RFC_8291_EXAMPLE.plaintext,
      {
        p256dh: RFC_8291_EXAMPLE.receiverPublicKey,
        auth: RFC_8291_EXAMPLE.authSecret,
      },
      {
        publicKey: base64UrlDecode(RFC_8291_EXAMPLE.senderPublicKey),
        privateKey: base64UrlDecode(RFC_8291_EXAMPLE.senderPrivateKey),
      },
      base64UrlDecode(RFC_8291_EXAMPLE.salt),
    );

    expect(base64UrlEncode(encrypted)).toBe(RFC_8291_EXAMPLE.body);
  });

  it("produces a different body every time when salt and key are generated", async () => {
    const subscription = {
      p256dh: RFC_8291_EXAMPLE.receiverPublicKey,
      auth: RFC_8291_EXAMPLE.authSecret,
    };
    const [first, second] = await Promise.all([
      encryptPushPayload("hello", subscription),
      encryptPushPayload("hello", subscription),
    ]);

    expect(base64UrlEncode(first)).not.toBe(base64UrlEncode(second));
    // Header: 16-byte salt + 4-byte record size + length byte + 65-byte key.
    expect(first.length).toBeGreaterThan(86);
    expect(first[20]).toBe(65);
  });
});

describe("createVapidAuthorization", () => {
  it("signs a JWT scoped to the push service's origin", async () => {
    const authorization = await createVapidAuthorization(
      "https://updates.push.services.mozilla.com/wpush/v2/abc123",
      {
        publicKey: RFC_8291_EXAMPLE.senderPublicKey,
        privateKey: RFC_8291_EXAMPLE.senderPrivateKey,
        subject: "mailto:push@example.org",
      },
      new Date("2026-08-01T10:00:00Z"),
    );

    const [, token] = /^vapid t=([^,]+), k=(.+)$/.exec(authorization) ?? [];
    const [header, claims, signature] = token!.split(".");
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(header!)))).toEqual({
      typ: "JWT",
      alg: "ES256",
    });
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(claims!)))).toEqual({
      aud: "https://updates.push.services.mozilla.com",
      exp: Math.floor(Date.parse("2026-08-01T10:00:00Z") / 1_000) + 12 * 60 * 60,
      sub: "mailto:push@example.org",
    });
    // ES256 signatures are the raw r||s pair, i.e. exactly 64 bytes.
    expect(base64UrlDecode(signature!).length).toBe(64);
    expect(authorization.endsWith(RFC_8291_EXAMPLE.senderPublicKey)).toBe(true);
  });
});

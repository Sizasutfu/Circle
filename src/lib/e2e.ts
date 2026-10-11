// src/lib/e2e.ts
//
// Mobile E2E encryption — drop-in replacement for the web version.
// Wire format is identical: encrypted bodies look like
//   e2e:v{peerVersion}:{myVersion}:{base64(iv || ciphertext || tag)}
// and public keys are SPKI base64, private keys are PKCS8 base64,
// matching Web Crypto's export format exactly.

import { getRandomBytes } from './crypto-shim'; // MUST be first — sets up globalThis.crypto
import { p256 } from '@noble/curves/nist.js';
import { gcm } from '@noble/ciphers/aes.js';
import * as SecureStore from 'expo-secure-store';
import api from '../api/client';

const STORE_KEY = 'circle_e2e_keypair';
const KEY_VERSION_KEY = 'circle_e2e_key_version';
const SHARED_KEY_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory caches
let _myKeyPair: { priv: Uint8Array; pub: Uint8Array; version: number } | null = null;
const _sharedKeys: Record<
  string,
  { key: Uint8Array; peerVersion: number; myVersion: number; timestamp: number }
> = {};

// ── Random private key generator ──
// @noble/curves v2 renamed `randomPrivateKey` to `randomSecretKey` but
// kept the old name as an alias in most releases. Fall back to whichever
// is present so we work across minor versions.
function randomPrivateKey(): Uint8Array {
  const utils: any = p256.utils;
  if (typeof utils.randomSecretKey === 'function') return utils.randomSecretKey();
  if (typeof utils.randomPrivateKey === 'function') return utils.randomPrivateKey();
  throw new Error('[e2e] No random-key generator found in @noble/curves');
}

// ── Base64 (no external dep) ─────────────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const l = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) l[B64.charCodeAt(i)] = i;
  return l;
})();

function b64encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 0x3f];
  }
  return out;
}

function b64decode(str: string): Uint8Array {
  const clean = str.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let o = 0;
  let i = 0;
  while (i < clean.length) {
    const c1 = B64_LOOKUP[clean.charCodeAt(i++)];
    const c2 = B64_LOOKUP[clean.charCodeAt(i++)];
    const c3 = i < clean.length ? B64_LOOKUP[clean.charCodeAt(i++)] : -1;
    const c4 = i < clean.length ? B64_LOOKUP[clean.charCodeAt(i++)] : -1;
    if (c1 < 0 || c2 < 0) break;
    out[o++] = (c1 << 2) | (c2 >> 4);
    if (c3 >= 0) out[o++] = ((c2 & 0x0f) << 4) | (c3 >> 2);
    if (c4 >= 0) out[o++] = ((c3 & 0x03) << 6) | c4;
  }
  return out.slice(0, o);
}

// ── DER encode/decode for P-256 SPKI + PKCS8 ─────────────────
const SPKI_PREFIX = new Uint8Array([
  0x30, 0x59,
  0x30, 0x13,
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
  0x03, 0x42, 0x00,
]);

const PKCS8_PREFIX = new Uint8Array([
  0x30, 0x81, 0x87,
  0x02, 0x01, 0x00,
  0x30, 0x13,
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
  0x04, 0x6d,
  0x30, 0x6b,
  0x02, 0x01, 0x01,
  0x04, 0x20,
]);

const PKCS8_MIDDLE = new Uint8Array([0xa1, 0x44, 0x03, 0x42, 0x00]);

function encodeSpki(uncompressedPoint: Uint8Array): Uint8Array {
  if (uncompressedPoint.length !== 65 || uncompressedPoint[0] !== 0x04) {
    throw new Error('Invalid uncompressed P-256 point');
  }
  const out = new Uint8Array(SPKI_PREFIX.length + 65);
  out.set(SPKI_PREFIX, 0);
  out.set(uncompressedPoint, SPKI_PREFIX.length);
  return out;
}

function decodeSpki(spki: Uint8Array): Uint8Array {
  if (spki.length === 91) return spki.slice(26);
  for (let i = 0; i <= spki.length - 65; i++) {
    if (spki[i] === 0x04) return spki.slice(i, i + 65);
  }
  throw new Error('Invalid SPKI');
}

function encodePkcs8(privateScalar: Uint8Array, publicPoint: Uint8Array): Uint8Array {
  if (privateScalar.length !== 32) throw new Error('Invalid private scalar');
  if (publicPoint.length !== 65 || publicPoint[0] !== 0x04) {
    throw new Error('Invalid public point');
  }
  const out = new Uint8Array(138);
  out.set(PKCS8_PREFIX, 0);
  out.set(privateScalar, PKCS8_PREFIX.length);
  out.set(PKCS8_MIDDLE, PKCS8_PREFIX.length + 32);
  out.set(publicPoint, PKCS8_PREFIX.length + 32 + PKCS8_MIDDLE.length);
  return out;
}

function decodePkcs8(pkcs8: Uint8Array): { priv: Uint8Array; pub: Uint8Array } {
  if (pkcs8.length === 138 && pkcs8[1] === 0x81 && pkcs8[2] === 0x87) {
    return {
      priv: pkcs8.slice(36, 68),
      pub: pkcs8.slice(73, 138),
    };
  }
  for (let i = 0; i < pkcs8.length - 34; i++) {
    if (pkcs8[i] === 0x04 && pkcs8[i + 1] === 0x20) {
      const priv = pkcs8.slice(i + 2, i + 34);
      for (let j = i + 34; j < pkcs8.length - 68; j++) {
        if (pkcs8[j] === 0x03 && pkcs8[j + 1] === 0x42 && pkcs8[j + 2] === 0x00) {
          const pub = pkcs8.slice(j + 3, j + 68);
          if (pub[0] === 0x04) return { priv, pub };
        }
      }
    }
  }
  throw new Error('Invalid PKCS8');
}

// ── SecureStore helpers ──────────────────────────────────────
async function loadStoredKeyPair() {
  try {
    const stored = await SecureStore.getItemAsync(STORE_KEY);
    const storedVersion = await SecureStore.getItemAsync(KEY_VERSION_KEY);
    if (!stored || !storedVersion) return null;
    const { pub, priv } = JSON.parse(stored);
    return {
      priv: b64decode(priv),
      pub: b64decode(pub),
      version: parseInt(storedVersion, 10) || 1,
    };
  } catch {
    return null;
  }
}

async function saveKeyPair(priv: Uint8Array, pub: Uint8Array, version: number) {
  await SecureStore.setItemAsync(
    STORE_KEY,
    JSON.stringify({ pub: b64encode(pub), priv: b64encode(priv) })
  );
  await SecureStore.setItemAsync(KEY_VERSION_KEY, String(version));
}

// ── Public API ───────────────────────────────────────────────

export async function ensureMyKeys() {
  if (_myKeyPair) return _myKeyPair;

  const stored = await loadStoredKeyPair();
  if (stored) {
    _myKeyPair = stored;
    return _myKeyPair;
  }

  const priv = randomPrivateKey();
  const pub = p256.getPublicKey(priv, false);
  const version = 1;
  await saveKeyPair(priv, pub, version);
  _myKeyPair = { priv, pub, version };
  return _myKeyPair;
}

export async function publishMyPublicKey(userId: string | number) {
  try {
    const kp = await ensureMyKeys();
    const spki = encodeSpki(kp.pub);
    await api.put('/dm/e2e/public-key', {
      publicKey: b64encode(spki),
      keyVersion: kp.version,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.warn('[e2e] Failed to publish public key:', err);
  }
}

async function fetchPeerKey(
  userId: string | number,
  version?: number
): Promise<{ pub: Uint8Array; version: number } | null> {
  try {
    const url = version
      ? `/users/${userId}/publickey?version=${version}`
      : `/users/${userId}/publickey`;
    const res = await api.get(url);
    const body = res.data?.data ?? res.data ?? {};
    const b64 = body.publicKey || body.public_key;
    const v = body.keyVersion || body.key_version || 1;
    if (!b64) return null;
    return { pub: decodeSpki(b64decode(b64)), version: v };
  } catch {
    return null;
  }
}

async function getSharedKey(
  peerUserId: string | number,
  forceRefresh = false
): Promise<{ key: Uint8Array; peerVersion: number; myVersion: number; timestamp: number } | null> {
  const cacheKey = String(peerUserId);
  const cached = _sharedKeys[cacheKey];
  const now = Date.now();

  if (!forceRefresh && cached && now - cached.timestamp < SHARED_KEY_TTL_MS) {
    return cached;
  }

  const myKp = await ensureMyKeys();
  const peerKey = await fetchPeerKey(peerUserId);
  if (!peerKey) return null;

  if (cached && cached.peerVersion !== peerKey.version) {
    delete _sharedKeys[cacheKey];
  }

  const sharedPoint = p256.getSharedSecret(myKp.priv, peerKey.pub);
  const aesKey = sharedPoint.slice(1, 33);

  const entry = {
    key: aesKey,
    peerVersion: peerKey.version,
    myVersion: myKp.version,
    timestamp: now,
  };
  _sharedKeys[cacheKey] = entry;
  return entry;
}

export async function encrypt(
  peerUserId: string | number,
  plaintext: string
): Promise<string> {
  const shared = await getSharedKey(peerUserId);
  if (!shared) return plaintext;

  const iv = getRandomBytes(12);
  const encoder = new TextEncoder();
  const ct = gcm(shared.key, iv).encrypt(encoder.encode(plaintext));

  const blob = new Uint8Array(12 + ct.length);
  blob.set(iv, 0);
  blob.set(ct, 12);

  return `e2e:v${shared.peerVersion}:${shared.myVersion}:${b64encode(blob)}`;
}

export async function decrypt(
  peerUserId: string | number,
  body: string
): Promise<string> {
  if (!body || !body.startsWith('e2e:')) return body;

  try {
    const parts = body.slice(4).split(':');
    let versionInfo: { peerVersion: number; myVersion: number } | null = null;
    let encryptedB64 = body.slice(4);

    if (parts.length >= 3 && parts[0].startsWith('v')) {
      versionInfo = {
        peerVersion: parseInt(parts[0].slice(1), 10),
        myVersion: parseInt(parts[1], 10),
      };
      encryptedB64 = parts.slice(2).join(':');
    }

    let shared = await getSharedKey(peerUserId);

    if (versionInfo && shared && shared.peerVersion !== versionInfo.peerVersion) {
      const specific = await fetchPeerKey(peerUserId, versionInfo.peerVersion);
      if (specific) {
        const myKp = await ensureMyKeys();
        const sharedPoint = p256.getSharedSecret(myKp.priv, specific.pub);
        shared = {
          key: sharedPoint.slice(1, 33),
          peerVersion: versionInfo.peerVersion,
          myVersion: myKp.version,
          timestamp: Date.now(),
        };
      } else {
        shared = await getSharedKey(peerUserId, true);
      }
    }

    if (!shared) return '[🔒 Encrypted — open conversation to decrypt]';

    const blob = b64decode(encryptedB64);
    const iv = blob.slice(0, 12);
    const ct = blob.slice(12);

    const pt = gcm(shared.key, iv).decrypt(ct);
    return new TextDecoder().decode(pt);
  } catch (err) {
    console.warn('[e2e] Decryption failed:', err);
    return '[🔒 Encrypted message]';
  }
}

export async function rotateMyKeys(userId: string | number) {
  _myKeyPair = null;
  Object.keys(_sharedKeys).forEach((k) => delete _sharedKeys[k]);
  await SecureStore.deleteItemAsync(STORE_KEY);

  const oldVersion =
    parseInt((await SecureStore.getItemAsync(KEY_VERSION_KEY)) || '0', 10) || 0;

  const priv = randomPrivateKey();
  const pub = p256.getPublicKey(priv, false);
  const version = oldVersion + 1;

  await saveKeyPair(priv, pub, version);
  _myKeyPair = { priv, pub, version };
  await publishMyPublicKey(userId);
  return _myKeyPair;
}

export function clearCache() {
  Object.keys(_sharedKeys).forEach((k) => delete _sharedKeys[k]);
}

export async function isEnabled(peerUserId: string | number): Promise<boolean> {
  const shared = await getSharedKey(peerUserId);
  return !!shared;
}

export async function getMyPublicKey(): Promise<string> {
  const kp = await ensureMyKeys();
  return b64encode(encodeSpki(kp.pub));
}
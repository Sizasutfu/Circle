// src/lib/crypto-shim.ts
//
// React Native doesn't ship crypto.getRandomValues. @noble/* captures a
// reference to it at module-load time, so this shim MUST run first.
//
// Randomness sources, in order of preference:
//   1. expo-crypto (fastest) — only if it's compiled into the current build
//   2. expo-modules-core uuid() — always available, secure on both platforms
//      (iOS: NSUUID → SecRandomCopyBytes; Android: UUID → SecureRandom)
//   3. Math.random — last resort, insecure, only used if 1 & 2 are absent
//
// Only the first source requires a native rebuild — the shim will fall
// through cleanly if expo-crypto isn't in the build yet.

let ExpoCrypto: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ExpoCrypto = require('expo-crypto');
} catch {
  // expo-crypto not compiled in this build — fall through
}

let _uuidFn: (() => string) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-modules-core');
  if (typeof mod.uuid === 'function') _uuidFn = mod.uuid;
} catch {}

export function getRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);

  // ── Preferred: expo-crypto ──
  if (ExpoCrypto?.getRandomValues) {
    ExpoCrypto.getRandomValues(out);
    return out;
  }

  // ── Fallback: expo-modules-core uuid() — 16 secure bytes per call ──
  if (_uuidFn) {
    let pos = 0;
    while (pos < length) {
      const hex = _uuidFn().replace(/-/g, ''); // 32 hex chars = 16 bytes
      for (let i = 0; i < 32 && pos < length; i += 2) {
        out[pos++] = parseInt(hex.substr(i, 2), 16);
      }
    }
    return out;
  }

  // ── Last resort: Math.random — not cryptographically secure ──
  console.warn(
    '[crypto-shim] No secure RNG available. Install expo-crypto before shipping E2E.'
  );
  for (let i = 0; i < length; i++) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

// Attach to globalThis so @noble/curves and @noble/ciphers find it at
// module-load time.
const g = globalThis as any;
if (typeof g.crypto === 'undefined') g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = (arr: any) => {
    const bytes = getRandomBytes(arr.length);
    for (let i = 0; i < arr.length; i++) arr[i] = bytes[i];
    return arr;
  };
}

export {};
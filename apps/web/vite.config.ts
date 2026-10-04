import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Round 20 (LAN phone testing): a phone connecting over plain HTTP is not a
// "secure context" per the Web platform spec — crypto.randomUUID,
// navigator.clipboard, camera access, and (separately, server-side) this
// app's Secure-flagged refresh-token cookie all silently misbehave or
// refuse to work without HTTPS. mkcert (see docs/OPEN_ITEMS.md's round-20
// entry) generates a certificate trusted by this machine's own root store;
// installing that same root CA on a phone (one-time) makes the phone trust
// it too. Optional: only kicks in when ../.certs/dev-*.pem exist (created
// by `mkcert -cert-file .certs/dev-cert.pem -key-file .certs/dev-key.pem
// localhost 127.0.0.1 ::1 <lan-ip>` from the repo root), so a plain
// `pnpm dev` with no certs generated still works over HTTP as before.
const certPath = resolve(__dirname, '../../.certs/dev-cert.pem');
const keyPath = resolve(__dirname, '../../.certs/dev-key.pem');
const https =
  existsSync(certPath) && existsSync(keyPath)
    ? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
    : undefined;

// Phone testing through a public HTTPS tunnel (`pnpm dev:phone`, README
// "Testing on a real phone"). The tunnel terminates HTTPS and forwards plain
// HTTP to this dev server, so: no local mkcert HTTPS here, the tunnel's
// hostname must be allowed, and the browser reaches the API through THIS
// origin (/api → the API), which keeps the strict, Secure refresh cookie
// first-party and needs no CORS entry for a random tunnel hostname.
const phoneTunnel = process.env.PHONE_TUNNEL === '1';
const apiProxyTarget =
  process.env.API_PROXY_TARGET ??
  `${existsSync(resolve(__dirname, '../../.certs/dev-cert.pem')) ? 'https' : 'http'}://localhost:3000`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The shared package is CommonJS (the API requires it); the browser gets
    // its TypeScript source instead, so its few runtime values — today the
    // plate normalizer — work in dev and in the production bundle. Types
    // still resolve through the package's built declarations.
    alias: [
      {
        find: /^@fuel-tracking\/shared-types$/,
        replacement: resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      },
    ],
  },
  server: {
    port: 5173,
    // Binds to 0.0.0.0 (not just 127.0.0.1) so a phone on the same LAN can
    // reach this dev server via the PC's LAN IP — see README/CLAUDE.md for
    // the accompanying VITE_API_BASE_URL/CORS_ORIGINS LAN-testing notes.
    host: true,
    https: phoneTunnel ? undefined : https,
    ...(phoneTunnel && {
      // Cloudflare quick tunnels are served from random *.trycloudflare.com names.
      allowedHosts: ['.trycloudflare.com'],
      proxy: { '/api': { target: apiProxyTarget, changeOrigin: true, secure: false } },
    }),
  },
});

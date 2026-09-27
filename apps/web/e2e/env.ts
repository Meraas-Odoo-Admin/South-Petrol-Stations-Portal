import { existsSync } from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// The API and web dev servers switch to HTTPS on their own whenever the
// mkcert certs exist at the repo root's .certs/ (round 20, LAN phone
// testing — see apps/api/src/main.ts and vite.config.ts). This suite follows
// the same switch instead of hardcoding http://, which stopped matching the
// servers the moment those certs were generated.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certsPresent = existsSync(path.resolve(__dirname, '../../../.certs/dev-cert.pem'));
const protocol = certsPresent ? 'https' : 'http';

export const WEB_BASE = `${protocol}://localhost:5173`;
export const API_ORIGIN = `${protocol}://localhost:3000`;
export const API_BASE = `${API_ORIGIN}/api/v1`;

// Fixture-provisioning HTTP client. The dev cert is signed by a local mkcert
// CA that Node doesn't trust by default — acceptable for localhost-only test
// setup, never used by the app itself.
export const api = axios.create({
  baseURL: API_BASE,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});

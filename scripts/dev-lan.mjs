#!/usr/bin/env node
// `pnpm dev:lan` — the app on this PC's LAN address over plain HTTP, for a
// quick check from a phone or another PC on the same network:
//   http://<this PC's LAN IP>:5173
//
// The browser talks only to the web dev server (relative /api/v1, forwarded to
// the API), so there is no CORS entry to keep in step with the PC's IP and no
// certificate that has to name it. It is the same mode `pnpm dev:phone` uses
// behind its tunnel, without the tunnel.
//
// Limits of plain HTTP: the camera (QR scan) needs HTTPS, and the refresh
// cookie is Secure, so a full page reload signs you out. For those use
// `pnpm dev:phone` (HTTPS through a tunnel).
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { killTreeCommand, portInUse, resolveBin } from './dev-phone-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, PHONE_TUNNEL: '1', VITE_API_BASE_URL: '/api/v1' };

for (const [name, port] of [['API', 3000], ['web', 5173]]) {
  if (await portInUse(port)) {
    console.error(`Port ${port} (${name}) is already in use. Close that server first (netstat -ano | findstr :${port}, then taskkill /PID <pid> /T /F).`);
    process.exit(1);
  }
}

const refresh = spawnSync(process.execPath, [path.join(root, 'scripts', 'refresh.mjs')], { cwd: root, env, stdio: 'inherit' });
if (refresh.status !== 0) process.exit(refresh.status ?? 1);

const children = [];
function run(name, args, cwd) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  for (const [stream, out] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    let buffered = '';
    stream.on('data', (chunk) => {
      const lines = (buffered + chunk.toString()).split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) out.write(`[${name}] ${line}\n`);
    });
  }
  child.on('exit', (code) => {
    console.error(`[${name}] exited (${code}) - stopping everything.`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    const how = killTreeCommand(process.platform, child.pid);
    try {
      if (how.type === 'spawn') spawnSync(how.command, how.args, { stdio: 'ignore' });
      else process.kill(how.pid, how.signal);
    } catch {
      child.kill();
    }
  }
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(signal, () => shutdown(0));

const apiDir = path.join(root, 'apps', 'api');
const webDir = path.join(root, 'apps', 'web');
run('api', [resolveBin(apiDir, '@nestjs/cli', 'nest'), 'start', '--watch'], apiDir);
run('web', [resolveBin(webDir, 'vite'), '--strictPort'], webDir);
console.log('\n  Open:  http://<this PC\'s LAN IP>:5173/login   (e.g. http://10.18.4.80:5173/login)\n');

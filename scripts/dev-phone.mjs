#!/usr/bin/env node
// `pnpm dev:phone` — open the app on a real phone over HTTPS (camera / QR
// scanner need a secure context) through a Cloudflare quick tunnel.
//
// Starts the API, the web dev server in tunnel mode (PHONE_TUNNEL=1: relative
// API calls proxied to the API, tunnel hostname allowed, plain HTTP behind the
// tunnel) and `cloudflared`, then prints the public URL.
//
// THE LINK IS PUBLIC while this runs. Stop it (Ctrl+C) when you are done: that
// stops every process it started, on Windows too.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCloudflared, killTreeCommand, portInUse, resolveBin } from './dev-phone-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_PORT = 5173;

// On Windows winget installs cloudflared without adding it to PATH, so its
// install folder is checked too.
const cloudflared = findCloudflared({
  platform: process.platform,
  env: process.env,
  runs: (command) => !spawnSync(command, ['--version'], { stdio: 'ignore' }).error,
  exists: existsSync,
});
if (!cloudflared) {
  console.error(
    'cloudflared is not installed or not on PATH (on Windows, open a new terminal after installing it).\n' +
      'Install it: winget install --id Cloudflare.cloudflared   (macOS: brew install cloudflared)\n' +
      'or https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
  );
  process.exit(1);
}

// A server left over from an earlier run would be reused silently (or the new
// one would hide behind it), so stop and say which port.
for (const [name, port] of [['API', 3000], ['web', WEB_PORT]]) {
  if (await portInUse(port)) {
    console.error(
      `Port ${port} (${name}) is already in use, probably a server left over from an earlier run.\n` +
        'Close it first. Windows: `netstat -ano | findstr :' + port + '` then `taskkill /PID <pid> /T /F`.\n' +
        'macOS/Linux: `lsof -i :' + port + '` then `kill <pid>`.',
    );
    process.exit(1);
  }
}

const env = {
  ...process.env,
  PHONE_TUNNEL: '1',
  // Same-origin: the web app calls /api/v1/..., Vite forwards it to the API.
  VITE_API_BASE_URL: '/api/v1',
};

const children = [];
function run(name, command, args, { cwd = root, onLine } = {}) {
  // No shell: `command` is a real executable (node, cloudflared.exe), never a
  // .cmd shim, and args are passed as-is.
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32', // own process group, so it can be killed as a tree
    windowsHide: true,
  });
  const forward = (stream, out) => {
    let buffered = '';
    stream.on('data', (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        out.write(`[${name}] ${line}\n`);
        onLine?.(line);
      }
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on('error', (error) => {
    console.error(`[${name}] could not start: ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code) => {
    if (stopping) return;
    console.error(`[${name}] exited (${code ?? 'signal'}) — stopping everything.`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

function killTree(child) {
  if (child.pid === undefined || child.exitCode !== null) return;
  const how = killTreeCommand(process.platform, child.pid);
  try {
    if (how.type === 'spawn') spawnSync(how.command, how.args, { stdio: 'ignore' });
    else process.kill(how.pid, how.signal);
  } catch {
    child.kill();
  }
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) killTree(child);
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(signal, () => shutdown(0));
// Last resort, e.g. an uncaught error: never leave a server running.
process.on('exit', () => {
  for (const child of children) killTree(child);
});

try {
  const apiDir = path.join(root, 'apps', 'api');
  const webDir = path.join(root, 'apps', 'web');
  run('api', process.execPath, [resolveBin(apiDir, '@nestjs/cli', 'nest'), 'start', '--watch'], { cwd: apiDir });
  // --strictPort: if 5173 is taken (a leftover server), fail instead of
  // quietly moving to another port the tunnel does not point at.
  run('web', process.execPath, [resolveBin(webDir, 'vite'), '--strictPort'], { cwd: webDir });
} catch (error) {
  console.error(`Could not find the app's dev tools (${error.message}). Run \`pnpm install\` first.`);
  shutdown(1);
}

let announced = false;
run('tunnel', cloudflared, ['tunnel', '--url', `http://localhost:${WEB_PORT}`], {
  onLine: (line) => {
    const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !announced) {
      announced = true;
      console.log(
        `\n  Open on your phone:  ${match[0]}\n\n` +
          '  WARNING: this link is PUBLIC while it runs — anyone who has it can reach your dev\n' +
          '  server. Press Ctrl+C to close the tunnel as soon as you finish testing.\n',
      );
    }
  },
});

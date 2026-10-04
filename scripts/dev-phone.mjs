#!/usr/bin/env node
// `pnpm dev:phone` — open the app on a real phone over HTTPS (camera / QR
// scanner need a secure context) through a Cloudflare quick tunnel.
//
// Starts the API, the web dev server in tunnel mode (PHONE_TUNNEL=1: relative
// API calls proxied to the API, tunnel hostname allowed, plain HTTP behind the
// tunnel) and `cloudflared`, then prints the public URL.
//
// THE LINK IS PUBLIC while this runs. Stop it (Ctrl+C) when you are done.
import { spawn, spawnSync } from 'node:child_process';

const WEB_PORT = 5173;

if (spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).error) {
  console.error(
    'cloudflared is not installed or not on PATH.\n' +
      'Install it (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/),\n' +
      'e.g. `brew install cloudflared`, then run `pnpm dev:phone` again.',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  PHONE_TUNNEL: '1',
  // Same-origin: the web app calls /api/v1/..., Vite forwards it to the API.
  VITE_API_BASE_URL: '/api/v1',
};

const children = [];
function run(name, cmd, args, onLine) {
  const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
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
  child.on('exit', (code) => {
    console.error(`[${name}] exited (${code ?? 'signal'}) — stopping everything.`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('api', 'pnpm', ['--filter', '@fuel-tracking/api', 'run', 'dev']);
run('web', 'pnpm', ['--filter', '@fuel-tracking/web', 'run', 'dev']);

let announced = false;
run('tunnel', 'cloudflared', ['tunnel', '--url', `http://localhost:${WEB_PORT}`], (line) => {
  const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !announced) {
    announced = true;
    console.log(
      `\n  Open on your phone:  ${match[0]}\n\n` +
        '  WARNING: this link is PUBLIC while it runs — anyone who has it can reach your dev\n' +
        '  server. Press Ctrl+C to close the tunnel as soon as you finish testing.\n',
    );
  }
});

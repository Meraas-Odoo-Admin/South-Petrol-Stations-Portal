// Helpers for dev-phone.mjs, kept free of side effects so they can be tested.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';

// Absolute path of a package's command-line entry (its "bin" script), as
// resolved from `appDir`. Running it with `node <path>` needs no shell and no
// pnpm: on Windows `pnpm` and `.bin/*` are .cmd shims, which Node refuses to
// spawn without `shell: true` (ENOENT / EINVAL), and a shell would need every
// argument escaped.
export function resolveBin(appDir, packageName, binName = packageName) {
  const require = createRequire(path.join(appDir, 'package.json'));
  const manifestPath = require.resolve(`${packageName}/package.json`);
  const { bin } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const relative = typeof bin === 'string' ? bin : bin?.[binName];
  if (!relative) throw new Error(`${packageName} has no "${binName}" command`);
  return path.join(path.dirname(manifestPath), relative);
}

// How to stop a child process AND everything it started (nest start spawns
// the server as a child of its own). Plain child.kill() on Windows ends only
// the one process, which is how servers were left running after Ctrl+C.
export function killTreeCommand(platform, pid) {
  if (platform === 'win32') {
    return { type: 'spawn', command: 'taskkill', args: ['/pid', String(pid), '/T', '/F'] };
  }
  // POSIX children are started detached, so each leads its own process group.
  return { type: 'signal', pid: -pid, signal: 'SIGTERM' };
}

// True when something already accepts connections on localhost:`port` (a
// server left over from an earlier run). Checks both IPv4 and IPv6 loopback.
export function portInUse(port) {
  const tryHost = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ port, host });
      socket.setTimeout(1000);
      socket.once('connect', () => (socket.destroy(), resolve(true)));
      socket.once('timeout', () => (socket.destroy(), resolve(false)));
      socket.once('error', () => resolve(false));
    });
  return Promise.all([tryHost('127.0.0.1'), tryHost('::1')]).then((results) => results.some(Boolean));
}

// Where winget puts cloudflared on Windows: it installs under Program Files
// but does not add the folder to PATH, so a fresh install is invisible to
// `cloudflared` until the PATH is fixed by hand.
export function windowsCloudflaredPaths(env) {
  const folders = [env['ProgramFiles(x86)'], env.ProgramFiles, env.ProgramW6432].filter(Boolean);
  return [...new Set(folders)].map((folder) => path.join(folder, 'cloudflared', 'cloudflared.exe'));
}

// The command that starts cloudflared, or null when it is not installed.
// PATH first; on Windows, then the folders winget installs into. `runs` and
// `exists` are injected so this can be tested without cloudflared installed.
export function findCloudflared({ platform, env, runs, exists }) {
  if (runs('cloudflared')) return 'cloudflared';
  if (platform !== 'win32') return null;
  return windowsCloudflaredPaths(env).find((candidate) => exists(candidate)) ?? null;
}

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { findCloudflared, killTreeCommand, portInUse, resolveBin, windowsCloudflaredPaths } from './dev-phone-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the dev tools are started as `node <script>`: real files, never .cmd shims', () => {
  const nest = resolveBin(path.join(root, 'apps', 'api'), '@nestjs/cli', 'nest');
  const vite = resolveBin(path.join(root, 'apps', 'web'), 'vite');
  for (const bin of [nest, vite]) {
    assert.ok(path.isAbsolute(bin));
    assert.ok(existsSync(bin), `${bin} exists`);
    assert.match(bin, /\.(c|m)?js$/);
  }
});

test('an unknown command name fails with a clear message', () => {
  assert.throws(() => resolveBin(path.join(root, 'apps', 'web'), 'vite', 'nope'), /no "nope" command/);
});

test('Windows stops the whole process tree with taskkill, no shell', () => {
  assert.deepEqual(killTreeCommand('win32', 4321), {
    type: 'spawn',
    command: 'taskkill',
    args: ['/pid', '4321', '/T', '/F'],
  });
});

test('POSIX signals the child process group', () => {
  assert.deepEqual(killTreeCommand('linux', 4321), { type: 'signal', pid: -4321, signal: 'SIGTERM' });
  assert.deepEqual(killTreeCommand('darwin', 7), { type: 'signal', pid: -7, signal: 'SIGTERM' });
});

test('portInUse sees a listening server and a free port', async () => {
  const server = net.createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  assert.equal(await portInUse(port), true);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await portInUse(port), false);
});

test('cloudflared on PATH is used as is, on every platform', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    const found = findCloudflared({ platform, env: {}, runs: () => true, exists: () => false });
    assert.equal(found, 'cloudflared');
  }
});

test('on Windows, falls back to the folder winget installs into when PATH misses it', () => {
  const env = { 'ProgramFiles(x86)': 'C:\Program Files (x86)', ProgramFiles: 'C:\Program Files' };
  const wanted = path.join('C:\Program Files (x86)', 'cloudflared', 'cloudflared.exe');
  const found = findCloudflared({ platform: 'win32', env, runs: () => false, exists: (p) => p === wanted });
  assert.equal(found, wanted);
});

test('on Windows with cloudflared nowhere, nothing is found', () => {
  const env = { ProgramFiles: 'C:\Program Files' };
  assert.equal(findCloudflared({ platform: 'win32', env, runs: () => false, exists: () => false }), null);
});

test('off Windows, a missing cloudflared is not searched for in Program Files', () => {
  const env = { ProgramFiles: 'C:\Program Files' };
  assert.equal(findCloudflared({ platform: 'linux', env, runs: () => false, exists: () => true }), null);
});

test('the Windows search list skips unset variables and repeats nothing', () => {
  const env = { ProgramFiles: 'C:\PF', ProgramW6432: 'C:\PF' };
  assert.equal(windowsCloudflaredPaths(env).length, 1);
  assert.deepEqual(windowsCloudflaredPaths({}), []);
});

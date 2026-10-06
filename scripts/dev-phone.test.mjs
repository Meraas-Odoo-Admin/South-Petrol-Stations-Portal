import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { killTreeCommand, portInUse, resolveBin } from './dev-phone-lib.mjs';

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

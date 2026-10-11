#!/usr/bin/env node
// `pnpm refresh` — bring generated code up to date after a pull.
//
//   1. rebuilds the shared packages (packages/shared-types/dist), which the
//      API, the seed and the scripts load at runtime;
//   2. regenerates the Prisma client, but only when schema.prisma changed
//      since the last time (see refresh-lib.mjs for why).
//
// `pnpm dev`, `pnpm dev:phone` and the seed run it first, so nothing breaks
// quietly after a pull. Safe to run any time.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLockedFileError, prismaGenerateNeeded } from './refresh-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(root, 'apps', 'api', 'prisma', 'schema.prisma');
const stampPath = path.join(root, 'node_modules', '.cache', 'fuel-refresh', 'prisma-schema.sha256');

// pnpm is a .cmd shim on Windows, which Node only starts through a shell.
const pnpm = (args, options = {}) =>
  spawnSync('pnpm', args, { cwd: root, shell: process.platform === 'win32', encoding: 'utf8', ...options });

console.log('[refresh] building shared packages…');
const build = pnpm(['--filter', '@fuel-tracking/shared-types', 'run', 'build'], { stdio: 'inherit' });
if (build.status !== 0) {
  console.error('[refresh] building shared-types failed.');
  process.exit(build.status ?? 1);
}

const { needed, fingerprint } = prismaGenerateNeeded({
  schemaText: readFileSync(schemaPath, 'utf8'),
  stampText: existsSync(stampPath) ? readFileSync(stampPath, 'utf8') : null,
});
if (!needed) {
  console.log('[refresh] Prisma client already matches schema.prisma.');
  process.exit(0);
}

console.log('[refresh] regenerating the Prisma client…');
const generate = pnpm(['--filter', '@fuel-tracking/api', 'run', 'prisma:generate']);
const output = `${generate.stdout ?? ''}${generate.stderr ?? ''}`;
if (generate.status !== 0) {
  process.stderr.write(output);
  if (isLockedFileError(output)) {
    console.error(
      '\n[refresh] The Prisma engine file is locked, usually by a running API.\n' +
        'Stop the API (and `pnpm dev` / `pnpm dev:phone`), then run `pnpm refresh` again.',
    );
  }
  process.exit(generate.status ?? 1);
}
mkdirSync(path.dirname(stampPath), { recursive: true });
writeFileSync(stampPath, fingerprint);
console.log('[refresh] done.');

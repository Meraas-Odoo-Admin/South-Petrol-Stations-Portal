import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Phase 5C: the client's real stations - supervisors' and operators' names and
// phone numbers - live only in data/private/ (git-ignored) and in the
// database, never in a tracked file. This keeps it that way.
const repoRoot = path.resolve(__dirname, '../../../..');

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

const TEXT_FILE = /\.(ts|tsx|js|mjs|json|md|sql|prisma|yml|yaml|csv|txt|html|css)$/;

function read(rel: string): string | null {
  try {
    return readFileSync(path.join(repoRoot, rel), 'utf8');
  } catch {
    return null;
  }
}

describe('no real personal data in tracked files', () => {
  const tracked = trackedFiles();
  const files = tracked.filter((f) => TEXT_FILE.test(f) && !f.endsWith('pnpm-lock.yaml'));

  it('the private data folder is git-ignored and nothing in it is tracked', () => {
    expect(tracked.filter((f) => f.startsWith('data/private/'))).toEqual([]);
    expect(read('.gitignore') ?? '').toMatch(/^data\/private\/\s*$/m);
  });

  it('the seed carries no Libyan mobile number and no station roster', () => {
    const seed = read('apps/api/prisma/seed.ts')!;
    // 09[1-6] followed by 7 digits in one token (the synthetic fixtures use dashes).
    expect(seed).not.toMatch(/(?<![\d-])0?9[1-6]\d{7}(?![\d-])/);
    expect(seed).not.toContain('REAL_STATIONS');
    expect(seed).not.toContain('supervisorPhone');
  });

  it('no tracked file contains a number or person name from the private CSV', () => {
    const csvPath = path.join(repoRoot, 'data/private/sabha-stations.csv');
    if (!existsSync(csvPath)) return; // a checkout without the private file has nothing to compare with
    const csv = readFileSync(csvPath, 'utf8');
    const values = new Set<string>(csv.match(/09[1-6]\d{7}/g) ?? []);
    for (const line of csv.split(/\r?\n/).slice(1)) {
      const cells = line.split(',');
      for (const index of [8, 10]) {
        const name = (cells[index] ?? '').trim();
        // Full names only: a single common given name (أبوبكر) would match anywhere.
        if (name.includes(" ") && name.length >= 8) values.add(name);
      }
    }
    const leaks: string[] = [];
    for (const file of files) {
      const text = read(file);
      if (text === null) continue;
      for (const value of values) {
        // The value itself is never printed: this message ends up in logs.
        if (text.includes(value)) leaks.push(`${file} (a value from the private CSV)`);
      }
    }
    expect([...new Set(leaks)]).toEqual([]);
  });
});

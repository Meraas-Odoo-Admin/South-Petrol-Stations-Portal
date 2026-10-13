import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { NAV_PATHS, activeNavPath } from './navAccess.ts';

// Run by `pnpm test` in apps/web. The side menu, the phone bar and the phone
// sheet all light the item `activeNavPath` returns, so one function decides.

test('every route of the nav list has exactly one active item', () => {
  for (const path of NAV_PATHS) {
    for (const address of [path, `${path === '/' ? '' : path}/abc`, `${path === '/' ? '' : path}/abc/def`]) {
      if (path === '/' && address !== '/') continue; // «/» is only the home address
      const active: string[] = NAV_PATHS.filter((p) => activeNavPath([p], address) === p);
      // Every item whose own path matches the address is a candidate, but the
      // function returns ONE of them, and it is the longest.
      const chosen = activeNavPath(NAV_PATHS, address);
      assert.ok(chosen, `${address} has no active item`);
      assert.ok(active.includes(chosen));
      assert.equal(
        Math.max(...active.map((p) => p.length)),
        chosen.length,
        `${address}: ${chosen} is not the longest match`,
      );
      assert.equal(chosen, path, `${address} should light ${path}, not ${chosen}`);
    }
  }
});

test('the two screenshots: reports/daily and reports/violations light one item each', () => {
  assert.equal(activeNavPath(NAV_PATHS, '/reports/daily'), '/reports/daily');
  assert.equal(activeNavPath(NAV_PATHS, '/reports/violations'), '/reports/violations');
  assert.equal(activeNavPath(NAV_PATHS, '/reports'), '/reports');
  assert.equal(activeNavPath(NAV_PATHS, '/reports/anything-else'), '/reports');
});

test('a hidden longer item leaves its parent lit, never two', () => {
  const visible = NAV_PATHS.filter((p) => p !== '/reports/daily');
  assert.equal(activeNavPath(visible, '/reports/daily'), '/reports');
});

test('a sibling that shares a prefix is not a parent', () => {
  assert.equal(activeNavPath(['/vehicles', '/vehicles/change-requests'], '/vehicles/change-requests'), '/vehicles/change-requests');
  assert.equal(activeNavPath(['/my-station', '/my'], '/my-stations'), null);
  assert.equal(activeNavPath(NAV_PATHS, '/change-password'), null);
  assert.equal(activeNavPath(NAV_PATHS, '/reports/'), '/reports');
});

test('the home screen cards link only to destinations of the nav list', () => {
  const source = readFileSync(new URL('../features/home/HomePage.tsx', import.meta.url), 'utf8');
  const targets = [...source.matchAll(/\{ to: '([^']+)'/g)].map((m) => m[1]!);
  assert.ok(targets.length > 5);
  for (const to of targets) {
    assert.ok((NAV_PATHS as readonly string[]).includes(to), `${to} is a home card but not in NAV_PATHS`);
  }
});

test('the side menu items are exactly the nav list', () => {
  const source = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('const navItems'), source.indexOf('].filter((item) => item.show)'));
  const targets = [...block.matchAll(/to: '([^']+)'/g)].map((m) => m[1]!).sort();
  assert.deepEqual(targets, [...NAV_PATHS].sort());
});

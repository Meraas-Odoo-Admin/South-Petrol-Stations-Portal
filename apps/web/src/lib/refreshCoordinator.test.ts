import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRefreshCoordinator } from './refreshCoordinator.ts';

// Run by `pnpm test` in apps/web (node's built-in runner: no extra packages).

function setup(options: { fail?: boolean } = {}) {
  let token: string | null = 'old';
  let calls = 0;
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const coordinator = createRefreshCoordinator({
    doRefresh: async () => {
      calls += 1;
      await gate;
      if (options.fail) throw new Error('refresh refused');
      return 'new';
    },
    getToken: () => token,
    setToken: (next) => {
      token = next;
    },
  });
  return { coordinator, calls: () => calls, token: () => token, release: () => release!() };
}

test('3 simultaneous 401s make exactly one refresh call, and all three retry with the new token', async () => {
  const s = setup();
  const results = Promise.all([
    s.coordinator.tokenAfterUnauthorized('old'),
    s.coordinator.tokenAfterUnauthorized('old'),
    s.coordinator.tokenAfterUnauthorized('old'),
  ]);
  s.release();
  assert.deepEqual(await results, ['new', 'new', 'new']);
  assert.equal(s.calls(), 1);
  assert.equal(s.token(), 'new');
});

test('a 401 that arrives after the refresh finished does not refresh again', async () => {
  const s = setup();
  const first = s.coordinator.tokenAfterUnauthorized('old');
  s.release();
  await first;
  // Two more responses to requests sent with the old token come in late.
  const late = await Promise.all([s.coordinator.tokenAfterUnauthorized('old'), s.coordinator.tokenAfterUnauthorized('old')]);
  assert.deepEqual(late, ['new', 'new']);
  assert.equal(s.calls(), 1);
});

test('a request that really used the current token and still got 401 triggers a new refresh', async () => {
  const s = setup();
  s.release();
  await s.coordinator.tokenAfterUnauthorized('old');
  assert.equal(s.calls(), 1);
  await s.coordinator.tokenAfterUnauthorized('new');
  assert.equal(s.calls(), 2);
});

test('when the one refresh fails, every waiting caller fails, and nobody refreshes a second time', async () => {
  const s = setup({ fail: true });
  const outcomes = Promise.allSettled([
    s.coordinator.tokenAfterUnauthorized('old'),
    s.coordinator.tokenAfterUnauthorized('old'),
    s.coordinator.tokenAfterUnauthorized('old'),
  ]);
  s.release();
  const settled = await outcomes;
  assert.deepEqual(
    settled.map((r) => r.status),
    ['rejected', 'rejected', 'rejected'],
  );
  assert.equal(s.calls(), 1);
});

test('the mount-time refresh and a 401 retry share one call', async () => {
  const s = setup();
  const mount = s.coordinator.refresh();
  const retry = s.coordinator.tokenAfterUnauthorized('old');
  s.release();
  assert.deepEqual(await Promise.all([mount, retry]), ['new', 'new']);
  assert.equal(s.calls(), 1);
});

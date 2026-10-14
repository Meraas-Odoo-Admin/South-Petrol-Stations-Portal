import assert from 'node:assert/strict';
import { test } from 'node:test';
import { homeProfile, orderHomeLinks } from './homeOrder.ts';

const has = (...keys: string[]) => (p: string) => keys.includes(p);
const links = ['/vehicles', '/reports', '/reports/daily', '/fillups/new', '/reports/violations'].map((to) => ({ to }));

test('a station employee lands on the pump first, and every card is still there', () => {
  const ordered = orderHomeLinks(links, has('fillups:create'));
  assert.equal(ordered[0]!.to, '/fillups/new');
  assert.equal(ordered.length, links.length);
});

test('a supervisor sees the pump, then exceptions, then the day', () => {
  const ordered = orderHomeLinks(links, has('fillups:create', 'users:manage_staff', 'stations:manage'));
  assert.deepEqual(ordered.slice(0, 3).map((l) => l.to), ['/fillups/new', '/reports/violations', '/reports/daily']);
  assert.equal(homeProfile(has('fillups:create', 'users:manage_staff', 'stations:manage')), 'station-supervisor');
});

test('a person with no known job keeps the original order', () => {
  assert.deepEqual(orderHomeLinks(links, has()).map((l) => l.to), links.map((l) => l.to));
});

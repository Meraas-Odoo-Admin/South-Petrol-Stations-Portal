import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUDIT_ACTION_GROUPS, AUDIT_ACTION_LABELS, auditValueText, describeDevice } from './auditLabels.ts';

// Run by `pnpm test` in apps/web. The audit log screen (after review, 15 Oct 2026).

test('the device behind an entry: phone, computer, or a script', () => {
  const pump = describeDevice(
    'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  );
  assert.deepEqual(pump, { text: 'Chrome · Android', automated: false, mobile: true });

  const office = describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0');
  assert.deepEqual(office, { text: 'Edge · Windows', automated: false, mobile: false });

  const iphone = describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
  assert.equal(iphone?.text, 'Safari · iPhone');
  assert.equal(iphone?.mobile, true);

  assert.deepEqual(describeDevice('curl/8.4.0'), { text: 'curl', automated: true, mobile: false });
  assert.equal(describeDevice('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/129.0.0.0 Safari/537.36')?.automated, true);
  assert.equal(describeDevice(null), null);
  assert.equal(describeDevice('   '), null);
});

test('recorded values read as words', () => {
  assert.equal(auditValueText(true), 'نعم');
  assert.equal(auditValueText(false), 'لا');
  assert.equal(auditValueText(null), '—');
  assert.equal(auditValueText(''), '—');
  assert.equal(auditValueText(['a', 'b']), 'a، b');
  assert.equal(auditValueText('2026-10-15T09:30:12.000Z'), '2026-10-15 09:30');
  assert.equal(auditValueText('DIESEL', (c) => (c === 'DIESEL' ? 'ديزل' : c)), 'ديزل');
  assert.equal(auditValueText(42), '42');
});

test('every action in a filter group has words, and no action is in two groups', () => {
  const seen = new Set<string>();
  for (const group of AUDIT_ACTION_GROUPS) {
    for (const action of group.actions) {
      assert.ok(AUDIT_ACTION_LABELS[action], `${action} has no label`);
      assert.ok(!seen.has(action), `${action} is in two groups`);
      seen.add(action);
    }
  }
  // …and every labelled action can be filtered on.
  for (const action of Object.keys(AUDIT_ACTION_LABELS)) assert.ok(seen.has(action), `${action} is in no group`);
});

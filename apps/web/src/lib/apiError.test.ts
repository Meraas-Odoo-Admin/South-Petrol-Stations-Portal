import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeApiError } from './apiError.ts';

const http = (status: number, message?: unknown) => ({ isAxiosError: true, response: { status, data: { message } } });

test('a mapped marker reads as its Arabic sentence', () => {
  assert.match(describeApiError(http(409, 'CARD_REQUIRED')).message, /بطاقة/);
  assert.equal(describeApiError(http(409, 'CARD_REQUIRED')).kind, 'conflict');
});

test('no response is a network failure with a retry hint, never a raw message', () => {
  const r = describeApiError({ isAxiosError: true, message: 'Network Error' });
  assert.equal(r.kind, 'network');
  assert.match(r.message, /الاتصال/);
  assert.doesNotMatch(r.message, /Network Error/);
});

test('an unknown marker or English prose never reaches the screen', () => {
  const r = describeApiError(http(409, 'SOMETHING_NEW_AND_UNMAPPED'), 'تعذّر الحفظ.');
  assert.match(r.message, /^تعذّر الحفظ\./);
  assert.doesNotMatch(r.message, /SOMETHING_NEW/);
  assert.doesNotMatch(describeApiError(http(500, 'Internal server error')).message, /Internal/);
});

test('validation messages the API wrote in Arabic are kept', () => {
  assert.equal(describeApiError(http(400, ['must be a string', 'الكمية يجب أن تكون رقمًا أكبر من صفر.'])).message, 'الكمية يجب أن تكون رقمًا أكبر من صفر.');
});

test('every status family has a next step', () => {
  for (const status of [401, 403, 404, 429, 500, 503]) {
    assert.ok(describeApiError(http(status)).message.length > 20, String(status));
  }
});

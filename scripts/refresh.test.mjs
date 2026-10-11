import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLockedFileError, prismaGenerateNeeded, schemaFingerprint } from './refresh-lib.mjs';

test('a schema with no saved stamp needs generating', () => {
  assert.equal(prismaGenerateNeeded({ schemaText: 'model A {}', stampText: null }).needed, true);
  assert.equal(prismaGenerateNeeded({ schemaText: 'model A {}', stampText: undefined }).needed, true);
});

test('an unchanged schema skips generating, ignoring a trailing newline in the stamp', () => {
  const schemaText = 'model A {}';
  const stampText = `${schemaFingerprint(schemaText)}\n`;
  assert.equal(prismaGenerateNeeded({ schemaText, stampText }).needed, false);
});

test('any schema change needs generating again', () => {
  const stampText = schemaFingerprint('model A {}');
  assert.equal(prismaGenerateNeeded({ schemaText: 'model A { id Int }', stampText }).needed, true);
});

test('a locked engine file is recognised, other failures are not', () => {
  assert.equal(isLockedFileError("EPERM: operation not permitted, rename 'query_engine.dll.node.tmp1'"), true);
  assert.equal(isLockedFileError('EBUSY: resource busy or locked'), true);
  assert.equal(isLockedFileError('Error: Schema validation failed'), false);
});

// Helpers for refresh.mjs, kept free of side effects so they can be tested.
import { createHash } from 'node:crypto';

// A fingerprint of schema.prisma. The Prisma client only needs regenerating
// when this changes, and skipping it otherwise matters on Windows: while the
// API runs, it holds the client's engine file open and `prisma generate`
// would fail with EPERM even though nothing needed regenerating.
export function schemaFingerprint(schemaText) {
  return createHash('sha256').update(schemaText).digest('hex');
}

// `stampText` is what was saved after the last successful generate (or
// null/undefined when there is none yet).
export function prismaGenerateNeeded({ schemaText, stampText }) {
  const fingerprint = schemaFingerprint(schemaText);
  return { needed: (stampText ?? '').trim() !== fingerprint, fingerprint };
}

// A generate that failed because another process holds the engine file.
export function isLockedFileError(output) {
  return /EPERM|EBUSY|operation not permitted|resource busy/i.test(output);
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

// Why a dev-only script must not run here, or null when it may. Dev-only
// scripts (e.g. prisma/reset-test-users.ts) call this before touching
// anything: they refuse in production and against any database that is not
// on this machine, so they cannot be aimed at a real database by accident.
export function devScriptRefusal(env: NodeJS.ProcessEnv): string | null {
  if (env.NODE_ENV === 'production') {
    return 'NODE_ENV is production.';
  }
  const url = env.DATABASE_URL;
  if (!url) {
    return 'DATABASE_URL is not set.';
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'DATABASE_URL could not be read.';
  }
  if (!LOCAL_HOSTS.has(host)) {
    return `DATABASE_URL points at "${host}", not at this machine.`;
  }
  return null;
}

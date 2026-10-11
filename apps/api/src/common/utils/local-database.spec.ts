import { devScriptRefusal } from './local-database';

const LOCAL = 'postgresql://u:p@localhost:5433/fuel_tracking?schema=public';

describe('devScriptRefusal', () => {
  it('allows a local database outside production', () => {
    expect(devScriptRefusal({ NODE_ENV: 'development', DATABASE_URL: LOCAL })).toBeNull();
    expect(devScriptRefusal({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x' })).toBeNull();
    expect(devScriptRefusal({ DATABASE_URL: 'postgresql://u:p@[::1]:5432/x' })).toBeNull();
  });

  it('refuses when NODE_ENV is production, even against a local database', () => {
    expect(devScriptRefusal({ NODE_ENV: 'production', DATABASE_URL: LOCAL })).toMatch(/production/);
  });

  it('refuses a database that is not on this machine', () => {
    expect(devScriptRefusal({ DATABASE_URL: 'postgresql://u:p@db.example.org:5432/x' })).toMatch(/db\.example\.org/);
    expect(devScriptRefusal({ DATABASE_URL: 'postgresql://u:p@10.0.0.5:5432/x' })).toMatch(/10\.0\.0\.5/);
  });

  it('refuses when the database settings are missing or unreadable', () => {
    expect(devScriptRefusal({})).toMatch(/not set/);
    expect(devScriptRefusal({ DATABASE_URL: 'not a url' })).toMatch(/could not be read/);
  });
});

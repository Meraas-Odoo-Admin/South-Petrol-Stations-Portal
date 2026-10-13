import { cleanOptions, productionRefusal } from './cli';

describe('clean-up command flags', () => {
  it('reads --confirm and --allow-real-fillups', () => {
    expect(cleanOptions([])).toEqual({ confirm: false, allowRealFillUps: false });
    expect(cleanOptions(['--confirm', '--allow-real-fillups'])).toEqual({ confirm: true, allowRealFillUps: true });
  });

  it('outside production nothing extra is needed', () => {
    expect(productionRefusal({ NODE_ENV: 'development' }, { confirm: false, allowRealFillUps: false })).toBeNull();
  });

  it('in production needs both --confirm and ALLOW_TEST_DATA_REMOVAL=yes', () => {
    const env = { NODE_ENV: 'production' };
    expect(productionRefusal(env, { confirm: false, allowRealFillUps: false })).toMatch(/--confirm/);
    expect(productionRefusal(env, { confirm: true, allowRealFillUps: false })).toMatch(/ALLOW_TEST_DATA_REMOVAL/);
    expect(
      productionRefusal({ ...env, ALLOW_TEST_DATA_REMOVAL: 'no' }, { confirm: true, allowRealFillUps: false }),
    ).toMatch(/ALLOW_TEST_DATA_REMOVAL/);
    expect(
      productionRefusal({ ...env, ALLOW_TEST_DATA_REMOVAL: 'yes' }, { confirm: true, allowRealFillUps: false }),
    ).toBeNull();
  });
});

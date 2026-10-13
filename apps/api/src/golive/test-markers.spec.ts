import { isTestName, isTestUsername } from './test-markers';

describe('test markers', () => {
  it('recognises the seeded and generated test accounts', () => {
    for (const name of ['employee1', 'admin2', 'regsupervisor1', 'sysadmin1', 'syn_a', 'pw_admin_x', 'e2e_um_created_1']) {
      expect(isTestUsername(name)).toBe(true);
    }
  });

  it('never matches a real-looking account', () => {
    for (const name of ['aisha.ali', 'm.supervisor', 'superadmin', 'admin', 'pwd_office', 'employee10']) {
      expect(isTestUsername(name)).toBe(false);
    }
  });

  it('recognises the names spec runs and Playwright give their rows', () => {
    for (const name of [
      'P5A M1 abc',
      'P4B Municipality xyz',
      'E2E VC Municipality 1',
      'PW Test Co 1',
      'Test Station (Raheela) — synthetic fixture',
    ]) {
      expect(isTestName(name)).toBe(true);
    }
  });

  it('recognises the Arabic test words anywhere in a name', () => {
    for (const name of [
      'بلدية اختبار ربدرت',
      'محطة اختبار هجشهت',
      'مكتب تسجيل تجريبي — عنوان',
      'شركة تجريبية للاختبار',
      'Registration office — SYNTHETIC FIXTURE',
      'محطة تجريبي 7',
    ]) {
      expect(isTestName(name)).toBe(true);
    }
  });

  it('does not match Sabha or the client companies', () => {
    for (const name of ['سبها', 'الراحلة', 'ليبيا نفط', 'P', 'PWC Fuel', 'Petrol Co']) {
      expect(isTestName(name)).toBe(false);
    }
  });
});

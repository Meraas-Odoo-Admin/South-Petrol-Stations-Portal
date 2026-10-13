import { settingChangeNotification } from './setting-sentence';

// The bell must read as a sentence: no setting keys, no true/false, no arrows.
const RAW = /←|→|\btrue\b|\bfalse\b|[a-z]+\.[a-z_]+|_|\d+:\s/i;

describe('setting change notifications', () => {
  it('writes a rule switch as a plain sentence', () => {
    const on = settingChangeNotification('fillup.rule.owner_weekly.enabled', 'false', 'true')!;
    expect(on.kind).toBe('RULE_SWITCH_CHANGED');
    expect(on.title).toBe('تم تفعيل قاعدة «الحد الأسبوعي لتعبئات المالك»');
    const off = settingChangeNotification('fillup.rule.owner_weekly.enabled', 'true', 'false')!;
    expect(off.title).toBe('تم إيقاف قاعدة «الحد الأسبوعي لتعبئات المالك»');
    for (const n of [on, off]) expect(`${n.title} ${n.body}`).not.toMatch(RAW);
  });

  it('writes a number with the right Arabic agreement', () => {
    const n = settingChangeNotification('fillup.min_gap_days', '2', '3')!;
    expect(n.kind).toBe('SETTING_CHANGED');
    expect(n.body).toBe('تم تعديل «أقل فاصل زمني بين تعبئتين للمركبة» من يومين إلى 3 أيام.');
    expect(settingChangeNotification('fillup.min_gap_days', '3', '11')!.body).toContain('إلى 11 يومًا');
    expect(settingChangeNotification('stock.low_threshold_liters', '1000', '1')!.body).toContain('إلى لتر واحد');
  });

  it('writes words for the week settings and a price', () => {
    expect(settingChangeNotification('fillup.week_start_day', '6', '0')!.body).toContain('من السبت إلى الأحد');
    expect(settingChangeNotification('fillup.week_window_mode', 'rolling', 'fixed')!.body).toContain('من أسبوع متجدد إلى أسبوع ثابت');
    expect(settingChangeNotification('fillup.price_per_liter.DIESEL', '0.10', '0.2')!.body).toContain('من 0.1 دينار للتر إلى 0.2 دينار للتر');
  });

  it('never shows a key even for a setting it does not know', () => {
    const n = settingChangeNotification('some.future.setting_key', 'abc', 'xyz')!;
    expect(`${n.title} ${n.body}`).not.toMatch(RAW);
    expect(n.body).toContain('أحد إعدادات المنظومة');
  });

  it('says nothing when the value did not change', () => {
    expect(settingChangeNotification('fillup.max_per_week', '3', '3')).toBeNull();
  });
});

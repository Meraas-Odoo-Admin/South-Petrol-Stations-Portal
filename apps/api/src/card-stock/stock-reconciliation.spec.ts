import { effectiveEntries, reconcile, statusOf, type PrintPoint, type RawEntry } from './stock-reconciliation';

let seq = 0;
const at = (iso: string) => new Date(iso);
function entry(kind: RawEntry['kind'], quantity: number, when: string, extra: Partial<RawEntry> = {}): RawEntry {
  seq += 1;
  return {
    id: `e${String(seq).padStart(3, '0')}`,
    kind,
    quantity,
    occurredAt: at(when),
    createdAt: at(extra.createdAt?.toISOString() ?? when),
    correctsEntryId: null,
    ...extra,
  };
}
const prints = (n: number, when: string, kind: PrintPoint['kind'] = 'CARD'): PrintPoint[] =>
  Array.from({ length: n }, () => ({ at: at(when), kind }));

describe('stock reconciliation', () => {
  it('blanks used = previous count + received − current count, and a match is fine', () => {
    const raw = [
      entry('COUNT', 500, '2026-10-01T08:00:00Z'),
      entry('RECEIVED', 200, '2026-10-03T08:00:00Z'),
      entry('COUNT', 520, '2026-10-05T08:00:00Z'),
    ];
    const { windows } = reconcile(effectiveEntries(raw), prints(180, '2026-10-04T10:00:00Z'));
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ received: 200, used: 180, difference: 0, status: 'OK' });
    expect(windows[0]!.prints.total).toBe(180);
  });

  it('200 blanks left the box but only 180 prints were recorded: 20 cards are unaccounted for', () => {
    const raw = [entry('COUNT', 1000, '2026-10-01T08:00:00Z'), entry('COUNT', 800, '2026-10-08T08:00:00Z')];
    const { windows } = reconcile(effectiveEntries(raw), prints(180, '2026-10-05T10:00:00Z'));
    expect(windows[0]).toMatchObject({ used: 200, difference: 20, status: 'UNACCOUNTED' });
  });

  it('fewer blanks used than printed is flagged as a likely counting error', () => {
    const raw = [entry('COUNT', 1000, '2026-10-01T08:00:00Z'), entry('COUNT', 850, '2026-10-08T08:00:00Z')];
    const { windows } = reconcile(effectiveEntries(raw), prints(180, '2026-10-05T10:00:00Z'));
    expect(windows[0]).toMatchObject({ used: 150, difference: -30, status: 'NEGATIVE' });
  });

  it('a count higher than the stock should allow is negative too (more blanks than ever existed)', () => {
    const raw = [entry('COUNT', 100, '2026-10-01T08:00:00Z'), entry('COUNT', 140, '2026-10-08T08:00:00Z')];
    const { windows } = reconcile(effectiveEntries(raw), prints(0, '2026-10-05T10:00:00Z'));
    expect(windows[0]).toMatchObject({ used: -40, difference: -40, status: 'NEGATIVE' });
  });

  it('counts test-card prints as blanks consumed, and shows them apart', () => {
    const raw = [entry('COUNT', 100, '2026-10-01T08:00:00Z'), entry('COUNT', 90, '2026-10-02T08:00:00Z')];
    const all = [...prints(8, '2026-10-01T10:00:00Z'), ...prints(2, '2026-10-01T11:00:00Z', 'TEST')];
    const { windows } = reconcile(effectiveEntries(raw), all);
    expect(windows[0]!.prints).toEqual({ card: 8, test: 2, total: 10 });
    expect(windows[0]).toMatchObject({ used: 10, difference: 0, status: 'OK' });
    // Without counting the two test cards the same window would look like a shortfall.
    const withoutTests = reconcile(effectiveEntries(raw), prints(8, '2026-10-01T10:00:00Z')).windows[0]!;
    expect(withoutTests.difference).toBe(2);
  });

  describe('corrections', () => {
    it('a correction of a count replaces its quantity and changes the result', () => {
      const first = entry('COUNT', 1000, '2026-10-01T08:00:00Z');
      const second = entry('COUNT', 800, '2026-10-08T08:00:00Z');
      const fix = entry('CORRECTION', 820, '2026-10-09T09:00:00Z', { correctsEntryId: second.id });
      const eff = effectiveEntries([first, second, fix]);
      expect(eff).toHaveLength(2);
      const corrected = eff.find((e) => e.id === second.id)!;
      expect(corrected).toMatchObject({ quantity: 820, originalQuantity: 800, corrected: true });
      // The correction keeps the original's moment; the window now uses 820.
      expect(corrected.at).toEqual(at('2026-10-08T08:00:00Z'));
      const { windows } = reconcile(eff, prints(180, '2026-10-05T10:00:00Z'));
      expect(windows[0]).toMatchObject({ used: 180, difference: 0, status: 'OK' });
    });

    it('a correction of a delivery changes the blanks received', () => {
      const a = entry('COUNT', 100, '2026-10-01T08:00:00Z');
      const delivery = entry('RECEIVED', 500, '2026-10-02T08:00:00Z');
      const b = entry('COUNT', 540, '2026-10-03T08:00:00Z');
      const fix = entry('CORRECTION', 450, '2026-10-03T09:00:00Z', { correctsEntryId: delivery.id });
      const { windows } = reconcile(effectiveEntries([a, delivery, b, fix]), prints(10, '2026-10-02T12:00:00Z'));
      expect(windows[0]).toMatchObject({ received: 450, used: 10, difference: 0, status: 'OK' });
    });

    it('the latest of several corrections wins, and the original is kept for the record', () => {
      const count = entry('COUNT', 100, '2026-10-01T08:00:00Z');
      const first = entry('CORRECTION', 90, '2026-10-02T08:00:00Z', { correctsEntryId: count.id });
      const second = entry('CORRECTION', 95, '2026-10-03T08:00:00Z', { correctsEntryId: count.id });
      const [only] = effectiveEntries([count, second, first]);
      expect(only).toMatchObject({ quantity: 95, originalQuantity: 100, corrected: true });
    });

    it('with nothing corrected, entries keep their own quantity', () => {
      const [only] = effectiveEntries([entry('COUNT', 100, '2026-10-01T08:00:00Z')]);
      expect(only).toMatchObject({ quantity: 100, corrected: false });
    });
  });

  describe('window boundaries', () => {
    it('a print at the previous count belongs to the earlier window, one at the current count to this window', () => {
      const raw = [entry('COUNT', 100, '2026-10-01T08:00:00Z'), entry('COUNT', 97, '2026-10-02T08:00:00Z')];
      const all: PrintPoint[] = [
        { at: at('2026-10-01T08:00:00Z'), kind: 'CARD' }, // exactly at the previous count: not in this window
        { at: at('2026-10-01T08:00:00.001Z'), kind: 'CARD' },
        { at: at('2026-10-02T08:00:00Z'), kind: 'CARD' }, // exactly at the current count: in this window
        { at: at('2026-10-02T08:00:00.001Z'), kind: 'CARD' }, // after: not in this window
      ];
      const { windows } = reconcile(effectiveEntries(raw), all);
      expect(windows[0]!.prints.total).toBe(2);
    });
  });

  it('three counts make two windows, each reconciled on its own', () => {
    const raw = [
      entry('COUNT', 300, '2026-10-01T08:00:00Z'),
      entry('COUNT', 250, '2026-10-05T08:00:00Z'),
      entry('COUNT', 200, '2026-10-10T08:00:00Z'),
    ];
    const all = [...prints(50, '2026-10-03T10:00:00Z'), ...prints(45, '2026-10-07T10:00:00Z')];
    const { windows } = reconcile(effectiveEntries(raw), all);
    expect(windows.map((w) => [w.used, w.difference, w.status])).toEqual([
      [50, 0, 'OK'],
      [50, 5, 'UNACCOUNTED'],
    ]);
  });

  it('needs two counts for a window; one count gives only the position since it', () => {
    const raw = [entry('COUNT', 300, '2026-10-01T08:00:00Z'), entry('RECEIVED', 100, '2026-10-02T08:00:00Z')];
    const { windows, sinceLastCount } = reconcile(effectiveEntries(raw), prints(40, '2026-10-03T08:00:00Z'));
    expect(windows).toEqual([]);
    expect(sinceLastCount).toMatchObject({ receivedSince: 100, expectedRemaining: 360 });
    expect(sinceLastCount!.prints.total).toBe(40);
  });

  it('no counts at all gives nothing to reconcile', () => {
    expect(reconcile([], prints(5, '2026-10-01T08:00:00Z'))).toEqual({ windows: [], sinceLastCount: null });
  });

  it('classifies a difference', () => {
    expect(statusOf(0)).toBe('OK');
    expect(statusOf(1)).toBe('UNACCOUNTED');
    expect(statusOf(-1)).toBe('NEGATIVE');
  });
});

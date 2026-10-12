// Card-stock reconciliation: pure arithmetic, no database.
//
// The system knows how many blank cards it PRINTED; only people know how many
// blanks left the box. A supervisor records deliveries and physical counts, and
// between any two counts:
//
//   blanks used = previous count + received in between − current count
//   difference  = blanks used − prints the system recorded in the same window
//
//   zero      → fine
//   positive  → more blanks left the box than the system printed: unaccounted cards
//   negative  → fewer used than printed: very likely a counting or entry error
//
// A window is the half-open span (previous count, current count]: a delivery or
// a print at exactly the previous count's moment belongs to the earlier window,
// one at exactly the current count's moment to this one.
//
// Entries are never edited. A CORRECTION entry points at the entry it fixes and
// carries the right quantity; the latest correction of an entry wins.

export type EntryKind = 'RECEIVED' | 'COUNT' | 'CORRECTION';

export interface RawEntry {
  id: string;
  kind: EntryKind;
  quantity: number;
  occurredAt: Date;
  createdAt: Date;
  correctsEntryId: string | null;
}

export interface EffectiveEntry {
  id: string;
  kind: 'RECEIVED' | 'COUNT';
  /** The quantity that counts: the latest correction's, else the original. */
  quantity: number;
  originalQuantity: number;
  corrected: boolean;
  at: Date;
}

export interface PrintPoint {
  at: Date;
  kind: 'CARD' | 'TEST';
}

export type WindowStatus = 'OK' | 'UNACCOUNTED' | 'NEGATIVE';

export interface ReconWindow {
  from: EffectiveEntry;
  to: EffectiveEntry;
  received: number;
  used: number;
  prints: { card: number; test: number; total: number };
  difference: number;
  status: WindowStatus;
}

export interface SinceLastCount {
  lastCount: EffectiveEntry;
  receivedSince: number;
  prints: { card: number; test: number; total: number };
  /** Last count + received since − prints since. Below zero means prints exceed the stock. */
  expectedRemaining: number;
}

// Applies corrections: each original entry takes the quantity of its latest
// correction (by creation time, then id). Corrections themselves are not
// entries of their own in the result.
export function effectiveEntries(raw: RawEntry[]): EffectiveEntry[] {
  const latestCorrection = new Map<string, RawEntry>();
  for (const entry of raw) {
    if (entry.kind !== 'CORRECTION' || !entry.correctsEntryId) continue;
    const current = latestCorrection.get(entry.correctsEntryId);
    const newer =
      !current ||
      entry.createdAt.getTime() > current.createdAt.getTime() ||
      (entry.createdAt.getTime() === current.createdAt.getTime() && entry.id > current.id);
    if (newer) latestCorrection.set(entry.correctsEntryId, entry);
  }
  return raw
    .filter((e): e is RawEntry & { kind: 'RECEIVED' | 'COUNT' } => e.kind !== 'CORRECTION')
    .map((e) => {
      const fix = latestCorrection.get(e.id);
      return {
        id: e.id,
        kind: e.kind,
        quantity: fix ? fix.quantity : e.quantity,
        originalQuantity: e.quantity,
        corrected: Boolean(fix),
        at: e.occurredAt,
      };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
}

function countPrints(prints: PrintPoint[], after: Date, upTo: Date | null) {
  let card = 0;
  let test = 0;
  for (const p of prints) {
    const t = p.at.getTime();
    if (t <= after.getTime()) continue;
    if (upTo && t > upTo.getTime()) continue;
    if (p.kind === 'TEST') test += 1;
    else card += 1;
  }
  return { card, test, total: card + test };
}

function sumReceived(entries: EffectiveEntry[], after: Date, upTo: Date | null): number {
  return entries
    .filter((e) => e.kind === 'RECEIVED' && e.at.getTime() > after.getTime() && (!upTo || e.at.getTime() <= upTo.getTime()))
    .reduce((sum, e) => sum + e.quantity, 0);
}

export function statusOf(difference: number): WindowStatus {
  if (difference === 0) return 'OK';
  return difference > 0 ? 'UNACCOUNTED' : 'NEGATIVE';
}

export interface PrintCounts {
  card: number;
  test: number;
  total: number;
}

// The windows between consecutive counts, before any print is counted. The
// database service counts prints per window with a query, so no table is ever
// loaded whole; reconcile() below does both steps for in-memory data (tests).
export interface OpenWindow {
  from: EffectiveEntry;
  to: EffectiveEntry;
  received: number;
  used: number;
}

export function buildWindows(entries: EffectiveEntry[]): OpenWindow[] {
  const counts = entries.filter((e) => e.kind === 'COUNT');
  const windows: OpenWindow[] = [];
  for (let i = 1; i < counts.length; i += 1) {
    const from = counts[i - 1]!;
    const to = counts[i]!;
    const received = sumReceived(entries, from.at, to.at);
    windows.push({ from, to, received, used: from.quantity + received - to.quantity });
  }
  return windows;
}

export function completeWindow(window: OpenWindow, prints: PrintCounts): ReconWindow {
  const difference = window.used - prints.total;
  return { ...window, prints, difference, status: statusOf(difference) };
}

// Where the stock stands since the last count, before prints are counted.
export function positionSince(entries: EffectiveEntry[]): { lastCount: EffectiveEntry; receivedSince: number } | null {
  const counts = entries.filter((e) => e.kind === 'COUNT');
  const lastCount = counts[counts.length - 1];
  return lastCount ? { lastCount, receivedSince: sumReceived(entries, lastCount.at, null) } : null;
}

export function completePosition(
  position: { lastCount: EffectiveEntry; receivedSince: number },
  prints: PrintCounts,
): SinceLastCount {
  return {
    lastCount: position.lastCount,
    receivedSince: position.receivedSince,
    prints,
    expectedRemaining: position.lastCount.quantity + position.receivedSince - prints.total,
  };
}

export function reconcile(
  entries: EffectiveEntry[],
  prints: PrintPoint[],
): { windows: ReconWindow[]; sinceLastCount: SinceLastCount | null } {
  const windows = buildWindows(entries).map((w) => completeWindow(w, countPrints(prints, w.from.at, w.to.at)));
  const position = positionSince(entries);
  const sinceLastCount = position ? completePosition(position, countPrints(prints, position.lastCount.at, null)) : null;
  return { windows, sinceLastCount };
}

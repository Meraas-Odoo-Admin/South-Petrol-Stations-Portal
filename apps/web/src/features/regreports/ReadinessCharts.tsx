import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { num, shortDay } from './common';

// Two charts for the readiness report, following the dataviz procedure:
//  - one question each, a plain title above, a legend in words with direct
//    totals (never colour alone), a table view for the same numbers;
//  - bars start at zero, 2px surface gaps between stacked segments, a
//    4px rounded data end, recessive grid, a hover tooltip in words;
//  - colours: teal #0D5C52 (with a card), deep amber #B97A1A (without a card).
//    The pair passes the colour-vision and contrast checks (see DESIGN.md);
//    amber is "needs attention", never "wrong", so red is not used.

export const WITH_CARD = '#0D5C52';
export const WITHOUT_CARD = '#B97A1A';
const SURFACE = '#FFFFFF';

interface TipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ name: string; value: number; color: string }>;
}
function Tip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-sm border border-line bg-surface p-3 text-[16px] lg:text-[14px] shadow-md">
      <p className="mb-1 font-extrabold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: p.color }} />
          {p.name}: <strong>{num(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: Array<{ label: string; color: string; total: number }> }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-ink lg:text-[13px]">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-sm" style={{ background: i.color }} />
          {i.label}: <strong className="text-[16px]">{num(i.total)}</strong>
        </li>
      ))}
    </ul>
  );
}

export function CardVsNoCardChart({ daily }: { daily: Array<{ day: string; withCard: number; withoutCard: number }> }) {
  const data = daily.map((d) => ({ label: shortDay(d.day), 'بالبطاقة': d.withCard, 'بدون بطاقة': d.withoutCard }));
  const totalWith = daily.reduce((s, d) => s + d.withCard, 0);
  const totalWithout = daily.reduce((s, d) => s + d.withoutCard, 0);
  return (
    <figure>
      <Legend
        items={[
          { label: 'بالبطاقة (مسح البطاقة)', color: WITH_CARD, total: totalWith },
          { label: 'بدون بطاقة', color: WITHOUT_CARD, total: totalWithout },
        ]}
      />
      <div dir="ltr" role="img" aria-label={`عدد التعبئات اليومية: ${num(totalWith)} بالبطاقة و${num(totalWithout)} بدون بطاقة`} className="h-64 w-full lg:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#E3E7E2" />
            <XAxis dataKey="label" tick={{ fontSize: 13, fill: '#5B6D6A' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} width={40} tick={{ fontSize: 13, fill: '#5B6D6A' }} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
            <Bar dataKey="بالبطاقة" stackId="a" fill={WITH_CARD} stroke={SURFACE} strokeWidth={2} />
            <Bar dataKey="بدون بطاقة" stackId="a" fill={WITHOUT_CARD} stroke={SURFACE} strokeWidth={2} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function IssuanceChart({ daily }: { daily: Array<{ day: string; cardsIssued: number }> }) {
  const data = daily.map((d) => ({ label: shortDay(d.day), 'بطاقات صدرت': d.cardsIssued }));
  const total = daily.reduce((s, d) => s + d.cardsIssued, 0);
  return (
    <figure>
      <Legend items={[{ label: 'بطاقات صدرت في الفترة', color: WITH_CARD, total }]} />
      <div dir="ltr" role="img" aria-label={`بطاقات صدرت يوميًا، المجموع ${num(total)}`} className="h-56 w-full lg:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#E3E7E2" />
            <XAxis dataKey="label" tick={{ fontSize: 13, fill: '#5B6D6A' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} width={40} tick={{ fontSize: 13, fill: '#5B6D6A' }} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
            <Bar dataKey="بطاقات صدرت" fill={WITH_CARD} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

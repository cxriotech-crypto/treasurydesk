'use client';

/**
 * Chart wrappers: muted palette, thin gridlines, ₦ tooltips, legible in light and dark.
 * Recharts needs concrete colours (CSS variables do not resolve in SVG attributes), so the
 * palette is resolved from the active theme.
 */
import { useSyncExternalStore } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Point } from '@/services/dashboardService';
import { formatCount, formatNaira, formatNairaCompact } from '@/lib/format';

const LIGHT = {
  brand: '#0b2545',
  teal: '#13a89e',
  grid: '#e4e4e7',
  axis: '#71717a',
  surface: '#ffffff',
  border: '#e4e4e7',
  fg: '#18181b',
};
const DARK = {
  brand: '#93b4e0',
  teal: '#2dbeb2',
  grid: '#27272a',
  axis: '#a1a1aa',
  surface: '#141417',
  border: '#27272a',
  fg: '#fafafa',
};

function subscribeTheme(cb: () => void) {
  if (typeof document === 'undefined') return () => undefined;
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
}

export function useChartColors() {
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains('dark'),
    () => false
  );
  return dark ? DARK : LIGHT;
}

function ChartTooltip({
  active,
  payload,
  label,
  money,
}: {
  active?: boolean;
  payload?: { value: number; payload: Point }[];
  label?: string;
  money?: boolean;
}) {
  const c = useChartColors();
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div
      style={{ background: c.surface, border: `1px solid ${c.border}`, color: c.fg }}
      className="rounded-md px-2.5 py-1.5 text-xs shadow-pop"
    >
      <p className="font-medium">{label}</p>
      <p className="num">
        {money ? formatNaira(p.payload.amount ?? String(p.value)) : formatCount(p.value)}
      </p>
    </div>
  );
}

const axisProps = (c: ReturnType<typeof useChartColors>) => ({
  tick: { fill: c.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: c.grid },
});

export function BarChartCard({
  data,
  money,
  height = 200,
  highlightIndex,
}: {
  data: Point[];
  money?: boolean;
  height?: number;
  highlightIndex?: number;
}) {
  const c = useChartColors();
  if (!data.some((d) => d.value)) {
    return (
      <p className="flex h-[200px] items-center justify-center text-[13px] text-muted">
        Nothing to chart for this period.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="2 4" />
        <XAxis
          dataKey="label"
          {...axisProps(c)}
          interval={0}
          angle={data.length > 6 ? -25 : 0}
          textAnchor={data.length > 6 ? 'end' : 'middle'}
          height={data.length > 6 ? 46 : 24}
        />
        <YAxis
          {...axisProps(c)}
          width={money ? 58 : 34}
          tickFormatter={(v: number) => (money ? formatNairaCompact(String(v)) : String(v))}
        />
        <Tooltip
          cursor={{ fill: c.grid, opacity: 0.35 }}
          content={<ChartTooltip money={money} />}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={38}>
          {data.map((d, i) => (
            <Cell key={d.label} fill={highlightIndex === i ? c.teal : c.brand} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineChartCard({
  data,
  money,
  height = 220,
}: {
  data: Point[];
  money?: boolean;
  height?: number;
}) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="2 4" />
        <XAxis dataKey="label" {...axisProps(c)} />
        <YAxis
          {...axisProps(c)}
          width={money ? 58 : 34}
          tickFormatter={(v: number) => (money ? formatNairaCompact(String(v)) : String(v))}
        />
        <Tooltip content={<ChartTooltip money={money} />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={c.teal}
          strokeWidth={2}
          dot={{ r: 2, fill: c.teal }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal pipeline bars (stage → count), each row linking to the filtered list. */
export function StageBars({
  data,
  hrefFor,
}: {
  data: Point[];
  hrefFor?: (p: Point) => string | null;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2">
      {data.map((d) => {
        const row = (
          <>
            <span className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="truncate">{d.label}</span>
              <span className="num shrink-0 text-muted">
                {d.value}
                {d.amount ? ` · ${formatNairaCompact(d.amount)}` : ''}
              </span>
            </span>
            <span className="mt-1 block h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </span>
          </>
        );
        const href = hrefFor?.(d);
        return (
          <li key={d.label}>
            {href ? (
              <a href={href} className="block rounded-md p-1 hover:bg-surface-2">
                {row}
              </a>
            ) : (
              <div className="p-1">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

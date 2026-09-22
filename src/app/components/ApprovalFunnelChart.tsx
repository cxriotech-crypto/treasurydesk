'use client';
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ApprovalFunnelPoint } from '@/services/dashboardService';

interface Props { data: ApprovalFunnelPoint[]; }

const BAR_COLORS = ['#0B2545', '#1A5276', '#13A89E', '#F59E0B', '#8B5CF6'];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground">Pending: <span className="font-bold text-foreground tabular-nums">{payload[0]?.value}</span></p>
    </div>
  );
}

export default function ApprovalFunnelChart({ data }: Props) {
  const shortLabels = data.map((d) => {
    const words = d.level.split(' ');
    return words.length > 1 ? words.map((w) => w[0]).join('') : d.level.slice(0, 3);
  });
  const chartData = data.map((d, i) => ({ ...d, shortLabel: shortLabels[i] }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={true} vertical={false} />
        <XAxis dataKey="shortLabel" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}>
          {chartData.map((_, i) => (
            <Cell key={`funnel-cell-${i}`} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
'use client';
import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import type { ChartDataPoint } from '@/services/dashboardService';

interface Props { data: ChartDataPoint[]; }

const COLORS = {
  FD: 'var(--primary)',
  TB: 'var(--accent)',
  CP: '#F59E0B',
  OD: '#8B5CF6',
  FO: '#EF4444',
  RP: '#3B82F6',
};

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[140px]">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={`tt-${p.name}`} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </span>
          <span className="font-bold tabular-nums text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function VolumeChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          {Object.entries(COLORS).map(([key, color]) => (
            <linearGradient key={`grad-${key}`} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        {Object.entries(COLORS).map(([key, color]) => (
          <Area
            key={`area-${key}`}
            type="monotone"
            dataKey={key}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#grad-${key})`}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
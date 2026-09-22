import React from 'react';
import type { LucideIcon } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface KpiTileProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral' | 'alert';
  trendLabel?: string;
  variant?: 'default' | 'alert' | 'success' | 'warning' | 'info';
  compact?: boolean;
}

const VARIANT_STYLES = {
  default: { card: 'bg-card border-border', icon: 'bg-primary/10 text-primary', value: 'text-foreground' },
  alert: { card: 'bg-red-50 border-red-200', icon: 'bg-red-100 text-red-600', value: 'text-red-700' },
  success: { card: 'bg-green-50 border-green-200', icon: 'bg-green-100 text-green-600', value: 'text-green-700' },
  warning: { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-100 text-amber-600', value: 'text-amber-700' },
  info: { card: 'bg-blue-50 border-blue-200', icon: 'bg-blue-100 text-blue-600', value: 'text-blue-700' },
};

export default function KpiTile({ label, value, subValue, icon: Icon, trendLabel, variant = 'default', compact = false }: KpiTileProps) {
  const styles = VARIANT_STYLES[variant];
  return (
    <div className={`rounded-xl border p-4 ${styles.card} ${compact ? '' : 'min-h-[100px]'}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${styles.icon}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className={`text-2xl font-bold tabular-nums leading-none mb-1 ${styles.value}`}>{value}</p>
      {(subValue || trendLabel) && (
        <p className="text-xs text-muted-foreground">{subValue ?? trendLabel}</p>
      )}
    </div>
  );
}
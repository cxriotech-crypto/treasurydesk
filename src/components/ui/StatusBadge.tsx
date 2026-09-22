import {
  INVESTMENT_STATUS_META,
  TXN_STATUS_META,
  type InvestmentStatus,
  type Tone,
  type TxnStatus,
} from '@/domain/codes';
import type { SlaState } from '@/domain/rules';
import { Badge } from './Display';

export function TxnStatusBadge({ status }: { status: TxnStatus }) {
  const m = TXN_STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function InvestmentStatusBadge({ status }: { status: InvestmentStatus }) {
  const m = INVESTMENT_STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const SLA_TONE: Record<SlaState['band'], Tone> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
};

/** SLA indicator: green > 2 h left, amber < 2 h, red breached. */
export function SlaBadge({ sla }: { sla: SlaState | null }) {
  if (!sla) return <span className="text-xs text-muted">—</span>;
  return <Badge tone={SLA_TONE[sla.band]}>{sla.label}</Badge>;
}

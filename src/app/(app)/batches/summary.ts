import { TXN_STATUS_META, type TxnStatus } from '@/domain/codes';

/** Short status summary for a batch: "2 Awaiting MIS · 1 Returned for correction". */
export function statusSummary(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([s, n]) => `${n} ${TXN_STATUS_META[s as TxnStatus]?.label ?? s}`)
    .join(' · ');
}

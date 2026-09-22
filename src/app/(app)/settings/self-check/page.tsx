'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { runCalcCases, TEST_SETTINGS, type CaseResult } from '@/lib/calcCases';
import { formatDateTime } from '@/lib/format';
import { nowIso } from '@/lib/dates';
import { SETTING_META } from '@/services';
import type { Settings } from '@/domain/types';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  InlineAlert,
  PageHeader,
  cn,
} from '@/components/ui';

/** Runs the brief's section 7.4 calculation checks with fixed test settings, not the live ones. */
export default function SelfCheckPage() {
  const [results, setResults] = useState<CaseResult[] | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      setResults(runCalcCases());
      setRanAt(nowIso());
      setBusy(false);
    }, 150);
  };

  const required = results?.filter((r) => r.required) ?? [];
  const extra = results?.filter((r) => !r.required) ?? [];
  const requiredPass = required.filter((r) => r.pass).length;
  const allPass = results?.every((r) => r.pass) ?? false;

  return (
    <>
      <PageHeader
        title="Calculation self-check"
        description="The required cases from the build brief, run against the live calculation engine."
        crumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Self-check' }]}
        actions={
          <Button variant="primary" icon={Play} loading={busy} onClick={run}>
            Run all checks
          </Button>
        }
      />

      {results ? (
        <div className="mb-5">
          <InlineAlert
            tone={allPass ? 'success' : 'danger'}
            title={`${requiredPass}/${required.length} required checks passed`}
          >
            {extra.filter((r) => r.pass).length}/{extra.length} extra checks passed · run{' '}
            {formatDateTime(ranAt)}
          </InlineAlert>
        </div>
      ) : (
        <div className="mb-5">
          <InlineAlert tone="info">
            These checks always use fixed test settings (WHT 10%, charge 20%, fee 0.10%, 365-day
            basis), so changing the live settings never changes the result.
          </InlineAlert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {(results ?? []).map((r) => (
            <Card key={r.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <span className="num text-muted">{r.id}</span> {r.name}
                  </span>
                }
                actions={
                  <span className="flex items-center gap-2">
                    {r.required ? <Badge>Required</Badge> : null}
                    <Badge tone={r.pass ? 'success' : 'danger'}>{r.pass ? 'PASS' : 'FAIL'}</Badge>
                  </span>
                }
              />
              <CardBody>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th scope="col" className="py-1 text-left font-medium">
                        Figure
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        Expected
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        Actual
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.lines.map((l) => (
                      <tr key={l.label} className={cn(!l.pass && 'text-st-danger-fg')}>
                        <td className="py-1">{l.label}</td>
                        <td className="num py-1 text-right">{l.expected}</td>
                        <td className="num py-1 text-right font-medium">{l.actual}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          ))}
          {!results ? (
            <Card>
              <CardBody>
                <p className="text-sm text-muted">
                  Press “Run all checks” to execute the calculation cases.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader title="Test settings" description="Fixed for these checks" />
          <CardBody>
            <dl className="space-y-2 text-[13px]">
              {(
                [
                  'whtRate',
                  'preliqChargeRate',
                  'transferFeeRate',
                  'dayCount',
                  'whtOnAnniversary',
                  'whtBasisPreliq',
                  'partialPreliqInterest',
                  'tpFeeMode',
                  'rolloverCInterest',
                  'rolloverABasis',
                ] as (keyof Settings)[]
              ).map((k) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{SETTING_META[k].label}</dt>
                  <dd className="num">{String(TEST_SETTINGS[k])}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

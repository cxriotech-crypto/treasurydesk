'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Upload, XCircle } from 'lucide-react';
import type { ImportRegister } from '@/domain/types';
import { IMPORT_SPECS, IMPORT_REGISTERS, parseRows, templateRows } from '@/lib/importSpecs';
import { IMPORT_ACCEPT, readSheet } from '@/lib/importFile';
import { downloadFile } from '@/lib/csv';
import { formatDateTime } from '@/lib/format';
import { importsService } from '@/services';
import type { ImportRow } from '@/services/importsService';
import { useCurrentUser, useData } from '@/services/useData';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  InlineAlert,
  PageHeader,
  Select,
  SignatureModal,
  SkeletonRows,
  Tooltip,
  toast,
  toastError,
  type Column,
} from '@/components/ui';

interface Staged {
  register: ImportRegister;
  fileName: string;
  rows: Record<string, string>[];
  rejected: { line: number; errors: string[] }[];
  missingColumns: string[];
}

const STATUS_TONE = {
  PENDING_APPROVAL: 'warning',
  APPLIED: 'success',
  REJECTED: 'danger',
} as const;
const STATUS_LABEL = {
  PENDING_APPROVAL: 'Awaiting approval',
  APPLIED: 'Applied',
  REJECTED: 'Rejected',
} as const;

export default function ImportsPage() {
  const me = useCurrentUser();
  const q = useData(() => importsService.list(), []);
  const [register, setRegister] = useState<ImportRegister>('CUSTOMERS');
  const [staged, setStaged] = useState<Staged | null>(null);
  const [busy, setBusy] = useState(false);
  const [decide, setDecide] = useState<{ row: ImportRow; action: 'APPROVE' | 'REJECT' } | null>(
    null
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const spec = IMPORT_SPECS[register];

  const template = () => {
    const rows = templateRows(register);
    downloadFile(
      `treasurydesk-${register.toLowerCase()}-template.csv`,
      rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c}"` : c)).join(',')).join('\r\n')
    );
    toast.success('Template downloaded', 'Fill it in and upload it here.');
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const sheet = await readSheet(file);
      const parsed = parseRows(register, sheet.headers, sheet.body);
      setStaged({
        register,
        fileName: file.name,
        rows: parsed.rows,
        rejected: parsed.rejected,
        missingColumns: parsed.missingColumns,
      });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const upload = async () => {
    if (!staged) return;
    setBusy(true);
    try {
      const batch = await importsService.create({
        register: staged.register,
        fileName: staged.fileName,
        rows: staged.rows,
        rejectedRows: staged.rejected,
      });
      toast.success(
        `${batch.batchRef} uploaded`,
        batch.status === 'APPLIED'
          ? `${batch.createdCount} record(s) created.`
          : 'The Head of Treasury has been asked to approve it.'
      );
      setStaged(null);
      q.reload();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<ImportRow>[] = useMemo(
    () => [
      { key: 'ref', header: 'Batch', cell: (r) => r.batchRef, card: 'title' },
      { key: 'register', header: 'Register', cell: (r) => IMPORT_SPECS[r.register].label },
      {
        key: 'file',
        header: 'File',
        cell: (r) => <span className="block max-w-[14rem] truncate">{r.fileName}</span>,
      },
      { key: 'rows', header: 'Rows', cell: (r) => <span className="num">{r.rows.length}</span> },
      {
        key: 'status',
        header: 'Status',
        card: 'status',
        cell: (r) => (
          <Badge tone={STATUS_TONE[r.status]}>
            {STATUS_LABEL[r.status]}
            {r.status === 'APPLIED'
              ? ` · ${r.createdCount} created${r.skippedRows.length ? `, ${r.skippedRows.length} skipped` : ''}`
              : ''}
          </Badge>
        ),
      },
      { key: 'by', header: 'Uploaded by', cell: (r) => r.uploadedByName },
      {
        key: 'at',
        header: 'Uploaded',
        cell: (r) => <span className="num">{formatDateTime(r.uploadedAt)}</span>,
      },
      {
        key: 'act',
        header: 'Decision',
        cell: (r) =>
          r.status !== 'PENDING_APPROVAL' ? (
            <span className="text-xs text-muted">
              {r.decidedByName ? `${r.decidedByName}${r.comments ? ` — ${r.comments}` : ''}` : '—'}
              {r.skippedRows.length ? (
                <Tooltip
                  content={r.skippedRows
                    .slice(0, 8)
                    .map((s) => `Row ${s.row}: ${s.reason}`)
                    .join(' · ')}
                >
                  <span className="block text-st-warning-fg" tabIndex={0}>
                    {r.skippedRows.length} row(s) skipped
                  </span>
                </Tooltip>
              ) : null}
            </span>
          ) : r.blocker ? (
            <Tooltip content={r.blocker}>
              <span className="text-xs text-st-warning-fg" tabIndex={0} aria-label={r.blocker}>
                Waiting
              </span>
            </Tooltip>
          ) : (
            <span className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                icon={CheckCircle2}
                onClick={() => setDecide({ row: r, action: 'APPROVE' })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                icon={XCircle}
                onClick={() => setDecide({ row: r, action: 'REJECT' })}
              >
                Reject
              </Button>
            </span>
          ),
      },
    ],
    []
  );

  return (
    <div>
      <PageHeader
        title="Data import"
        description="Load the opening registers from a spreadsheet. Treasury uploads are applied once the Head of Treasury approves them."
      />

      <Card className="mb-5">
        <CardHeader
          title="Upload a file"
          description={spec.description}
          actions={
            <Button icon={Download} onClick={template}>
              Download template
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Register" hint="What the file contains">
              <Select
                value={register}
                onChange={(e) => {
                  setRegister(e.target.value as ImportRegister);
                  setStaged(null);
                }}
                options={IMPORT_REGISTERS.map((r) => ({
                  value: r,
                  label: IMPORT_SPECS[r].label,
                }))}
              />
            </Field>
            <Field label="File" hint="CSV or Excel (.xlsx)">
              <input
                ref={fileInput}
                type="file"
                accept={IMPORT_ACCEPT}
                aria-label="Choose a file to import"
                onChange={(e) => void choose(e.target.files?.[0])}
                className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-fg"
              />
            </Field>
          </div>

          <div className="rounded-md border border-border">
            <p className="border-b border-border px-3 py-2 text-[13px] font-semibold">
              Columns this file needs
            </p>
            <ul className="divide-y divide-border">
              {spec.columns.map((c) => (
                <li
                  key={c.key}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5"
                >
                  <span className="text-[13px]">
                    {c.label}
                    {c.required ? <span className="text-st-danger-fg"> *</span> : null}
                    {c.hint ? <span className="block text-xs text-muted">{c.hint}</span> : null}
                  </span>
                  <span className="num text-xs text-muted">{c.example}</span>
                </li>
              ))}
            </ul>
          </div>

          {staged ? (
            staged.missingColumns.length ? (
              <InlineAlert tone="danger" title="The file is missing required columns">
                {staged.missingColumns.join(', ')}. Download the template and use its column
                headings.
              </InlineAlert>
            ) : (
              <div className="space-y-3">
                <InlineAlert
                  tone={staged.rejected.length ? 'warning' : 'success'}
                  title={`${staged.rows.length} row(s) ready to import from ${staged.fileName}`}
                >
                  {staged.rejected.length
                    ? `${staged.rejected.length} row(s) will be left out because they did not pass the checks.`
                    : 'Every row passed the checks.'}
                </InlineAlert>
                {staged.rejected.length ? (
                  <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                    <ul className="divide-y divide-border text-[13px]">
                      {staged.rejected.slice(0, 50).map((r) => (
                        <li key={r.line} className="px-3 py-1.5">
                          <span className="num font-medium">Line {r.line}</span>{' '}
                          <span className="text-st-danger-fg">{r.errors.join('; ')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {staged.rows.length ? (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-[13px]">
                      <thead className="bg-surface-2">
                        <tr>
                          {spec.columns.map((c) => (
                            <th
                              key={c.key}
                              className="whitespace-nowrap px-3 py-1.5 text-left font-medium"
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {staged.rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-t border-border">
                            {spec.columns.map((c) => (
                              <td key={c.key} className="whitespace-nowrap px-3 py-1.5">
                                {row[c.key] ?? '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {staged.rows.length > 5 ? (
                      <p className="border-t border-border px-3 py-1.5 text-xs text-muted">
                        Showing the first 5 of {staged.rows.length} rows.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={() => setStaged(null)}>Discard</Button>
                  <Button
                    variant="primary"
                    icon={Upload}
                    loading={busy}
                    disabledReason={staged.rows.length ? null : 'No valid rows to import'}
                    onClick={() => void upload()}
                  >
                    {me?.roleCode === 'HT'
                      ? `Import ${staged.rows.length} row(s)`
                      : `Send ${staged.rows.length} row(s) for approval`}
                  </Button>
                </div>
              </div>
            )
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Import history" description="Every upload, who decided it and when." />
        {q.loading ? (
          <CardBody>
            <SkeletonRows rows={4} />
          </CardBody>
        ) : q.error ? (
          <CardBody>
            <ErrorState error={q.error} onRetry={q.reload} />
          </CardBody>
        ) : q.data?.items.length ? (
          <DataTable rows={q.data.items} columns={columns} rowKey={(r) => r.id} />
        ) : (
          <CardBody>
            <EmptyState
              title="Nothing imported yet"
              description="Uploaded files appear here with their status."
            />
          </CardBody>
        )}
      </Card>

      <SignatureModal
        open={decide !== null}
        onClose={() => setDecide(null)}
        title={decide?.action === 'REJECT' ? 'Reject this import' : 'Approve this import'}
        description={
          decide?.action === 'REJECT'
            ? 'Nothing is written. Give the uploader a reason.'
            : `${decide?.row.rows.length ?? 0} row(s) will be written to ${decide ? IMPORT_SPECS[decide.row.register].label.toLowerCase() : ''}.`
        }
        actionLabel={decide?.action === 'REJECT' ? 'Reject import' : 'Approve & import'}
        withComment
        onSign={async (sig) => {
          if (!decide) return;
          const b = await importsService.decide(
            decide.row.id,
            decide.action,
            sig,
            decide.row.version
          );
          toast.success(
            decide.action === 'REJECT' ? `${b.batchRef} rejected` : `${b.batchRef} imported`,
            decide.action === 'REJECT'
              ? ''
              : `${b.createdCount} record(s) created${b.skippedRows.length ? `, ${b.skippedRows.length} skipped` : ''}.`
          );
          setDecide(null);
          q.reload();
        }}
      />
    </div>
  );
}

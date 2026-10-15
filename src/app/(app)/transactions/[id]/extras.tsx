'use client';

import { useState } from 'react';
import { Printer, ShieldCheck, Upload } from 'lucide-react';
import { ROLE_LABELS, levelForStatus } from '@/domain/codes';
import { formatDateTime } from '@/lib/format';
import { transactionsService } from '@/services';
import type { NamedRecall, TxnDetail } from '@/services/transactionsService';
import type { SignatureChecks } from '@/services/workflow';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  InlineAlert,
  Modal,
  RadioGroup,
  Select,
  Textarea,
  buttonClass,
  toast,
  toastError,
} from '@/components/ui';
import { DocumentList, DocumentsInput, type DocItem } from '@/components/txn/Documents';
import { SignatureChecklist, SignatureComparison } from '@/components/txn/SignatureCheck';

const NO_CHECKS: SignatureChecks = {
  sigOk: false,
  mandateOk: false,
  ownershipOk: false,
  completeOk: false,
};

/** Internal Audit re-verifies the signature with the same view the Treasury Officer had. */
export function AuditVerifyModal({
  d,
  open,
  onClose,
}: {
  d: TxnDetail;
  open: boolean;
  onClose: () => void;
}) {
  const [c, setC] = useState<SignatureChecks>(NO_CHECKS);
  const [busy, setBusy] = useState(false);
  const all = c.sigOk && c.mandateOk && c.ownershipOk && c.completeOk;
  const save = async () => {
    setBusy(true);
    try {
      await transactionsService.auditVerify(d.txn.id, c);
      toast.success('Signature re-verified', 'You can now approve and sign.');
      setC(NO_CHECKS);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Verify the signature"
      description="Check the instruction against the specimen signatures and the mandate, as the Treasury Officer did. If anything differs, return or reject the transaction instead."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={ShieldCheck}
            loading={busy}
            disabledReason={all ? null : 'Tick all four checks'}
            onClick={() => void save()}
          >
            Verified
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SignatureComparison detail={d} />
        <SignatureChecklist value={c} onChange={setC} />
      </div>
    </Modal>
  );
}

/**
 * The approver now waiting signed a printed voucher instead of signing in the app. The maker
 * uploads the scan and the step is recorded in the approver's name.
 */
export function PaperSignatureModal({
  d,
  open,
  onClose,
}: {
  d: TxnDetail;
  open: boolean;
  onClose: () => void;
}) {
  const level = levelForStatus(d.txn.status);
  const [signedBy, setSignedBy] = useState('');
  const [reason, setReason] = useState('');
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const voucher = d.vouchers[0];
  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      await transactionsService.recordPaperApproval(
        d.txn.id,
        {
          signedBy,
          reason,
          documents: docs.map(({ fileName, mimeType, sizeBytes, dataUrl }) => ({
            fileName,
            mimeType,
            sizeBytes,
            dataUrl,
          })),
        },
        d.txn.version
      );
      toast.success(
        `${level?.label} signature recorded`,
        'Signed on paper; the scan is attached to the transaction.'
      );
      setSignedBy('');
      setReason('');
      setDocs([]);
      onClose();
    } catch (e) {
      const fe = (e as { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fe && Object.keys(fe).length) setErrors(fe);
      else toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Record a paper signature — ${level?.label ?? ''}`}
      description="Use this when the approver cannot sign in TreasuryDesk: print the voucher, have them sign it by hand, then upload the signed copy here."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Upload} loading={busy} onClick={() => void save()}>
            Record signature
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {voucher ? (
          <a
            href={`/vouchers/${voucher.id}/print`}
            target="_blank"
            rel="noopener"
            className={buttonClass('secondary', 'sm')}
          >
            <Printer size={16} strokeWidth={1.75} aria-hidden /> Print the voucher to sign
          </a>
        ) : null}
        <Field label="Who signed" required error={errors.signedBy}>
          <Select
            value={signedBy}
            placeholder={`Choose the ${level?.label ?? 'approver'}…`}
            onChange={(e) => setSignedBy(e.target.value)}
            options={d.paperSigners.map((u) => ({ value: u.id, label: u.fullName }))}
          />
        </Field>
        <Field
          label="Why it was signed on paper"
          required
          error={errors.reason}
          hint="Recorded with the signature and in the audit trail"
        >
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">Signed voucher</p>
          <DocumentsInput
            value={docs}
            onChange={setDocs}
            label="Upload the signed copy"
            error={errors.documents}
          />
        </div>
      </div>
    </Modal>
  );
}

/** The maker answers a recall request: back to themselves, back to the person who asked, or no. */
export function DecideRecallModal({
  request,
  onClose,
}: {
  request: NamedRecall | null;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<'TO_MAKER' | 'TO_REQUESTER' | 'DECLINE'>('TO_MAKER');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = request;
  const save = async () => {
    if (!r) return;
    setBusy(true);
    setError(null);
    try {
      await transactionsService.decideRecall(r.id, choice, note);
      toast.success(
        choice === 'DECLINE'
          ? 'Recall request declined'
          : choice === 'TO_MAKER'
            ? 'Recalled to you'
            : `Sent back to ${r.requestedByName}`
      );
      setNote('');
      setChoice('TO_MAKER');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!r}
      onClose={onClose}
      title="Answer the recall request"
      description={r ? `${r.requestedByName} (${r.requestedByRole}): ${r.reason}` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={choice === 'DECLINE' ? 'danger' : 'primary'}
            loading={busy}
            disabledReason={
              choice === 'DECLINE' && !note.trim() ? 'Say why you are declining' : null
            }
            onClick={() => void save()}
          >
            {choice === 'DECLINE' ? 'Decline' : 'Recall'}
          </Button>
        </>
      }
    >
      {r ? (
        <div className="space-y-4">
          <RadioGroup<'TO_MAKER' | 'TO_REQUESTER' | 'DECLINE'>
            name="recall-choice"
            label="What happens to it"
            value={choice}
            onChange={setChoice}
            options={[
              {
                value: 'TO_MAKER',
                label: 'Bring it back to me',
                description:
                  'It becomes editable; when you resubmit it goes through every level again.',
              },
              {
                value: 'TO_REQUESTER',
                label: `Send it back to ${r.requestedByName}`,
                description:
                  r.toRequesterBlocker ??
                  'They decide on it again; signatures from their level on are set aside.',
                disabled: !!r.toRequesterBlocker,
              },
              { value: 'DECLINE', label: 'Decline the request' },
            ]}
          />
          <Field
            label={choice === 'DECLINE' ? 'Reason' : 'Note (optional)'}
            required={choice === 'DECLINE'}
          >
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
        </div>
      ) : null}
    </Modal>
  );
}

/** Every document on the transaction, grouped, with supporting documents anyone can add. */
export function DocumentsPanel({ d, onChanged }: { d: TxnDetail; onChanged: () => void }) {
  const [adding, setAdding] = useState<DocItem[]>([]);
  const [busy, setBusy] = useState(false);
  const group = (kind: 'INSTRUCTION' | 'SUPPORTING' | 'PAPER_SIGNATURE') =>
    d.attachments
      .filter((a) => a.kind === kind)
      .map((a) => ({
        ...a,
        caption: `${a.uploadedByName} · ${formatDateTime(a.uploadedAt)}`,
        removable: kind === 'SUPPORTING' && a.mine,
      }));
  const supporting = group('SUPPORTING');
  const save = async () => {
    setBusy(true);
    try {
      await transactionsService.addDocuments(
        d.txn.id,
        adding.map(({ fileName, mimeType, sizeBytes, dataUrl }) => ({
          fileName,
          mimeType,
          sizeBytes,
          dataUrl,
        }))
      );
      toast.success(`${adding.length} document(s) added`);
      setAdding([]);
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const paper = d.approvals.filter((a) => a.channel === 'PAPER');
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Instruction documents" />
        <CardBody>
          <DocumentList items={group('INSTRUCTION')} empty="No instruction documents attached." />
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Supporting documents"
          description="Anyone working on the transaction can add documents, several at a time."
        />
        <CardBody className="space-y-4">
          <DocumentList
            items={supporting}
            empty="No supporting documents yet."
            onRemove={(i) => {
              const doc = supporting[i];
              transactionsService
                .removeDocument(doc.id)
                .then(() => {
                  toast.success(`${doc.fileName} removed`);
                  onChanged();
                })
                .catch(toastError);
            }}
          />
          {!d.actions.addDocuments ? (
            <div className="space-y-2 border-t border-border pt-4">
              <DocumentsInput value={adding} onChange={setAdding} label="Choose documents" />
              {adding.length ? (
                <div className="flex justify-end">
                  <Button variant="primary" loading={busy} onClick={() => void save()}>
                    Add {adding.length} document(s)
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>
      {paper.length ? (
        <Card>
          <CardHeader
            title="Paper signatures"
            description="Approvers who signed a printed voucher; the scan was uploaded by the maker."
          />
          <CardBody className="space-y-4">
            {paper.map((p) => (
              <div key={p.id} className="space-y-2">
                <p className="text-[13px]">
                  <span className="font-medium">{p.userName}</span> · {ROLE_LABELS[p.roleCode]} ·{' '}
                  {formatDateTime(p.actedAt)}
                  <span className="block text-muted">{p.comments}</span>
                </p>
                <DocumentList
                  items={d.attachments
                    .filter((a) => a.approvalId === p.id)
                    .map((a) => ({ ...a, caption: `uploaded by ${a.uploadedByName}` }))}
                />
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

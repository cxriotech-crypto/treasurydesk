'use client';

import { useRef, useState } from 'react';
import { FileText, FileUp, Image as ImageIcon, Trash2 } from 'lucide-react';
import type { AttachmentInput } from '@/services/workflow';
import { Button } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { DocumentPreview } from './Specimen';

/** A file shown in a list: one being chosen now, or one already attached. */
export interface DocItem extends AttachmentInput {
  /** Extra line under the name, e.g. who uploaded it. */
  caption?: string;
  /** Whether the person looking can remove it. */
  removable?: boolean;
}

export const MAX_DOC_BYTES = 1024 * 1024;
const ACCEPT = 'application/pdf,image/png,image/jpeg';
const TYPES = /^(application\/pdf|image\/(png|jpeg))$/;

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Read chosen files into data URLs, rejecting the wrong type or anything over 1 MB. */
export async function readFiles(
  files: FileList | File[]
): Promise<{ ok: AttachmentInput[]; errors: string[] }> {
  const ok: AttachmentInput[] = [];
  const errors: string[] = [];
  for (const f of Array.from(files)) {
    if (!TYPES.test(f.type)) {
      errors.push(`${f.name}: use a PDF, PNG or JPEG`);
      continue;
    }
    if (f.size > MAX_DOC_BYTES) {
      errors.push(`${f.name} is larger than 1 MB`);
      continue;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error(`${f.name} could not be read`));
      r.readAsDataURL(f);
    });
    ok.push({ fileName: f.name, mimeType: f.type, sizeBytes: f.size, dataUrl });
  }
  return { ok, errors };
}

/**
 * A list of documents with a preview of the one selected. Several can be added at once; each can be
 * removed when the caller allows it.
 */
export function DocumentList({
  items,
  onRemove,
  empty = 'No documents attached.',
}: {
  items: DocItem[];
  onRemove?: (index: number) => void;
  empty?: string;
}) {
  const [selected, setSelected] = useState(0);
  const current = items[Math.min(selected, items.length - 1)];
  if (!items.length) return <p className="text-[13px] text-muted">{empty}</p>;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <ul className="divide-y divide-border rounded-md border border-border" aria-label="Documents">
        {items.map((d, i) => {
          const Icon = d.mimeType.startsWith('image/') ? ImageIcon : FileText;
          const active = d === current;
          return (
            <li key={`${d.id ?? 'new'}-${i}`} className="flex items-center gap-1 pr-1">
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-2',
                  active && 'bg-surface-2'
                )}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{d.fileName}</span>
                  <span className="block text-xs text-muted">
                    {sizeLabel(d.sizeBytes)}
                    {d.caption ? ` · ${d.caption}` : ''}
                  </span>
                </span>
              </button>
              {onRemove && d.removable !== false ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  aria-label={`Remove ${d.fileName}`}
                  onClick={() => {
                    onRemove(i);
                    setSelected(0);
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {current ? <DocumentPreview name={current.fileName} data={current.dataUrl} /> : null}
    </div>
  );
}

/** Choose several files at once and keep them in a list, with previews. */
export function DocumentsInput({
  value,
  onChange,
  label = 'Add documents',
  error,
}: {
  value: DocItem[];
  onChange: (next: DocItem[]) => void;
  label?: string;
  error?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const { ok, errors } = await readFiles(files);
    setProblems(errors);
    if (ok.length) onChange([...value, ...ok.map((f) => ({ ...f, removable: true }))]);
    if (input.current) input.current.value = '';
  };
  return (
    <div className="space-y-2">
      <DocumentList
        items={value}
        onRemove={(i) => onChange(value.filter((_, j) => j !== i))}
        empty="Nothing attached yet."
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          aria-label={label}
          onChange={(e) => void add(e.target.files)}
        />
        <Button icon={FileUp} onClick={() => input.current?.click()}>
          {label}
        </Button>
        <span className="text-xs text-muted">
          PDF, PNG or JPEG · up to 1 MB each · several at once
        </span>
      </div>
      {[...problems, ...(error ? [error] : [])].map((p) => (
        <p key={p} className="text-xs font-medium text-st-danger-fg">
          {p}
        </p>
      ))}
    </div>
  );
}

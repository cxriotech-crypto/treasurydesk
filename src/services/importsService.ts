import type { ImportBatch, ListQuery, ListResult } from '@/domain/types';
import { getDb } from '@/data/store';
import { paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, requireUser, run } from './core';
import { userName } from './transactionsService';
import * as wf from './workflow';

export interface ImportRow extends ImportBatch {
  uploadedByName: string;
  decidedByName: string | null;
  /** Why the signed-in user cannot decide this batch, or null. */
  blocker: string | null;
}

export interface ImportsService {
  list(q?: ListQuery<{ search?: string }>): Promise<ListResult<ImportRow>>;
  create(draft: wf.ImportDraft): Promise<ImportBatch>;
  decide(
    batchId: string,
    decision: 'APPROVE' | 'REJECT',
    sign: wf.SignArgs,
    version?: number
  ): Promise<ImportBatch>;
}

const UPLOADERS = ['TO', 'HT'] as const;

export const mockImportsService: ImportsService = {
  list: (q = {}) =>
    run(() => {
      const u = requireUser([...UPLOADERS]);
      const db = getDb();
      const search = (q.filters?.search ?? '').toLowerCase();
      const rows: ImportRow[] = db.imports
        .filter(
          (b) =>
            !search ||
            b.batchRef.toLowerCase().includes(search) ||
            b.fileName.toLowerCase().includes(search)
        )
        .map((b) => ({
          ...b,
          uploadedByName: userName(db, b.uploadedBy),
          decidedByName: b.decidedBy ? userName(db, b.decidedBy) : null,
          blocker:
            b.status !== 'PENDING_APPROVAL'
              ? 'Already decided'
              : u.roleCode !== 'HT'
                ? 'Only the Head of Treasury approves an import'
                : b.uploadedBy === u.id
                  ? 'Maker-checker: you uploaded this file'
                  : null,
        }));
      return paginate(rows, { sort: { field: 'uploadedAt', dir: 'desc' }, ...q });
    }),
  create: (draft) => run(() => wf.createImport(ctx([...UPLOADERS]), draft)),
  decide: (batchId, decision, sign, version) =>
    run(() => wf.decideImport(ctx(['HT']), batchId, decision, sign, version)),
};

export const httpImportsService: ImportsService = {
  list: (q) => http.get('/imports', q as Record<string, unknown>),
  create: (draft) => http.post('/imports', draft as unknown as Record<string, unknown>),
  decide: (batchId, decision, sign, version) =>
    http.post(`/imports/${batchId}/decide`, { decision, ...sign, version }),
};

export const importsService: ImportsService = USE_MOCK ? mockImportsService : httpImportsService;

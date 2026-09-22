import type { AppUser, ListQuery, ListResult } from '@/domain/types';
import { ROLE_CODES, ROLE_LABELS, type RecordStatus, type RoleCode } from '@/domain/codes';
import { getDb, mutate } from '@/data/store';
import { AppError, getById, matchesSearch, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, run } from './core';
import { auditedInsert, auditedUpdate, fieldErrors } from './crud';

export interface UserFilters {
  search?: string;
  roleCode?: RoleCode;
  status?: RecordStatus;
}

export interface UserInput {
  fullName: string;
  email: string;
  roleCode: RoleCode;
  staffId: string;
}

/** Permissions matrix shown in Settings → Users & roles (read-only; enforced in services). */
export const PERMISSIONS: { capability: string; roles: RoleCode[] }[] = [
  { capability: 'Create transactions and raise vouchers', roles: ['TO'] },
  { capability: 'Signature verification and Eazybankz check', roles: ['TO'] },
  { capability: 'Log customer call-backs', roles: ['TO', 'AO'] },
  { capability: 'Approve level 2 (Head, Treasury)', roles: ['HT'] },
  { capability: 'Approve level 3 (MIS)', roles: ['MIS'] },
  { capability: 'Approve level 4 (Internal Audit)', roles: ['AUD'] },
  { capability: 'Approve level 5 (Managing Director)', roles: ['MD'] },
  { capability: 'Execute in Eazybankz / GAPS', roles: ['OPS'] },
  { capability: 'Confirm completion and raise reversals', roles: ['TO'] },
  { capability: 'Edit customers and signatories', roles: ['TO', 'ADM'] },
  { capability: 'Manage beneficiaries', roles: ['TO'] },
  { capability: 'Manage accounts', roles: ['ADM'] },
  { capability: 'View reports', roles: ['HT', 'MIS', 'AUD', 'MD', 'ADM'] },
  { capability: 'View audit trail', roles: ['AUD', 'MD', 'ADM'] },
  { capability: 'Run calculation self-check', roles: ['AUD', 'ADM'] },
  { capability: 'Users, settings, banks, holidays, integrations', roles: ['ADM'] },
];

export interface UsersService {
  list(q?: ListQuery<UserFilters>): Promise<ListResult<AppUser>>;
  get(id: string): Promise<AppUser>;
  create(input: UserInput): Promise<AppUser>;
  update(
    id: string,
    input: Partial<UserInput> & { status?: RecordStatus },
    version: number
  ): Promise<AppUser>;
  setStatus(id: string, status: RecordStatus, version: number): Promise<AppUser>;
}

function validate(input: Partial<UserInput>, selfId?: string) {
  const errors: Record<string, string> = {};
  if ('fullName' in input && !input.fullName?.trim()) errors.fullName = 'Full name is required';
  if ('email' in input) {
    if (!input.email?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email))
      errors.email = 'Enter a valid email address';
    else if (
      getDb().users.some(
        (u) => u.id !== selfId && u.email.toLowerCase() === input.email!.trim().toLowerCase()
      )
    ) {
      errors.email = 'Another user already has this email';
    }
  }
  if ('roleCode' in input && !ROLE_CODES.includes(input.roleCode as RoleCode))
    errors.roleCode = 'Choose a role';
  if ('staffId' in input) {
    if (!input.staffId?.trim()) errors.staffId = 'Staff ID is required';
    else if (getDb().users.some((u) => u.id !== selfId && u.staffId === input.staffId!.trim()))
      errors.staffId = 'Staff ID is already in use';
  }
  fieldErrors(errors);
}

export const mockUsersService: UsersService = {
  list: (q = {}) =>
    run(() => {
      const f = q.filters ?? {};
      const rows = getDb().users.filter(
        (u) =>
          matchesSearch(f.search, u.fullName, u.email, u.staffId, ROLE_LABELS[u.roleCode]) &&
          (!f.roleCode || u.roleCode === f.roleCode) &&
          (!f.status || u.status === f.status)
      );
      return paginate(rows, { sort: { field: 'fullName', dir: 'asc' }, ...q });
    }),
  get: (id) => run(() => getById(getDb(), 'users', id, 'user')),
  create: (input) =>
    run(() => {
      const c = ctx(['ADM']);
      validate(input);
      return mutate((db) =>
        auditedInsert(
          db,
          c,
          'users',
          {
            ...input,
            fullName: input.fullName.trim(),
            email: input.email.trim(),
            staffId: input.staffId.trim(),
            status: 'ACTIVE',
            lastLoginAt: null,
            createdAt: c.at,
          },
          'AppUser',
          (u) => `User ${u.fullName} created as ${ROLE_LABELS[u.roleCode]}`
        )
      );
    }),
  update: (id, input, version) =>
    run(() => {
      const c = ctx(['ADM']);
      validate(input, id);
      if (id === c.userId && input.status === 'INACTIVE')
        throw new AppError('You cannot deactivate yourself.', 'VALIDATION');
      if (id === c.userId && input.roleCode && input.roleCode !== 'ADM')
        throw new AppError('You cannot remove your own admin role.', 'VALIDATION');
      return mutate((db) =>
        auditedUpdate(
          db,
          c,
          'users',
          id,
          input,
          version,
          'AppUser',
          (u) => `User ${u.fullName} updated`
        )
      );
    }),
  setStatus: (id, status, version) =>
    run(() => {
      const c = ctx(['ADM']);
      if (id === c.userId && status === 'INACTIVE')
        throw new AppError('You cannot deactivate yourself.', 'VALIDATION');
      return mutate((db) =>
        auditedUpdate(
          db,
          c,
          'users',
          id,
          { status },
          version,
          'AppUser',
          (u) => `User ${u.fullName} ${status === 'ACTIVE' ? 'reactivated' : 'deactivated'}`,
          status === 'ACTIVE' ? 'REACTIVATE' : 'DEACTIVATE'
        )
      );
    }),
};

export const httpUsersService: UsersService = {
  list: (q) => http.get('/users', q as Record<string, unknown>),
  get: (id) => http.get(`/users/${id}`),
  create: (input) => http.post('/users', input),
  update: (id, input, version) => http.put(`/users/${id}`, { ...input, version }),
  setStatus: (id, status, version) => http.patch(`/users/${id}/status`, { status, version }),
};

export const usersService: UsersService = USE_MOCK ? mockUsersService : httpUsersService;

import React from 'react';
import { STATUS_LABELS } from '@/types';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const STATUS_STYLES: Record<string, string> = {
  // Transaction statuses
  DRAFT: 'bg-gray-100 text-gray-600 border-gray-200',
  VERIFICATION: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING_VERIFY: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING_CALLBACK: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING_CBS: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING_VOUCHER: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING_TO: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING_HT: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING_HEAD_TREASURY: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING_MIS: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING_AUDIT: 'bg-purple-50 text-purple-700 border-purple-200',
  PENDING_MD: 'bg-purple-50 text-purple-700 border-purple-200',
  PENDING_OPS: 'bg-orange-50 text-orange-700 border-orange-200',
  PENDING_OPERATIONS: 'bg-orange-50 text-orange-700 border-orange-200',
  EXEC_FAILED: 'bg-red-50 text-red-700 border-red-200',
  EXECUTED: 'bg-teal-50 text-teal-700 border-teal-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
  CONFIRMED: 'bg-green-50 text-green-700 border-green-200',
  RETURNED: 'bg-amber-50 text-amber-700 border-amber-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
  CLOSED: 'bg-gray-100 text-gray-500 border-gray-200',
  STOPPED: 'bg-red-50 text-red-700 border-red-200',
  // Investment statuses
  ACTIVE: 'bg-green-50 text-green-700 border-green-200',
  MATURED: 'bg-amber-50 text-amber-700 border-amber-200',
  AWAITING_INSTRUCTION: 'bg-orange-50 text-orange-700 border-orange-200',
  ROLLED: 'bg-blue-50 text-blue-700 border-blue-200',
  TERMINATED: 'bg-gray-100 text-gray-600 border-gray-200',
};

const INVESTMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  MATURED: 'Matured',
  AWAITING_INSTRUCTION: 'Awaiting Instruction',
  ROLLED: 'Rolled Over',
  TERMINATED: 'Terminated',
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  const label = STATUS_LABELS[status] ?? INVESTMENT_STATUS_LABELS[status] ?? status;
  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold tracking-wide whitespace-nowrap ${sizeClass} ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
    >
      {label}
    </span>
  );
}
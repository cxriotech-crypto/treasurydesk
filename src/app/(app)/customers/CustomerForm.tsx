'use client';

import { useEffect, useRef, useState } from 'react';
import type { Customer } from '@/domain/types';
import type { CustomerType } from '@/domain/codes';
import { AppError, customersService, usersService } from '@/services';
import { useData } from '@/services/useData';
import {
  Button,
  Field,
  InlineAlert,
  Input,
  Modal,
  RadioGroup,
  Select,
  Switch,
  Textarea,
  toast,
} from '@/components/ui';

/** Create / edit a customer. On create it also opens SS and PA accounts and a first signatory. */
export function CustomerForm({
  open,
  onClose,
  customer,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onSaved?: (c: Customer) => void;
}) {
  const editing = !!customer;
  const aos = useData(
    () => usersService.list({ filters: { roleCode: 'AO', status: 'ACTIVE' } }),
    []
  );
  const [f, setF] = useState({
    customerName: '',
    customerType: 'IND' as CustomerType,
    regPhone: '',
    email: '',
    address: '',
    bvn: '',
    whtExempt: false,
    accountOfficerId: '',
    signatoryName: '',
    signClass: 'A' as 'A' | 'B',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Fill the form once, when the dialog opens. A background refresh of the customer must never
  // overwrite what the user is typing.
  const filled = useRef(false);
  useEffect(() => {
    if (!open) {
      filled.current = false;
      return;
    }
    if (filled.current) return;
    filled.current = true;
    setErrors({});
    setF({
      customerName: customer?.customerName ?? '',
      customerType: customer?.customerType ?? 'IND',
      regPhone: customer?.regPhone ?? '',
      email: customer?.email ?? '',
      address: customer?.address ?? '',
      bvn: '',
      whtExempt: customer?.whtExempt ?? false,
      accountOfficerId: customer?.accountOfficerId ?? '',
      signatoryName: '',
      signClass: 'A',
    });
  }, [open, customer]);

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const input = {
        customerName: f.customerName,
        customerType: f.customerType,
        regPhone: f.regPhone,
        email: f.email,
        address: f.address,
        bvn: f.bvn || undefined,
        whtExempt: f.whtExempt,
        accountOfficerId: f.accountOfficerId,
      };
      const saved = editing
        ? await customersService.update(customer!.id, input, customer!.version)
        : await customersService.create({
            ...input,
            firstSignatory: { fullName: f.signatoryName, signClass: f.signClass },
          });
      toast.success(
        editing ? 'Customer updated' : `Customer ${saved.cifNo} created`,
        editing ? undefined : 'Savings and Personal accounts opened.'
      );
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setErrors(
        e instanceof AppError && Object.keys(e.fieldErrors).length
          ? e.fieldErrors
          : { form: (e as Error).message }
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${customer!.customerName}` : 'New customer'}
      description={editing ? customer!.cifNo : 'A CIF number is assigned automatically.'}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {editing ? 'Save changes' : 'Create customer'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Customer name" required error={errors.customerName} className="sm:col-span-2">
          <Input
            data-autofocus
            value={f.customerName}
            onChange={(e) => setF({ ...f, customerName: e.target.value })}
          />
        </Field>
        <RadioGroup<CustomerType>
          name="ctype"
          label="Customer type"
          orientation="horizontal"
          value={f.customerType}
          onChange={(v) => setF({ ...f, customerType: v })}
          options={[
            { value: 'IND', label: 'Individual' },
            { value: 'CORP', label: 'Corporate' },
          ]}
        />
        <Field label="Account Officer" required error={errors.accountOfficerId}>
          <Select
            value={f.accountOfficerId}
            placeholder="Choose an officer…"
            onChange={(e) => setF({ ...f, accountOfficerId: e.target.value })}
            options={(aos.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
          />
        </Field>
        <Field label="Registered phone" required error={errors.regPhone} hint="Used for call-backs">
          <Input
            inputMode="tel"
            placeholder="+234 803 123 4567"
            value={f.regPhone}
            onChange={(e) => setF({ ...f, regPhone: e.target.value })}
          />
        </Field>
        <Field label="Email" required error={errors.email}>
          <Input
            type="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </Field>
        <Field label="Address" required error={errors.address} className="sm:col-span-2">
          <Textarea
            rows={2}
            value={f.address}
            onChange={(e) => setF({ ...f, address: e.target.value })}
          />
        </Field>
        <Field
          label="BVN"
          required={!editing}
          error={errors.bvn}
          hint={editing ? 'Leave empty to keep the BVN on file' : ' 11 digits; stored masked'}
        >
          <Input
            inputMode="numeric"
            maxLength={11}
            value={f.bvn}
            onChange={(e) => setF({ ...f, bvn: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
        <div className="flex items-end">
          <Switch
            checked={f.whtExempt}
            onChange={(v) => setF({ ...f, whtExempt: v })}
            label="WHT exempt"
            description="No withholding tax on interest"
          />
        </div>
        {!editing ? (
          <>
            <Field label="First signatory" required error={errors.signatoryName || errors.fullName}>
              <Input
                value={f.signatoryName}
                onChange={(e) => setF({ ...f, signatoryName: e.target.value })}
              />
            </Field>
            <Field label="Signature class">
              <Select
                value={f.signClass}
                onChange={(e) => setF({ ...f, signClass: e.target.value as 'A' | 'B' })}
                options={[
                  { value: 'A', label: 'Class A' },
                  { value: 'B', label: 'Class B' },
                ]}
              />
            </Field>
          </>
        ) : null}
        {errors.form ? (
          <div className="sm:col-span-2">
            <InlineAlert tone="danger">{errors.form}</InlineAlert>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check, UserPlus, Edit2 } from 'lucide-react';
import { customerService } from '@/services/customerService';

import AppLayout from '@/components/AppLayout';
import type { Customer } from '@/types';


interface FormData {
  name: string;
  customerType: 'INDIVIDUAL' | 'CORPORATE';
  phone: string;
  email: string;
  bvn: string;
  accountOfficerName: string;
  isWhtExempt: boolean;
  kycStatus: 'VERIFIED' | 'PENDING' | 'EXPIRED';
}

interface FormErrors {
  name?: string;
  customerType?: string;
  phone?: string;
  email?: string;
  bvn?: string;
  accountOfficerName?: string;
}

function validateForm(data: FormData): FormErrors {
  const errors: FormErrors = {};
  if (!data.name.trim() || data.name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
  if (!data.customerType) errors.customerType = 'Customer type is required';
  if (!data.phone.trim()) {
    errors.phone = 'Phone number is required';
  } else if (!/^\+234[789]\d{9}$/.test(data.phone.replace(/\s/g, ''))) {
    errors.phone = 'Must be a valid Nigerian number (+234XXXXXXXXXX)';
  }
  if (!data.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Invalid email address';
  }
  if (!data.bvn.trim()) {
    errors.bvn = 'BVN is required';
  } else if (!/^\d{3}\*{4}\d{4}$/.test(data.bvn) && !/^\d{11}$/.test(data.bvn)) {
    errors.bvn = 'Enter BVN (11 digits or masked format 221****4589)';
  }
  if (!data.accountOfficerName.trim()) errors.accountOfficerName = 'Account officer is required';
  return errors;
}

function CustomerFormContent({ customerId }: { customerId?: string }) {
  const router = useRouter();
  const isEdit = !!customerId;

  const [formData, setFormData] = useState<FormData>({
    name: '',
    customerType: 'INDIVIDUAL',
    phone: '+234',
    email: '',
    bvn: '',
    accountOfficerName: 'Tunde Bakare',
    isWhtExempt: false,
    kycStatus: 'PENDING',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!isEdit || !customerId) return;
    customerService.getById(customerId).then((c) => {
      if (c) {
        setFormData({
          name: c.name,
          customerType: c.customerType,
          phone: c.phone,
          email: c.email,
          bvn: c.bvn,
          accountOfficerName: c.accountOfficerName,
          isWhtExempt: c.isWhtExempt,
          kycStatus: c.kycStatus,
        });
      }
      setLoading(false);
    });
  }, [customerId, isEdit]);

  function handleChange(field: keyof FormData, value: string | boolean) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateForm(formData);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      if (isEdit && customerId) {
        await customerService.update(customerId, formData);
        setToast({ type: 'success', message: 'Customer updated successfully' });
        setTimeout(() => router.push(`/customers/${customerId}`), 1200);
      } else {
        const newCust = await customerService.create({
          ...formData,
          accountOfficerId: 'usr-002',
          isActive: true,
        });
        setToast({ type: 'success', message: 'Customer created successfully' });
        setTimeout(() => router.push(`/customers/${newCust.id}`), 1200);
      }
    } catch {
      setToast({ type: 'error', message: 'Failed to save customer. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-accent" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2
          ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <Check size={14} /> : null}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            {isEdit ? <Edit2 size={15} className="text-accent" /> : <UserPlus size={15} className="text-accent" />}
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-none">{isEdit ? 'Edit Customer' : 'Add Customer'}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{isEdit ? 'Update customer information' : 'Register a new customer'}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card rounded-xl border border-border p-6 space-y-5">
        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">Full Name / Company Name <span className="text-red-500">*</span></label>
          <input
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g. Chukwuemeka Obi or Okafor & Sons Ltd"
            className={`input-field text-sm ${errors.name ? 'border-red-500' : ''}`}
          />
          {errors.name && <p className="text-[10px] text-red-600 mt-1">{errors.name}</p>}
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">Customer Type <span className="text-red-500">*</span></label>
          <div className="flex gap-3">
            {(['INDIVIDUAL', 'CORPORATE'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleChange('customerType', type)}
                className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold transition-all
                  ${formData.customerType === type
                    ? 'border-accent bg-accent/10 text-accent' :'border-border text-muted-foreground hover:border-accent/50'}`}
              >
                {type === 'INDIVIDUAL' ? 'Individual' : 'Corporate'}
              </button>
            ))}
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">Phone Number <span className="text-red-500">*</span></label>
          <input
            value={formData.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="+2348012345678"
            className={`input-field text-sm font-mono ${errors.phone ? 'border-red-500' : ''}`}
          />
          {errors.phone && <p className="text-[10px] text-red-600 mt-1">{errors.phone}</p>}
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">Email Address <span className="text-red-500">*</span></label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="customer@example.com"
            className={`input-field text-sm ${errors.email ? 'border-red-500' : ''}`}
          />
          {errors.email && <p className="text-[10px] text-red-600 mt-1">{errors.email}</p>}
        </div>

        {/* BVN */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">BVN <span className="text-red-500">*</span></label>
          <input
            value={formData.bvn}
            onChange={(e) => handleChange('bvn', e.target.value)}
            placeholder="221****4589 or 22100004589"
            className={`input-field text-sm font-mono ${errors.bvn ? 'border-red-500' : ''}`}
          />
          {errors.bvn && <p className="text-[10px] text-red-600 mt-1">{errors.bvn}</p>}
        </div>

        {/* Account Officer */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">Account Officer <span className="text-red-500">*</span></label>
          <select
            value={formData.accountOfficerName}
            onChange={(e) => handleChange('accountOfficerName', e.target.value)}
            className={`input-field text-sm ${errors.accountOfficerName ? 'border-red-500' : ''}`}
          >
            <option value="Tunde Bakare">Tunde Bakare</option>
            <option value="Adaeze Okonkwo">Adaeze Okonkwo</option>
            <option value="Ibrahim Musa">Ibrahim Musa</option>
          </select>
          {errors.accountOfficerName && <p className="text-[10px] text-red-600 mt-1">{errors.accountOfficerName}</p>}
        </div>

        {/* KYC Status */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">KYC Status</label>
          <select value={formData.kycStatus} onChange={(e) => handleChange('kycStatus', e.target.value)} className="input-field text-sm">
            <option value="VERIFIED">Verified</option>
            <option value="PENDING">Pending</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>

        {/* WHT Exempt */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
          <input
            type="checkbox"
            id="whtExempt"
            checked={formData.isWhtExempt}
            onChange={(e) => handleChange('isWhtExempt', e.target.checked)}
            className="w-4 h-4 rounded border-border text-accent"
          />
          <label htmlFor="whtExempt" className="text-sm font-medium text-foreground cursor-pointer">
            WHT Exempt
            <span className="block text-[10px] text-muted-foreground font-normal">Withholding tax will not be deducted from this customer's interest payments</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={() => router.back()} className="btn-secondary text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {isEdit ? 'Save Changes' : 'Create Customer'}
          </button>
        </div>
      </form>
    </div>
  );
}

// New Customer Page
export function NewCustomerPage() {
  return (
    <AppLayout allowedRoles={['TREASURY_OFFICER', 'SYSTEM_ADMIN']}>
      <CustomerFormContent />
    </AppLayout>
  );
}

// Edit Customer Page
export function EditCustomerPage({ customerId }: { customerId: string }) {
  return (
    <AppLayout allowedRoles={['TREASURY_OFFICER', 'SYSTEM_ADMIN']}>
      <CustomerFormContent customerId={customerId} />
    </AppLayout>
  );
}

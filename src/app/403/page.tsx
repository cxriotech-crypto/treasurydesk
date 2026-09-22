import React from 'react';
import Link from 'next/link';
import { ShieldOff } from 'lucide-react';

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
          <ShieldOff size={28} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your current role does not have permission to access this section of TreasuryDesk. Please contact your system administrator if you believe this is an error.
        </p>
        <Link href="/" className="btn-primary text-sm">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
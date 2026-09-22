import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import '../styles/tailwind.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'TreasuryDesk — First Marina Trust Finance',
  description:
    'End-to-end treasury operations workflow for First Marina Trust Finance Company Limited — from customer instruction to investment confirmation.',
  icons: { icon: [{ url: '/favicon.ico', type: 'image/x-icon' }] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <body className={plusJakarta.className}>
        {children}
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{
            style: { fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)' },
          }}
        />

        <script type="module" async src="https://static.rocket.new/rocket-web.js?_cfg=https%3A%2F%2Ftreasuryde6161back.builtwithrocket.new&_be=https%3A%2F%2Fappanalytics.rocket.new&_v=0.1.20" />
        <script type="module" defer src="https://static.rocket.new/rocket-shot.js?v=0.0.3" /></body>
    </html>
  );
}
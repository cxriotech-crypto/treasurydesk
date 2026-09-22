import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Gallery } from './Gallery';

export const metadata: Metadata = { title: 'Component gallery' };

/** Development-only component gallery (not part of the product; 404 in production builds). */
export default function UiGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Gallery />;
}

import { LinkButton } from '@/components/ui/Button';
import { Brand } from '@/components/shell/Brand';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Brand />
      <p className="num mt-10 text-sm font-semibold text-muted">404</p>
      <h1 className="mt-1 text-xl font-semibold">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        The page you are looking for does not exist or has moved.
      </p>
      <LinkButton href="/" variant="primary" className="mt-6">
        Back to TreasuryDesk
      </LinkButton>
    </main>
  );
}

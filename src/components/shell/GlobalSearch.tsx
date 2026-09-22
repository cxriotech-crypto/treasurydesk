'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import { scenarioLabel } from '@/domain/codes';
import { customersService, investmentsService, transactionsService } from '@/services';
import { isReady } from '@/app/routes';
import { formatDate } from '@/lib/format';
import { useClickOutside, useDebounced } from '@/components/hooks';
import { Icon, IconButton, Money, Portal, cn } from '@/components/ui';

interface Hit {
  key: string;
  group: 'Transactions' | 'Customers' | 'Investments';
  title: string;
  sub: string;
  amount?: string;
  href: string;
}

async function searchAll(q: string): Promise<Hit[]> {
  const [txns, custs, invs] = await Promise.all([
    transactionsService.list({ filters: { search: q }, pageSize: 5 }),
    customersService.list({ filters: { search: q }, pageSize: 5 }),
    investmentsService.list({ filters: { search: q }, pageSize: 5 }),
  ]);
  return [
    ...txns.items.map((t) => ({
      key: t.id,
      group: 'Transactions' as const,
      title: t.txnRef,
      sub: `${t.customerName} · ${scenarioLabel(t.scenarioCode)}`,
      amount: t.headlineAmt,
      href: `/transactions/${t.id}`,
    })),
    ...custs.items.map((c) => ({
      key: c.id,
      group: 'Customers' as const,
      title: c.customerName,
      sub: `${c.cifNo} · ${c.regPhone}`,
      href: `/customers/${c.id}`,
    })),
    ...invs.items.map((i) => ({
      key: i.id,
      group: 'Investments' as const,
      title: i.investmentRef,
      sub: `${i.customerName} · matures ${formatDate(i.maturityDate)}`,
      amount: i.principalAmt,
      href: `/investments/${i.id}`,
    })),
  ];
}

function Results({
  hits,
  loading,
  query,
  active,
  onPick,
}: {
  hits: Hit[];
  loading: boolean;
  query: string;
  active: number;
  onPick: () => void;
}) {
  if (query.trim().length < 2)
    return (
      <p className="px-3 py-3 text-[13px] text-muted">
        Type at least 2 characters: reference, customer name, CIF or phone.
      </p>
    );
  if (loading && !hits.length)
    return <p className="px-3 py-3 text-[13px] text-muted">Searching…</p>;
  if (!hits.length)
    return <p className="px-3 py-3 text-[13px] text-muted">No matches for “{query}”.</p>;
  const groups = ['Transactions', 'Customers', 'Investments'] as const;
  let idx = -1;
  return (
    <div className="py-1">
      {groups.map((g) => {
        const list = hits.filter((h) => h.group === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              {g}
            </p>
            <ul>
              {list.map((h) => {
                idx += 1;
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{h.title}</span>
                      <span className="block truncate text-xs text-muted">{h.sub}</span>
                    </span>
                    {h.amount ? (
                      <Money value={h.amount} compact className="shrink-0 text-[13px] text-muted" />
                    ) : null}
                  </>
                );
                const cls = cn(
                  'flex min-h-11 items-center gap-3 px-3 py-1.5',
                  idx === active && 'bg-surface-2'
                );
                return (
                  <li key={h.key} data-hit={idx}>
                    {isReady(h.href) ? (
                      <Link
                        href={h.href}
                        onClick={onPick}
                        className={cn(cls, 'hover:bg-surface-2')}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className={cls}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function useSearch() {
  const [query, setQuery] = useState('');
  const q = useDebounced(query, 200);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    let alive = true;
    setActive(-1);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    searchAll(q.trim()).then(
      (h) => {
        if (alive) {
          setHits(h);
          setLoading(false);
        }
      },
      () => alive && setLoading(false)
    );
    return () => {
      alive = false;
    };
  }, [q]);
  return { query, setQuery, hits, loading, active, setActive };
}

/** Top-bar search: inline field from 1024 px, icon + full-width overlay below. */
export function GlobalSearch() {
  const s = useSearch();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();
  useClickOutside([wrap], open, () => setOpen(false));

  const close = () => {
    setOpen(false);
    setMobileOpen(false);
    s.setQuery('');
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      s.setActive((a) => Math.min(a + 1, s.hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      s.setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && s.hits[s.active] && isReady(s.hits[s.active].href)) {
      e.preventDefault();
      router.push(s.hits[s.active].href);
      close();
    } else if (e.key === 'Escape') {
      close();
    }
  };

  const input = (autoFocus: boolean) => (
    <div className="relative w-full">
      <Icon
        icon={Search}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        role="combobox"
        aria-expanded={open || mobileOpen}
        aria-controls={listId}
        aria-label="Search transactions, customers and investments"
        placeholder="Search reference, customer, CIF…"
        autoFocus={autoFocus}
        value={s.query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          s.setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKey}
        className="h-10 w-full rounded-md border border-border-strong bg-surface pl-9 pr-3 text-sm placeholder:text-subtle focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/60 md:h-9"
      />
    </div>
  );

  return (
    <>
      <div ref={wrap} className="relative hidden w-full max-w-md lg:block">
        {input(false)}
        {open ? (
          <div
            id={listId}
            className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface shadow-pop"
          >
            <Results
              hits={s.hits}
              loading={s.loading}
              query={s.query}
              active={s.active}
              onPick={close}
            />
          </div>
        ) : null}
      </div>

      <IconButton
        icon={Search}
        label="Search"
        className="lg:hidden"
        onClick={() => setMobileOpen(true)}
      />
      {mobileOpen ? (
        <Portal>
          <div
            className="fixed inset-0 z-50 flex flex-col bg-surface lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            <div className="flex items-center gap-2 border-b border-border px-2 py-2">
              <IconButton icon={ArrowLeft} label="Close search" onClick={close} />
              {input(true)}
            </div>
            <div id={listId} className="min-h-0 flex-1 overflow-y-auto">
              <Results
                hits={s.hits}
                loading={s.loading}
                query={s.query}
                active={s.active}
                onPick={close}
              />
            </div>
          </div>
        </Portal>
      ) : null}
    </>
  );
}

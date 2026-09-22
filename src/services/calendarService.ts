/** Calendar of maturities and anniversaries, with public holidays shaded. */
import type { ProductCode, ScenarioCode } from '@/domain/codes';
import { addDays, endOfMonth, isWeekend, startOfMonth, startOfWeek, todayLagos } from '@/lib/dates';
import { add, ZERO } from '@/lib/money';
import { getDb } from '@/data/store';
import { findById } from '@/data/repo';
import { USE_MOCK, http, run } from './core';
import { canSeeCustomer, visibleCustomerIds } from './scope';

export type EventKind = 'MATURITY' | 'ANNIVERSARY';

export interface CalendarEvent {
  id: string;
  kind: EventKind;
  date: string;
  investmentId: string;
  investmentRef: string;
  customerId: string;
  customerName: string;
  productCode: ProductCode;
  amount: string;
  /** Scenario to pre-fill when starting a transaction from this event. */
  suggested: ScenarioCode;
}

export interface CalendarDay {
  date: string;
  isToday: boolean;
  isWeekend: boolean;
  holiday: string | null;
  inMonth: boolean;
  events: CalendarEvent[];
  total: string;
}

export interface CalendarMonth {
  month: string;
  from: string;
  to: string;
  days: CalendarDay[];
  summary: { today: number; next7: number; next30: number; overdue: number };
}

export interface CalendarService {
  month(month: string, kinds?: EventKind[]): Promise<CalendarMonth>;
}

function eventsBetween(from: string, to: string): CalendarEvent[] {
  const db = getDb();
  const scope = visibleCustomerIds();
  const out: CalendarEvent[] = [];
  for (const i of db.investments) {
    if (i.status !== 'ACTIVE' && i.status !== 'MATURED') continue;
    if (!canSeeCustomer(i.customerId, scope)) continue;
    const c = findById(db, 'customers', i.customerId);
    const base = {
      investmentId: i.id,
      investmentRef: i.investmentRef,
      customerId: i.customerId,
      customerName: c?.customerName ?? '',
      productCode: i.productCode,
      amount: i.principalAmt,
    };
    if (i.maturityDate >= from && i.maturityDate <= to) {
      out.push({
        ...base,
        id: `${i.id}-M`,
        kind: 'MATURITY',
        date: i.maturityDate,
        suggested: 'MATURITY',
      });
    }
    if (i.nextAnnivDate && i.nextAnnivDate >= from && i.nextAnnivDate <= to) {
      out.push({
        ...base,
        id: `${i.id}-A`,
        kind: 'ANNIVERSARY',
        date: i.nextAnnivDate,
        suggested: 'ANNIVERSARY',
      });
    }
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.customerName.localeCompare(b.customerName)
  );
}

export const mockCalendarService: CalendarService = {
  month: (month, kinds) =>
    run(() => {
      const today = todayLagos();
      const first = `${month}-01`;
      const gridFrom = startOfWeek(startOfMonth(first));
      const monthEnd = endOfMonth(first);
      const gridTo = addDays(startOfWeek(monthEnd), 6);
      const db = getDb();
      const holidays = new Map(db.holidays.map((h) => [h.holidayDate, h.description]));
      const all = eventsBetween(gridFrom, gridTo).filter((e) => !kinds || kinds.includes(e.kind));

      const days: CalendarDay[] = [];
      for (let d = gridFrom; d <= gridTo; d = addDays(d, 1)) {
        const events = all.filter((e) => e.date === d);
        days.push({
          date: d,
          isToday: d === today,
          isWeekend: isWeekend(d),
          holiday: holidays.get(d) ?? null,
          inMonth: d.slice(0, 7) === month,
          events,
          total: add(ZERO, ...events.map((e) => e.amount)),
        });
      }

      const horizon = eventsBetween(addDays(today, -400), addDays(today, 30));
      return {
        month,
        from: gridFrom,
        to: gridTo,
        days,
        summary: {
          today: horizon.filter((e) => e.date === today).length,
          next7: horizon.filter((e) => e.date > today && e.date <= addDays(today, 7)).length,
          next30: horizon.filter((e) => e.date > today && e.date <= addDays(today, 30)).length,
          overdue: horizon.filter((e) => e.date < today).length,
        },
      };
    }),
};

export const httpCalendarService: CalendarService = {
  month: (month, kinds) => http.get('/calendar', { month, kinds }),
};

export const calendarService: CalendarService = USE_MOCK
  ? mockCalendarService
  : httpCalendarService;

/**
 * Deterministic demo data, relative to "now" in Africa/Lagos so the demo never goes stale.
 *
 * Reference data (users, banks, customers, accounts, the investment book) is generated with a
 * seeded PRNG. Transactions are then produced by replaying the real workflow engine with
 * back-dated contexts, in global time order — so seed data is always consistent with the rules.
 */
import type {
  Account,
  AppUser,
  Customer,
  Ctx,
  Investment,
  IntegrationConfig,
  SysSettingsRecord,
  TreasuryTxn,
  TxnInput,
} from '@/domain/types';
import type {
  AnnivFreq,
  MandateRule,
  ProductCode,
  RoleCode,
  ScenarioCode,
  SignClass,
} from '@/domain/codes';
import { SCENARIO_META } from '@/domain/codes';
import { DEFAULT_SETTINGS, interest, maturityDate } from '@/lib/calc';
import {
  addDays,
  addMinutes,
  easterSunday,
  isBusinessDay,
  isoDatePart,
  isoTimePart,
  lagosDateTime,
  nextBusinessDay,
  parseIso,
  toLagosIso,
  yearOf,
} from '@/lib/dates';
import { toMoney, toRate, mul, ZERO } from '@/lib/money';
import { createRng, type Rng } from '@/lib/prng';
import { specimenSvg } from '@/lib/specimen';
import { emptyDb, type Db } from './db';
import { writeAudit } from './audit';
import { findById, insert, nextCounter } from './repo';
import { getDb, runWithDb } from './store';
import * as wf from '@/services/workflow';

export const SEED_NUMBER = 20260922;

// ─── Reference data ──────────────────────────────────────────────────────────

const DEMO_USERS: { fullName: string; role: RoleCode; staffId: string }[] = [
  { fullName: 'Adaeze Okonkwo', role: 'TO', staffId: 'FMT-0141' },
  { fullName: 'Tunde Bakare', role: 'AO', staffId: 'FMT-0207' },
  { fullName: 'Ibrahim Musa', role: 'HT', staffId: 'FMT-0032' },
  { fullName: 'Chiamaka Eze', role: 'MIS', staffId: 'FMT-0118' },
  { fullName: 'Olumide Adeyemi', role: 'AUD', staffId: 'FMT-0076' },
  { fullName: 'Mrs. Folake Adebayo', role: 'MD', staffId: 'FMT-0001' },
  { fullName: 'Emeka Nwosu', role: 'OPS', staffId: 'FMT-0164' },
  { fullName: 'Kelechi Obi', role: 'ADM', staffId: 'FMT-0089' },
  { fullName: 'Ngozi Uchenna', role: 'AO', staffId: 'FMT-0212' },
  { fullName: 'Bola Akande', role: 'AO', staffId: 'FMT-0219' },
  { fullName: 'Yusuf Garba', role: 'AO', staffId: 'FMT-0226' },
];

export const BANKS: [string, string, string, boolean][] = [
  ['044', 'Access Bank Plc', 'Access', true],
  ['023', 'Citibank Nigeria Limited', 'Citibank', true],
  ['050', 'Ecobank Nigeria Plc', 'Ecobank', true],
  ['070', 'Fidelity Bank Plc', 'Fidelity', true],
  ['011', 'First Bank of Nigeria Limited', 'First Bank', true],
  ['214', 'First City Monument Bank Limited', 'FCMB', true],
  ['058', 'Guaranty Trust Bank Limited', 'GTBank', true],
  ['030', 'Heritage Bank Plc', 'Heritage', false],
  ['301', 'Jaiz Bank Plc', 'Jaiz', true],
  ['082', 'Keystone Bank Limited', 'Keystone', true],
  ['076', 'Polaris Bank Limited', 'Polaris', true],
  ['101', 'Providus Bank Limited', 'Providus', true],
  ['221', 'Stanbic IBTC Bank Plc', 'Stanbic IBTC', true],
  ['068', 'Standard Chartered Bank Nigeria Limited', 'Standard Chartered', true],
  ['232', 'Sterling Bank Plc', 'Sterling', true],
  ['032', 'Union Bank of Nigeria Plc', 'Union', true],
  ['033', 'United Bank for Africa Plc', 'UBA', true],
  ['215', 'Unity Bank Plc', 'Unity', true],
  ['035', 'Wema Bank Plc', 'Wema', true],
  ['057', 'Zenith Bank Plc', 'Zenith', true],
];

const INDIVIDUALS = [
  'Chukwuemeka Obiora',
  'Ngozi Adeleke',
  'Babatunde Ogunleye',
  'Aisha Bello',
  'Oluwaseun Adebanjo',
  'Ifeoma Nwachukwu',
  'Musa Abdullahi',
  'Funmilayo Akinwale',
  'Emeka Okafor',
  'Halima Suleiman',
  'Chinedu Eze',
  'Yetunde Balogun',
  'Ibrahim Lawal',
  'Nkechi Okoro',
  'Adewale Ogundipe',
  'Zainab Mohammed',
  'Tochukwu Anyanwu',
  'Folasade Olatunji',
  'Uche Nnamdi',
  'Kemi Adeyemo',
  'Segun Fashanu',
  'Amaka Chukwu',
  'Bello Garba',
  'Titilayo Coker',
  'Obinna Uzor',
  'Hauwa Danjuma',
  'Gbenga Oyelaran',
  'Ebere Nwankwo',
];

const CORPORATES = [
  'Okafor & Sons Ltd',
  'Lekki Gardens Estates Ltd',
  'Ikeja Cold Rooms Ltd',
  'Harbour Point Logistics Ltd',
  'Kano Agro Commodities Ltd',
  'Delta Marine Services Ltd',
  'Eko Pharmaceuticals Ltd',
  'Abuja Crest Properties Ltd',
  'Onitsha Trading Company Ltd',
  'Ibadan Polymers Ltd',
  'Port Harcourt Energy Services Ltd',
  'Victoria Island Medical Centre Ltd',
];

const DIRECTORS = [
  'Chidi Okafor',
  'Adaobi Okafor',
  'Femi Adekunle',
  'Grace Etim',
  'Sani Yusuf',
  'Rotimi Alade',
  'Esther Ibe',
  'Kunle Ajayi',
  'Patience Udo',
  'Tobi Oyewole',
  'Mariam Aliyu',
  'Victor Eke',
  'Joy Nnaji',
  'Dele Martins',
  'Rahila Ishaku',
  'Samuel Okon',
  'Bisi Lawson',
  'Ahmed Tijani',
];

const STREETS = [
  '14 Adeola Odeku Street, Victoria Island, Lagos',
  '7 Awolowo Road, Ikoyi, Lagos',
  '22 Allen Avenue, Ikeja, Lagos',
  '3 Aminu Kano Crescent, Wuse II, Abuja',
  '18 Trans-Amadi Road, Port Harcourt',
  '5 Bompai Road, Kano',
  '11 Ring Road, Ibadan',
  '9 Admiralty Way, Lekki Phase 1, Lagos',
  '26 Herbert Macaulay Way, Yaba, Lagos',
  '2 Ademola Adetokunbo Crescent, Maitama, Abuja',
];

const EID: Record<number, [string, string][]> = {
  2025: [
    ['2025-03-31', 'Eid-el-Fitr'],
    ['2025-04-01', 'Eid-el-Fitr holiday'],
    ['2025-06-06', 'Eid-el-Kabir'],
    ['2025-09-05', 'Eid-el-Maulud'],
  ],
  2026: [
    ['2026-03-20', 'Eid-el-Fitr'],
    ['2026-05-27', 'Eid-el-Kabir'],
    ['2026-08-26', 'Eid-el-Maulud'],
  ],
  2027: [
    ['2027-03-10', 'Eid-el-Fitr'],
    ['2027-05-17', 'Eid-el-Kabir'],
    ['2027-08-16', 'Eid-el-Maulud'],
  ],
  2028: [
    ['2028-02-27', 'Eid-el-Fitr'],
    ['2028-05-05', 'Eid-el-Kabir'],
    ['2028-08-04', 'Eid-el-Maulud'],
  ],
};

export function holidaysFor(year: number): [string, string][] {
  const easter = easterSunday(year);
  const list: [string, string][] = [
    [`${year}-01-01`, "New Year's Day"],
    [addDays(easter, -2), 'Good Friday'],
    [addDays(easter, 1), 'Easter Monday'],
    [`${year}-05-01`, "Workers' Day"],
    [`${year}-06-12`, 'Democracy Day'],
    [`${year}-10-01`, 'Independence Day'],
    [`${year}-12-25`, 'Christmas Day'],
    [`${year}-12-26`, 'Boxing Day'],
    ...(EID[year] ?? []),
  ];
  return list.sort((a, b) => a[0].localeCompare(b[0]));
}

const INTEGRATIONS: Omit<
  IntegrationConfig,
  'id' | 'version' | 'lastTestAt' | 'lastTestOk' | 'lastTestMs'
>[] = [
  {
    code: 'EAZYBANKZ',
    name: 'Eazybankz core banking',
    description: 'Customer, account and investment balances; postings.',
    endpoint: 'https://eazybankz.fmtfinance.local/api/v2',
    username: 'svc_treasurydesk',
    timeoutMs: 15000,
    enabled: true,
  },
  {
    code: 'GAPS',
    name: 'GAPS payments',
    description: 'Outbound transfers to other banks.',
    endpoint: 'https://gaps.fmtfinance.local/FileUploader.asmx',
    username: 'FMTFINANCE01',
    timeoutMs: 30000,
    enabled: true,
  },
  {
    code: 'NIP',
    name: 'NIBSS Instant Payment',
    description: 'Name enquiry and instant transfers (planned).',
    endpoint: 'https://nip.nibss-plc.com.ng/NIPWS/NIPInterface',
    username: 'FMT-NIP',
    timeoutMs: 20000,
    enabled: false,
  },
  {
    code: 'ORACLE',
    name: 'Oracle database',
    description: 'TreasuryDesk system of record (Oracle 19c).',
    endpoint: 'jdbc:oracle:thin:@//db01.fmtfinance.local:1521/TRSYPDB',
    username: 'TRSY_APP',
    timeoutMs: 10000,
    enabled: true,
  },
  {
    code: 'AD',
    name: 'Active Directory SSO',
    description: 'Staff sign-in and role groups.',
    endpoint: 'ldaps://ad.fmtfinance.local:636',
    username: 'CN=svc_trsy,OU=Service,DC=fmtfinance,DC=local',
    timeoutMs: 8000,
    enabled: false,
  },
  {
    code: 'MSG',
    name: 'SMS / Email gateway',
    description: 'Customer alerts and staff notifications.',
    endpoint: 'smtp://mail.fmtfinance.local:587',
    username: 'alerts@fmtfinance.com',
    timeoutMs: 10000,
    enabled: true,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/^mrs?\.\s+/, '')
    .replace(/[^a-z ]/g, '')
    .trim()
    .replace(/\s+/g, '.');
}

function logUniformInt(rng: Rng, min: number, max: number): number {
  return Math.round(Math.exp(Math.log(min) + rng.next() * (Math.log(max) - Math.log(min))));
}

/** Money string rounded to a step (e.g. nearest ₦50,000). */
function amountBetween(rng: Rng, min: number, max: number, step: number): string {
  const v = Math.max(step, Math.round(logUniformInt(rng, min, max) / step) * step);
  return toMoney(String(v));
}

function rate(rng: Rng, lo = 12, hi = 24): string {
  return toRate(String(rng.int(lo * 4, hi * 4) / 4));
}

// ─── Build ───────────────────────────────────────────────────────────────────

export interface SeedOptions {
  nowMs?: number;
}

export function buildSeed(opts: SeedOptions = {}): Db {
  const nowMs = Math.floor((opts.nowMs ?? Date.now()) / 60_000) * 60_000;
  const anchor = toLagosIso(nowMs);
  const T = isoDatePart(anchor);
  const settings: SysSettingsRecord = {
    id: 'SET-000001',
    version: 1,
    values: { ...DEFAULT_SETTINGS },
    updatedAt: lagosDateTime(addDays(T, -400), '08:00'),
    updatedBy: wf.SYSTEM_USER_ID,
  };
  const db = emptyDb(settings, T, anchor);
  runWithDb(db, () => populate(db, T, anchor));
  return db;
}

function populate(db: Db, T: string, anchor: string) {
  const rng = createRng(SEED_NUMBER);
  const goLive = lagosDateTime(addDays(T, -400), '08:00');
  const sys: Ctx = { userId: wf.SYSTEM_USER_ID, at: goLive };

  // Holidays: last year, this year, next year.
  for (const y of [yearOf(T) - 1, yearOf(T), yearOf(T) + 1]) {
    for (const [holidayDate, description] of holidaysFor(y))
      insert(db, 'holidays', { holidayDate, description });
  }
  const holidays = db.holidays.map((h) => h.holidayDate);
  const rule = db.settings.values.maturityHolidayRule;
  const bizDay = (d: string) => isBusinessDay(d, holidays);
  const bizBack = (n: number) => {
    let d = T;
    let k = 0;
    while (k < n) {
      d = addDays(d, -1);
      if (bizDay(d)) k += 1;
    }
    return d;
  };

  // Users.
  const users: AppUser[] = DEMO_USERS.map((u) =>
    insert(db, 'users', {
      fullName: u.fullName,
      email: `${slug(u.fullName)}@fmtfinance.com`,
      roleCode: u.role,
      staffId: u.staffId,
      status: 'ACTIVE',
      lastLoginAt: null,
      createdAt: goLive,
    })
  );
  const byRole = (r: RoleCode) => users.find((u) => u.roleCode === r)!;
  const TO = byRole('TO');
  const OPS = byRole('OPS');
  const aos = users.filter((u) => u.roleCode === 'AO');
  const approverFor: Record<number, AppUser> = {
    2: byRole('HT'),
    3: byRole('MIS'),
    4: byRole('AUD'),
    5: byRole('MD'),
  };

  for (const [bankCode, bankName, shortName, active] of BANKS)
    insert(db, 'banks', { bankCode, bankName, shortName, active });
  const activeBanks = db.banks.filter((b) => b.active);

  for (const it of INTEGRATIONS) {
    insert(db, 'integrations', {
      ...it,
      lastTestAt: lagosDateTime(addDays(T, -1), '07:30'),
      lastTestOk: it.enabled,
      lastTestMs: it.enabled ? rng.int(80, 420) : null,
    });
  }

  // Customers, signatories, mandates, accounts.
  const exemptIdx = new Set([29, 33, 37, 5, 17, 39]); // 3 corporates + 3 individuals (index in combined list)
  const names: [string, 'IND' | 'CORP'][] = [
    ...INDIVIDUALS.map((n) => [n, 'IND'] as [string, 'IND']),
    ...CORPORATES.map((n) => [n, 'CORP'] as [string, 'CORP']),
  ];
  // Interleave so corporates are spread through the CIF range.
  const order = rng.shuffle(names.map((_, i) => i));
  const customers: Customer[] = [];
  const usedNos = new Set<string>();
  const nuban = (prefix: string) => {
    let no = '';
    do no = `${prefix}${String(rng.int(0, 99_999_999)).padStart(8, '0')}`;
    while (usedNos.has(no));
    usedNos.add(no);
    return no;
  };
  let dirIdx = 0;
  order.forEach((nameIdx, k) => {
    const [customerName, customerType] = names[nameIdx];
    const ao = aos[k % aos.length];
    const prefixes = [
      '803',
      '805',
      '806',
      '810',
      '813',
      '816',
      '703',
      '706',
      '903',
      '906',
      '802',
      '812',
      '708',
      '909',
    ];
    const c = insert(db, 'customers', {
      cifNo: `FMT${String(101 + k).padStart(6, '0')}`,
      customerName,
      customerType,
      regPhone: `+234 ${rng.pick(prefixes)} ${rng.int(100, 999)} ${rng.int(1000, 9999)}`,
      email:
        customerType === 'IND'
          ? `${slug(customerName)}@${rng.pick(['gmail.com', 'yahoo.com', 'outlook.com'])}`
          : `treasury@${customerName
              .toLowerCase()
              .replace(/ ltd$/, '')
              .replace(/[^a-z]/g, '')}.com.ng`,
      address: rng.pick(STREETS),
      bvnMasked: `22${rng.int(1, 9)}*****${rng.int(1000, 9999)}`,
      whtExempt: exemptIdx.has(nameIdx),
      accountOfficerId: ao.id,
      status: 'ACTIVE',
      createdAt: lagosDateTime(addDays(T, -rng.int(420, 1800)), '10:00'),
    });
    customers.push(c);
    const sigs: [string, SignClass][] =
      customerType === 'IND'
        ? rng.chance(0.2)
          ? [
              [customerName, 'A'],
              [DIRECTORS[dirIdx++ % DIRECTORS.length], 'A'],
            ]
          : [[customerName, 'A']]
        : (() => {
            const n = rng.int(2, 3);
            const out: [string, SignClass][] = [];
            for (let i = 0; i < n; i++)
              out.push([
                DIRECTORS[dirIdx++ % DIRECTORS.length],
                i === 0 ? 'A' : i === 1 ? 'B' : rng.pick(['A', 'B'] as SignClass[]),
              ]);
            return out;
          })();
    for (const [fullName, signClass] of sigs) {
      insert(db, 'signatories', {
        customerId: c.id,
        fullName,
        signClass,
        specimenSvg: specimenSvg(fullName, rng),
        active: true,
      });
    }
    const ruleCode: MandateRule =
      sigs.length === 1
        ? 'SOLE'
        : customerType === 'CORP'
          ? rng.pick(['A_AND_B', 'ANY_TWO'] as MandateRule[])
          : 'ANY_TWO';
    insert(db, 'mandates', { customerId: c.id, ruleCode, effectiveDate: isoDatePart(c.createdAt) });
    const opened = isoDatePart(c.createdAt);
    for (const productCode of ['SS', 'PA'] as const) {
      const bal = amountBetween(rng, productCode === 'PA' ? 2_000_000 : 200_000, 150_000_000, 1000);
      insert(db, 'accounts', {
        customerId: c.id,
        accountNo: nuban(productCode === 'PA' ? '10' : '20'),
        accountName: customerName,
        productCode,
        ledgerBal: bal,
        availableBal: bal,
        status: 'ACTIVE',
        openedDate: opened,
      });
    }
  });
  const pa = (c: Customer) =>
    db.accounts.find((a) => a.customerId === c.id && a.productCode === 'PA')!;
  const ss = (c: Customer) =>
    db.accounts.find((a) => a.customerId === c.id && a.productCode === 'SS')!;

  // Beneficiaries: 20 external, 5 internal.
  for (let i = 0; i < 25; i++) {
    const c = customers[(i * 7) % customers.length];
    const internal = i >= 20;
    if (internal) {
      const other = customers[(i * 11 + 3) % customers.length];
      insert(db, 'beneficiaries', {
        customerId: c.id,
        benefName: other.customerName,
        bankCode: '000',
        accountNo: pa(other).accountNo,
        accountType: 'SAVINGS',
        isInternal: true,
        createdAt: lagosDateTime(addDays(T, -rng.int(30, 300)), '11:00'),
      });
    } else {
      const own = rng.chance(0.4);
      insert(db, 'beneficiaries', {
        customerId: c.id,
        benefName: own
          ? c.customerName
          : rng.pick([...CORPORATES, ...INDIVIDUALS].filter((n) => n !== c.customerName)),
        bankCode: rng.pick(activeBanks).bankCode,
        accountNo: String(rng.int(1_000_000_000, 9_999_999_999)),
        accountType: rng.pick(['SAVINGS', 'CURRENT'] as const),
        isInternal: false,
        createdAt: lagosDateTime(addDays(T, -rng.int(30, 300)), '11:00'),
      });
    }
  }

  // ─── Investment book ───────────────────────────────────────────────────
  const mkInv = (o: {
    customer: Customer;
    eff: string;
    tenor: number;
    principal?: string;
    rate?: string;
    product?: ProductCode;
    annivFreq?: AnnivFreq;
    nextAnniv?: string | null;
    intPaid?: string;
    status?: Investment['status'];
    closedDate?: string | null;
  }): Investment => {
    const principal = o.principal ?? amountBetween(rng, 1_000_000, 500_000_000, 50_000);
    const r = o.rate ?? rate(rng);
    const m = maturityDate(o.eff, o.tenor, holidays, rule).date;
    const year = yearOf(o.eff);
    return insert(db, 'investments', {
      investmentRef: `INV-${year}-${String(nextCounter(db, `invRef:${year}`)).padStart(5, '0')}`,
      customerId: o.customer.id,
      accountId: pa(o.customer).id,
      productCode:
        o.product ??
        rng.weighted<ProductCode>([
          ['TERM', 7],
          ['CP', 2],
          ['CALL', 1],
        ]),
      principalAmt: principal,
      intRate: r,
      effectiveDate: o.eff,
      tenorDays: o.tenor,
      maturityDate: m,
      annivFreqDays: o.annivFreq ?? 0,
      nextAnnivDate: o.nextAnniv ?? null,
      intPaidToDate: o.intPaid ?? ZERO,
      status: o.status ?? 'ACTIVE',
      parentInvestmentId: null,
      originTxnId: null,
      closedTxnId: null,
      closedDate: o.closedDate ?? null,
      createdAt: lagosDateTime(o.eff, '10:00'),
    });
  };
  /** Pick a tenor/effective date so maturity lands exactly on D where possible. */
  const effFor = (
    D: string,
    tenors = [60, 90, 180, 270, 365, 365]
  ): { eff: string; tenor: number } => {
    for (const tenor of rng.shuffle(tenors)) {
      const eff = addDays(D, -tenor);
      if (bizDay(eff) && maturityDate(eff, tenor, holidays, rule).date === D) return { eff, tenor };
    }
    const tenor = rng.pick(tenors);
    return { eff: addDays(D, -tenor), tenor };
  };
  const cust = () => rng.pick(customers);

  const buckets = {
    today: [] as Investment[],
    next7: [] as Investment[],
    next30: [] as Investment[],
    matured: [] as Investment[],
    anniv: [] as Investment[],
    long: [] as Investment[],
  };
  /**
   * Business days inside a window from today. Maturities are only ever placed on these: a weekend
   * or public holiday is moved to the next business day, which would push the investment out of
   * the window the brief asks it to be in (e.g. a 7-day target landing on 1 October).
   */
  const windowDays = (from: number, to: number): string[] => {
    const days: string[] = [];
    for (let d = from; d <= to; d++) {
      const date = addDays(T, d);
      if (bizDay(date)) days.push(date);
    }
    return days.length ? days : [addDays(T, from)];
  };
  const within7 = windowDays(1, 7);
  const within30 = windowDays(8, 30);
  for (let i = 0; i < 6; i++) buckets.today.push(mkInv({ customer: cust(), ...effFor(T) }));
  for (let i = 0; i < 18; i++)
    buckets.next7.push(mkInv({ customer: cust(), ...effFor(within7[i % within7.length]) }));
  for (let i = 0; i < 30; i++)
    buckets.next30.push(mkInv({ customer: cust(), ...effFor(within30[i % within30.length]) }));
  // 11: one is rolled over by a seeded transaction, leaving 10 awaiting instruction.
  for (let i = 0; i < 11; i++) {
    buckets.matured.push(
      mkInv({
        customer: cust(),
        ...effFor(bizBack(1 + i * 2), [30, 60, 90, 180]),
        status: 'MATURED',
      })
    );
  }
  for (let i = 0; i < 15; i++) {
    const freq = rng.pick([30, 60, 90] as const);
    const next = addDays(T, i % 14);
    const k = rng.int(1, 2);
    const eff = addDays(next, -k * freq);
    const principal = amountBetween(rng, 5_000_000, 300_000_000, 50_000);
    const r = rate(rng);
    const paid = mul(interest(principal, r, freq, 365).value, k - 1);
    buckets.anniv.push(
      mkInv({
        customer: cust(),
        eff,
        tenor: 365,
        principal,
        rate: r,
        product: 'TERM',
        annivFreq: freq,
        nextAnniv: next,
        intPaid: paid,
      })
    );
  }
  for (let i = 0; i < 12; i++) {
    const tenor = rng.pick([180, 270, 365]);
    const m = addDays(T, rng.int(35, tenor - 5));
    const eff = addDays(m, -tenor);
    const freq = rng.chance(0.3) ? 90 : 0;
    let nextAnniv: string | null = null;
    if (freq) {
      nextAnniv = addDays(eff, freq);
      while (nextAnniv <= addDays(T, 14)) nextAnniv = addDays(nextAnniv, freq);
      if (nextAnniv >= m) nextAnniv = null;
    }
    buckets.long.push(
      mkInv({ customer: cust(), eff, tenor, annivFreq: nextAnniv ? 90 : 0, nextAnniv })
    );
  }
  // History already closed before the system went live (drives the 12-month AUM trend).
  // Large one-year placements closing one by one over the past year keep the trend realistic.
  for (let i = 0; i < 10; i++) {
    const tenor = 365;
    const maturity = addDays(T, -(15 + i * 33));
    const status = rng.weighted<Investment['status']>([
      ['CLOSED', 5],
      ['ROLLED_OVER', 3],
      ['LIQUIDATED', 2],
    ]);
    const eff = addDays(maturity, -tenor);
    const principal = amountBetween(rng, 250_000_000, 500_000_000, 50_000);
    mkInv({
      customer: cust(),
      eff,
      tenor,
      principal,
      product: 'TERM',
      status,
      closedDate: status === 'LIQUIDATED' ? addDays(maturity, -60) : maturity,
    });
  }

  writeAudit(db, sys, {
    entity: 'System',
    entityId: 'MIGRATION',
    action: 'DATA_MIGRATED',
    summary: `Opening data migrated from Eazybankz: ${customers.length} customers, ${db.accounts.length} accounts, ${db.investments.length} investments`,
  });

  // ─── Transactions ──────────────────────────────────────────────────────
  type Target =
    | 'COMPLETED'
    | 'EXECUTED'
    | 'PENDING_OPERATIONS'
    | 'EXEC_FAILED'
    | 'PENDING_MD'
    | 'PENDING_AUDIT'
    | 'PENDING_MIS'
    | 'PENDING_HEAD_TREASURY'
    | 'DRAFT'
    | 'VERIFICATION'
    | 'STOPPED'
    | 'RETURNED'
    | 'REJECTED'
    | 'CANCELLED';

  interface Plan {
    key: string;
    scenario: ScenarioCode;
    target: Target;
    start: string;
    gap: number;
    subject: () => {
      customer: Customer;
      investment?: Investment;
      account?: Account;
      reversalOf?: TreasuryTxn;
    };
    input?: (s: ReturnType<Plan['subject']>, day: string) => TxnInput;
    external?: boolean;
    breach?: boolean;
    gapsFailFirst?: boolean;
    /** Returned once at this level, then resubmitted (cycle 2). */
    returnedOnceAt?: number;
    /** Final return / reject level. */
    stopAt?: number;
  }

  const plans: Plan[] = [];
  const created = new Map<string, string>(); // plan key → txn id
  const used = new Set<string>();
  const take = (list: Investment[], pred: (i: Investment) => boolean = () => true): Investment => {
    const inv = list.find((i) => !used.has(i.id) && pred(i));
    if (!inv) throw new Error('Seed: ran out of investments for a plan');
    used.add(inv.id);
    return inv;
  };
  const richCustomer = (pick: (c: Customer) => Account, min: string) => {
    const c = rng
      .shuffle(customers)
      .find((x) => !used.has(pick(x).id) && Number(pick(x).availableBal) >= Number(min));
    if (!c) throw new Error('Seed: no customer with enough balance');
    used.add(pick(c).id);
    return c;
  };
  const round10k = (v: number) =>
    toMoney(String(Math.max(10_000, Math.round(v / 10_000) * 10_000)));
  const fraction = (bal: string, f: number) => round10k(Number(bal) * f);

  // History subjects: an investment shaped for the scenario on day D.
  const histSubject = (scenario: ScenarioCode, D: string): Investment => {
    const c = cust();
    if (scenario === 'PRELIQ_FULL' || scenario === 'PRELIQ_PARTIAL') {
      return mkInv({
        customer: c,
        eff: addDays(D, -rng.int(60, 150)),
        tenor: 365,
        principal: amountBetween(rng, 10_000_000, 200_000_000, 50_000),
      });
    }
    if (scenario === 'ANNIVERSARY') {
      const freq = 90 as const;
      return mkInv({
        customer: c,
        eff: addDays(D, -freq),
        tenor: 365,
        product: 'TERM',
        annivFreq: freq,
        nextAnniv: D,
      });
    }
    return mkInv({ customer: c, ...effFor(D) });
  };

  const baseInput = (
    scenario: ScenarioCode,
    s: ReturnType<Plan['subject']>,
    day: string
  ): TxnInput => {
    const valueDay = nextBusinessDay(day, holidays);
    switch (SCENARIO_META[scenario].txnType) {
      case 'ROLLOVER': {
        const inv = s.investment!;
        const i: TxnInput = {
          newRate: toRate(String(Number(inv.intRate) + rng.pick([-0.5, 0, 0.5, 1]))),
          newTenorDays: rng.pick([90, 180, 182, 365]),
        };
        if (scenario === 'ROLLOVER_C') i.rollAmt = round10k(Number(inv.principalAmt) * 0.7);
        return i;
      }
      case 'PRELIQ':
        return scenario === 'PRELIQ_PARTIAL'
          ? { valueDate: valueDay, amount: round10k(Number(s.investment!.principalAmt) * 0.3) }
          : { valueDate: valueDay };
      case 'ANNIVERSARY':
        return { annivPeriod: (s.investment!.annivFreqDays || 30) as 30 | 60 | 90 };
      case 'THIRD_PARTY':
        return { valueDate: valueDay, amount: fraction(pa(s.customer).availableBal, 0.15) };
      case 'TRANSFER':
        if (scenario === 'TRANSFER_SS_PA')
          return { valueDate: valueDay, amount: fraction(ss(s.customer).availableBal, 0.4) };
        if (scenario === 'TRANSFER_REVERSAL') {
          const orig = findById(db, 'investments', s.reversalOf!.resultInvestmentId)!;
          return {
            correctedRate: toRate(String(Number(orig.intRate) + 1)),
            correctedTenorDays: orig.tenorDays,
            correctedAmount: orig.principalAmt,
          };
        }
        return {
          valueDate: valueDay,
          amount: fraction(pa(s.customer).availableBal, 0.3),
          newRate: rate(rng, 14, 20),
          newTenorDays: scenario === 'TRANSFER_PA_CALL' ? 30 : rng.pick([90, 180]),
        };
      case 'INFLOW':
        return {
          valueDate: valueDay,
          amount: amountBetween(rng, 5_000_000, 250_000_000, 100_000),
          newRate: rate(rng, 14, 22),
          newTenorDays: rng.pick([90, 180, 365]),
          productCode: rng.weighted<ProductCode>([
            ['TERM', 3],
            ['CP', 1],
          ]),
          annivFreqDays: rng.pick([0, 0, 90] as AnnivFreq[]),
        };
      default:
        return {};
    }
  };

  const subjectFor = (
    scenario: ScenarioCode,
    pool: 'pending' | 'hist',
    D: string
  ): Plan['subject'] => {
    const meta = SCENARIO_META[scenario];
    if (meta.subject === 'INVESTMENT') {
      if (pool === 'hist') {
        return () => {
          const inv = histSubject(scenario, D);
          return { customer: findById(db, 'customers', inv.customerId)!, investment: inv };
        };
      }
      let inv: Investment;
      if (meta.txnType === 'ROLLOVER' || meta.txnType === 'MATURITY') {
        inv = take(
          [...buckets.matured, ...buckets.today, ...buckets.next7],
          (i) => i.maturityDate <= addDays(T, 6)
        );
      } else if (meta.txnType === 'ANNIVERSARY') {
        inv = take(buckets.anniv, (i) => (i.nextAnnivDate ?? '') <= addDays(T, 12));
      } else {
        inv = take(
          [...buckets.long, ...buckets.next30],
          (i) => i.maturityDate > addDays(T, 20) && i.effectiveDate < addDays(T, -3)
        );
      }
      return () => ({ customer: findById(db, 'customers', inv.customerId)!, investment: inv });
    }
    if (meta.subject === 'ACCOUNT') {
      const c =
        scenario === 'TRANSFER_SS_PA' ? richCustomer(ss, '1000000') : richCustomer(pa, '3000000');
      return () => ({ customer: c, account: scenario === 'TRANSFER_SS_PA' ? ss(c) : pa(c) });
    }
    if (meta.subject === 'CUSTOMER') {
      const c = cust();
      return () => ({ customer: c });
    }
    return () => {
      throw new Error('Reversal subject must be set explicitly');
    };
  };

  const addPlan = (
    p: Omit<Plan, 'subject' | 'key'> & { key?: string; subject?: Plan['subject'] },
    pool: 'pending' | 'hist'
  ) => {
    const D = isoDatePart(p.start);
    plans.push({
      key: p.key ?? `P${plans.length + 1}`,
      ...p,
      subject: p.subject ?? subjectFor(p.scenario, pool, D),
    } as Plan);
  };

  // Completed history: every scenario once.
  const histStart = (bizDaysBack: number) =>
    lagosDateTime(bizBack(bizDaysBack), `09:${String(rng.int(0, 50)).padStart(2, '0')}`);
  const hist: [ScenarioCode, number, Partial<Plan>][] = [
    ['INFLOW', 45, { key: 'H-INFLOW' }],
    ['TRANSFER_REVERSAL', 43, { key: 'H-REV' }],
    ['MATURITY', 38, { breach: true, external: true }],
    ['PRELIQ_FULL', 34, { breach: true }],
    ['PRELIQ_PARTIAL', 30, { external: false }],
    ['ANNIVERSARY', 27, {}],
    ['ROLLOVER_A', 25, {}],
    ['ROLLOVER_B', 22, { external: true, gapsFailFirst: true }],
    ['ROLLOVER_C', 20, {}],
    ['TRANSFER_PA_CALL', 18, { key: 'H-CALL' }],
    ['ROLLOVER_D', 15, {}],
    ['THIRD_PARTY_EXT', 12, { breach: true }],
    ['THIRD_PARTY_INT', 9, {}],
    ['TRANSFER_SS_PA', 6, {}],
    ['TRANSFER_PA_CP', 3, {}],
  ];
  for (const [scenario, back, extra] of hist) {
    const start = histStart(back);
    const subject =
      scenario === 'TRANSFER_REVERSAL'
        ? () => {
            const orig = findById(db, 'txns', created.get('H-INFLOW'))!;
            return { customer: findById(db, 'customers', orig.customerId)!, reversalOf: orig };
          }
        : undefined;
    addPlan(
      { scenario, target: 'COMPLETED', start, gap: rng.int(16, 22), subject, ...extra },
      'hist'
    );
  }

  // Recent, anchor-relative items (all instructions within the last ~5 hours).
  const recentStart = () => addMinutes(anchor, -rng.int(150, 300));
  const recent = (scenario: ScenarioCode, target: Target, extra: Partial<Plan> = {}) =>
    addPlan({ scenario, target, start: recentStart(), gap: rng.int(5, 9), ...extra }, 'pending');

  recent('ROLLOVER_C', 'EXECUTED');
  recent('TRANSFER_SS_PA', 'EXECUTED');
  recent('MATURITY', 'PENDING_OPERATIONS', { external: true });
  recent('INFLOW', 'PENDING_OPERATIONS');
  recent('THIRD_PARTY_INT', 'PENDING_OPERATIONS');
  recent('THIRD_PARTY_EXT', 'EXEC_FAILED');
  recent('PRELIQ_FULL', 'EXEC_FAILED', { external: true });

  const rotation: ScenarioCode[] = [
    'ROLLOVER_A',
    'MATURITY',
    'PRELIQ_PARTIAL',
    'ANNIVERSARY',
    'THIRD_PARTY_EXT',
    'TRANSFER_PA_CP',
    'INFLOW',
    'ROLLOVER_B',
    'PRELIQ_FULL',
    'ROLLOVER_D',
    'THIRD_PARTY_INT',
    'TRANSFER_SS_PA',
    'ROLLOVER_C',
    'TRANSFER_PA_CALL',
    'INFLOW',
    'MATURITY',
  ];
  let rot = 0;
  const levels: [Target, number][] = [
    ['PENDING_HEAD_TREASURY', 2],
    ['PENDING_MIS', 3],
    ['PENDING_AUDIT', 4],
    ['PENDING_MD', 5],
  ];
  for (const [target] of levels) {
    for (let i = 0; i < 8; i++) {
      if (target === 'PENDING_MIS' && i === 7) {
        recent('TRANSFER_REVERSAL', target, {
          subject: () => {
            const orig = findById(db, 'txns', created.get('H-CALL'))!;
            return { customer: findById(db, 'customers', orig.customerId)!, reversalOf: orig };
          },
        });
        continue;
      }
      const scenario = rotation[rot++ % rotation.length];
      const extra: Partial<Plan> = { external: rng.chance(0.35) };
      if (target === 'PENDING_AUDIT' && i === 0) extra.returnedOnceAt = 3;
      if (target === 'PENDING_MD' && i === 0) extra.returnedOnceAt = 2;
      recent(scenario, target, extra);
    }
  }
  recent('ROLLOVER_A', 'DRAFT');
  recent('PRELIQ_PARTIAL', 'VERIFICATION');
  recent('THIRD_PARTY_EXT', 'STOPPED');
  recent('ANNIVERSARY', 'RETURNED', { stopAt: 4 });
  recent('TRANSFER_PA_CP', 'REJECTED', { stopAt: 2 });
  recent('INFLOW', 'CANCELLED');

  // ─── Replay ───────────────────────────────────────────────────────────
  interface Step {
    at: string;
    order: number;
    label: string;
    run: () => void;
  }
  const steps: Step[] = [];
  let stepSeq = 0;
  const postingRef = (at: string) =>
    `EZB-${at.slice(0, 10).replace(/-/g, '')}-${String(nextCounter(db, 'cbsRef')).padStart(5, '0')}`;
  const gapsRef = (at: string) =>
    `GAPS-${at.slice(0, 10).replace(/-/g, '')}-${String(nextCounter(db, 'gapsRef')).padStart(6, '0')}`;
  const sign = (u: AppUser) => ({ signatureName: u.fullName, pin: '1234' });
  const RETURN_NOTES = [
    'Remarks do not carry the beneficiary account number. Please correct.',
    'Instruction scan is not legible – attach a clearer copy.',
    'Rate on the voucher differs from the customer letter. Confirm with the customer.',
  ];
  const REJECT_NOTES = [
    'Customer withdrew the instruction by phone.',
    'Rate is outside the approved pricing grid.',
  ];

  for (const p of plans) {
    let t = 0;
    const at = () => addMinutes(p.start, p.gap * t++ + rng.int(0, 2));
    const push = (when: string, run: () => void) =>
      steps.push({
        at: when,
        order: stepSeq++,
        label: `${p.key} ${p.scenario} → ${p.target}`,
        run,
      });
    const id = () => created.get(p.key)!;
    const ctxOf = (u: AppUser | string, when: string): Ctx => ({
      userId: typeof u === 'string' ? u : u.id,
      at: when,
    });
    let subj: ReturnType<Plan['subject']>;

    // 0. create draft
    const createAt = at();
    push(createAt, () => {
      subj = p.subject();
      const input = {
        ...baseInput(p.scenario, subj, isoDatePart(createAt)),
        ...(p.input ? p.input(subj, isoDatePart(createAt)) : {}),
      };
      const txn = wf.createDraft(ctxOf(TO, createAt), {
        scenarioCode: p.scenario,
        customerId: subj.customer.id,
        investmentId: subj.investment?.id,
        sourceAccountId: subj.account?.id,
        reversalOfTxnId: subj.reversalOf?.id,
        input,
      });
      created.set(p.key, txn.id);
    });
    if (p.target === 'DRAFT') {
      const w = at();
      push(w, () => wf.updateDraft(ctxOf(TO, w), id(), { wizardStep: 2 }));
      continue;
    }

    // 1. instruction (received a few minutes before the draft was opened)
    const insAt = at();
    push(insAt, () => {
      const txn = findById(db, 'txns', id())!;
      const received = addMinutes(createAt, -rng.int(5, 20));
      const hasFo = SCENARIO_META[p.scenario].vouchers.includes('FO');
      const external =
        p.scenario === 'THIRD_PARTY_EXT' ||
        (hasFo && p.scenario !== 'THIRD_PARTY_INT' && !!p.external);
      const benef = db.beneficiaries.find(
        (b) => b.customerId === subj.customer.id && !b.isInternal
      );
      const bank = rng.pick(activeBanks);
      let comp = ZERO;
      try {
        comp = wf.computeFor(db, txn, isoDatePart(insAt)).headlineAmt;
      } catch {
        comp = txn.headlineAmt;
      }
      const internalTarget =
        p.scenario === 'THIRD_PARTY_INT'
          ? pa(customers.find((c) => c.id !== subj.customer.id && !used.has(`tp:${c.id}`))!)
          : null;
      if (internalTarget) used.add(`tp:${internalTarget.customerId}`);
      wf.recordInstruction(ctxOf(TO, insAt), id(), {
        channel: rng.pick(['LETTER', 'EMAIL', 'FORM', 'MANDATE'] as const),
        receivedDate: isoDatePart(received),
        receivedTime: isoTimePart(received),
        amount: Number(comp) > 0 ? comp : toMoney('1000000'),
        purpose: rng.pick([
          'Customer instruction as per letter',
          'Business operating expenses',
          'School fees',
          'Payment to supplier',
          'Investment instruction',
          'Personal use',
          'Property payment',
        ]),
        documentName: `instruction-${txn.txnRef}.pdf`,
        documentData: null,
        payDestination: external ? 'EXTERNAL' : 'INTERNAL',
        benefName: external
          ? (benef?.benefName ?? subj.customer.customerName)
          : (internalTarget?.accountName ?? null),
        bankCode: external ? (benef?.bankCode ?? bank.bankCode) : null,
        accountNo: external
          ? (benef?.accountNo ?? String(rng.int(1_000_000_000, 9_999_999_999)))
          : (internalTarget?.accountNo ?? null),
        accountType: external
          ? (benef?.accountType ?? 'CURRENT')
          : internalTarget
            ? 'SAVINGS'
            : null,
      });
    });
    if (p.target === 'CANCELLED') {
      const w = at();
      push(w, () =>
        wf.cancel(
          ctxOf(TO, w),
          id(),
          'Customer called to withdraw the instruction before verification'
        )
      );
      continue;
    }
    if (p.target === 'STOPPED') {
      const w = at();
      push(w, () =>
        wf.stopForSignatureMismatch(
          ctxOf(TO, w),
          id(),
          'Signature on the instruction does not match the specimen on file'
        )
      );
      continue;
    }
    // 2. signature
    const sigAt = at();
    push(sigAt, () =>
      wf.verifySignature(ctxOf(TO, sigAt), id(), {
        sigOk: true,
        mandateOk: true,
        ownershipOk: true,
        completeOk: true,
      })
    );
    // 3. call-back (by the customer's Account Officer)
    const cbAt = at();
    const failCall = p.target === 'VERIFICATION';
    push(cbAt, () => {
      const c = subj.customer;
      wf.logCallback(ctxOf(c.accountOfficerId, cbAt), id(), {
        phoneCalled: c.regPhone,
        callDate: isoDatePart(cbAt),
        callTime: isoTimePart(cbAt),
        officerId: c.accountOfficerId,
        amountOk: !failCall,
        instrOk: !failCall,
        benefOk: !failCall,
        purposeOk: !failCall,
        outcome: failCall ? 'UNREACHABLE' : 'CONFIRMED',
        notes: failCall
          ? 'Phone switched off. Will try again after 2pm.'
          : 'Customer confirmed amount, instruction, beneficiary and purpose.',
      });
    });
    if (failCall) continue;
    // 4. Eazybankz
    const cbsAt = at();
    push(cbsAt, () =>
      wf.confirmCbs(ctxOf(TO, cbsAt), id(), {
        cbsSyncedAt: cbsAt,
        fundsReceived: true,
        sourceConfirmed: true,
      })
    );
    // 5. sign & submit
    const subAt = at();
    push(subAt, () => wf.signAndSubmit(ctxOf(TO, subAt), id(), sign(TO)));

    const targetLevel: Record<Target, number> = {
      PENDING_HEAD_TREASURY: 2,
      PENDING_MIS: 3,
      PENDING_AUDIT: 4,
      PENDING_MD: 5,
      PENDING_OPERATIONS: 6,
      EXEC_FAILED: 6,
      EXECUTED: 6,
      COMPLETED: 6,
      RETURNED: p.stopAt ?? 2,
      REJECTED: p.stopAt ?? 2,
      DRAFT: 0,
      VERIFICATION: 0,
      STOPPED: 0,
      CANCELLED: 0,
    };
    const upto = targetLevel[p.target];

    // Optional earlier cycle: returned at a level, corrected and resubmitted.
    if (p.returnedOnceAt) {
      for (let lvl = 2; lvl < p.returnedOnceAt; lvl++) {
        const w = at();
        push(w, () =>
          wf.approve(ctxOf(approverFor[lvl], w), id(), {
            ...sign(approverFor[lvl]),
            comments: 'Checked.',
          })
        );
      }
      const rw = at();
      push(rw, () =>
        wf.returnToMaker(ctxOf(approverFor[p.returnedOnceAt!], rw), id(), rng.pick(RETURN_NOTES))
      );
      const rs = at();
      push(rs, () =>
        wf.signAndSubmit(ctxOf(TO, rs), id(), {
          ...sign(TO),
          comments: 'Corrected as advised and resubmitted.',
        })
      );
    }
    // Approvals up to the target.
    const lastApprove =
      p.target === 'RETURNED' || p.target === 'REJECTED' ? upto - 1 : Math.min(upto - 1, 5);
    for (let lvl = 2; lvl <= lastApprove; lvl++) {
      const w = at();
      push(w, () =>
        wf.approve(ctxOf(approverFor[lvl], w), id(), {
          ...sign(approverFor[lvl]),
          comments: lvl === 5 ? 'Approved.' : 'Reviewed – in order.',
        })
      );
    }
    if (p.target === 'RETURNED') {
      const w = at();
      push(w, () => wf.returnToMaker(ctxOf(approverFor[upto], w), id(), rng.pick(RETURN_NOTES)));
      continue;
    }
    if (p.target === 'REJECTED') {
      const w = at();
      push(w, () => wf.reject(ctxOf(approverFor[upto], w), id(), rng.pick(REJECT_NOTES)));
      continue;
    }
    if (upto < 6 || p.target === 'PENDING_OPERATIONS') continue;

    // Operations.
    const exec = (when: string, fail: boolean) =>
      push(when, () => {
        const txn = findById(db, 'txns', id())!;
        const needs = wf.gapsRequired(db, txn);
        wf.execute(ctxOf(OPS, when), id(), {
          cbsPostingRef: postingRef(when),
          gaps: needs
            ? fail
              ? { ok: false, reason: rng.pick(wf.GAPS_FAILURE_REASONS) }
              : { ok: true, gapsRef: gapsRef(when) }
            : null,
        });
      });
    const needsGapsPlan =
      p.scenario === 'THIRD_PARTY_EXT' ||
      (!!p.external &&
        SCENARIO_META[p.scenario].vouchers.includes('FO') &&
        p.scenario !== 'THIRD_PARTY_INT');
    if (p.target === 'EXEC_FAILED') {
      if (!needsGapsPlan)
        throw new Error(`Seed: EXEC_FAILED plan ${p.key} needs an external payment`);
      exec(at(), true);
      continue;
    }
    if (p.gapsFailFirst) exec(at(), true);
    exec(at(), false);
    if (p.target === 'EXECUTED') continue;
    const confirmAt = p.breach
      ? lagosDateTime(
          nextBusinessDay(addDays(isoDatePart(p.start), 1), holidays),
          `10:${String(rng.int(10, 40)).padStart(2, '0')}`
        )
      : at();
    push(confirmAt, () => wf.confirmCompletion(ctxOf(TO, confirmAt), id()));
  }

  steps.sort((a, b) => parseIso(a.at) - parseIso(b.at) || a.order - b.order);
  for (const s of steps) {
    if (parseIso(s.at) > parseIso(anchor)) throw new Error('Seed: step scheduled in the future');
    try {
      s.run();
    } catch (e) {
      const fe = (e as { fieldErrors?: object }).fieldErrors;
      throw new Error(
        `Seed replay failed (${s.label}) at ${s.at}: ${(e as Error).message}${fe ? ` ${JSON.stringify(fe)}` : ''}`
      );
    }
  }

  // Housekeeping as of now: overdue actives become MATURED; older notifications read; last logins.
  wf.sweepMaturities({ userId: wf.SYSTEM_USER_ID, at: anchor });
  const dayAgo = parseIso(anchor) - 86_400_000;
  for (const n of getDb().notifications) {
    if (parseIso(n.createdAt) < dayAgo) {
      n.readBy = n.targetUserId
        ? [n.targetUserId]
        : users.filter((u) => u.roleCode === n.targetRole).map((u) => u.id);
    }
  }
  users.forEach((u, i) => {
    u.lastLoginAt = addMinutes(anchor, -(30 + i * 47));
  });
}

/**
 * src/mocks/seed.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Realistic Nigerian demo seed data for TreasuryDesk.
 * All dates are generated relative to today so the demo never goes stale.
 * All derived money fields are produced by calling calc.ts functions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { addDays, todayLagos, nowLagosISO } from '@/lib/format';
import { calcInvestment } from '@/lib/calc';
import type {
  AppUser,
  Bank,
  Customer,
  Account,
  Signatory,
  Mandate,
  Investment,
  Beneficiary,
  PublicHoliday,
  SysSetting,
  TreasuryTxn,
  Approval,
  ControlCheck,
  AuditEvent,
  Voucher,
  CallbackLog,
  Instruction,
  Verification,
} from '@/types';

// ─── Date helpers ─────────────────────────────────────────────────────────────
const TODAY = todayLagos();
const NOW = nowLagosISO();

function ts(dateStr: string, time: string): string {
  return `${dateStr}T${time}+01:00`;
}

function daysAgo(n: number): string {
  return addDays(TODAY, -n);
}

// ─── 1. USERS ─────────────────────────────────────────────────────────────────
export const SEED_USERS: AppUser[] = [
  { id: 'usr-001', version: 1, email: 'adaeze.okonkwo@firstmarina.ng', name: 'Adaeze Okonkwo', role: 'TREASURY_OFFICER', department: 'Treasury', staffId: 'FMT-0041', avatarInitials: 'AO', isActive: true, lastLogin: NOW },
  { id: 'usr-002', version: 1, email: 'tunde.bakare@firstmarina.ng', name: 'Tunde Bakare', role: 'ACCOUNT_OFFICER', department: 'Accounts', staffId: 'FMT-0027', avatarInitials: 'TB', isActive: true, lastLogin: NOW },
  { id: 'usr-003', version: 1, email: 'ibrahim.musa@firstmarina.ng', name: 'Ibrahim Musa', role: 'HEAD_TREASURY', department: 'Treasury', staffId: 'FMT-0012', avatarInitials: 'IM', isActive: true, lastLogin: NOW },
  { id: 'usr-004', version: 1, email: 'chiamaka.eze@firstmarina.ng', name: 'Chiamaka Eze', role: 'MIS', department: 'MIS', staffId: 'FMT-0033', avatarInitials: 'CE', isActive: true, lastLogin: NOW },
  { id: 'usr-005', version: 1, email: 'olumide.adeyemi@firstmarina.ng', name: 'Olumide Adeyemi', role: 'INTERNAL_AUDIT', department: 'Audit', staffId: 'FMT-0019', avatarInitials: 'OA', isActive: true, lastLogin: NOW },
  { id: 'usr-006', version: 1, email: 'folake.adebayo@firstmarina.ng', name: 'Mrs. Folake Adebayo', role: 'MANAGING_DIRECTOR', department: 'Management', staffId: 'FMT-0001', avatarInitials: 'FA', isActive: true, lastLogin: NOW },
  { id: 'usr-007', version: 1, email: 'emeka.nwosu@firstmarina.ng', name: 'Emeka Nwosu', role: 'OPERATIONS', department: 'Operations', staffId: 'FMT-0055', avatarInitials: 'EN', isActive: true, lastLogin: NOW },
  { id: 'usr-008', version: 1, email: 'kelechi.obi@firstmarina.ng', name: 'Kelechi Obi', role: 'SYSTEM_ADMIN', department: 'IT', staffId: 'FMT-0009', avatarInitials: 'KO', isActive: true, lastLogin: NOW },
];

// ─── 2. BANKS (20 Nigerian banks with correct CBN codes) ──────────────────────
export const SEED_BANKS: Bank[] = [
  { id: 'bnk-001', version: 1, cbnCode: '058', name: 'Guaranty Trust Bank', shortName: 'GTBank', isActive: true },
  { id: 'bnk-002', version: 1, cbnCode: '044', name: 'Access Bank Plc', shortName: 'Access Bank', isActive: true },
  { id: 'bnk-003', version: 1, cbnCode: '057', name: 'Zenith Bank Plc', shortName: 'Zenith Bank', isActive: true },
  { id: 'bnk-004', version: 1, cbnCode: '011', name: 'First Bank of Nigeria', shortName: 'First Bank', isActive: true },
  { id: 'bnk-005', version: 1, cbnCode: '033', name: 'United Bank for Africa', shortName: 'UBA', isActive: true },
  { id: 'bnk-006', version: 1, cbnCode: '070', name: 'Fidelity Bank Plc', shortName: 'Fidelity Bank', isActive: true },
  { id: 'bnk-007', version: 1, cbnCode: '232', name: 'Sterling Bank Plc', shortName: 'Sterling Bank', isActive: true },
  { id: 'bnk-008', version: 1, cbnCode: '214', name: 'First City Monument Bank', shortName: 'FCMB', isActive: true },
  { id: 'bnk-009', version: 1, cbnCode: '035', name: 'Wema Bank Plc', shortName: 'Wema Bank', isActive: true },
  { id: 'bnk-010', version: 1, cbnCode: '221', name: 'Stanbic IBTC Bank', shortName: 'Stanbic IBTC', isActive: true },
  { id: 'bnk-011', version: 1, cbnCode: '076', name: 'Polaris Bank Limited', shortName: 'Polaris Bank', isActive: true },
  { id: 'bnk-012', version: 1, cbnCode: '050', name: 'Ecobank Nigeria', shortName: 'Ecobank', isActive: true },
  { id: 'bnk-013', version: 1, cbnCode: '082', name: 'Keystone Bank Limited', shortName: 'Keystone Bank', isActive: true },
  { id: 'bnk-014', version: 1, cbnCode: '032', name: 'Union Bank of Nigeria', shortName: 'Union Bank', isActive: true },
  { id: 'bnk-015', version: 1, cbnCode: '215', name: 'Unity Bank Plc', shortName: 'Unity Bank', isActive: true },
  { id: 'bnk-016', version: 1, cbnCode: '301', name: 'Jaiz Bank Plc', shortName: 'Jaiz Bank', isActive: true },
  { id: 'bnk-017', version: 1, cbnCode: '101', name: 'Providus Bank Limited', shortName: 'Providus Bank', isActive: true },
  { id: 'bnk-018', version: 1, cbnCode: '030', name: 'Heritage Bank Plc', shortName: 'Heritage Bank', isActive: false }, // inactive — excluded from pickers
  { id: 'bnk-019', version: 1, cbnCode: '068', name: 'Standard Chartered Bank Nigeria', shortName: 'Standard Chartered', isActive: true },
  { id: 'bnk-020', version: 1, cbnCode: '023', name: 'Citibank Nigeria Limited', shortName: 'Citibank', isActive: true },
];

// ─── 3. CUSTOMERS (40: 28 individuals + 12 corporates) ───────────────────────

// Helper: generate handwriting SVG for signatory specimen
function sigSvg(name: string): string {
  const words = name.split(' ');
  const initials = words.map(w => w[0]).join('');
  const displayName = name.length > 20 ? initials : name;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60"><style>.sig{font-family:'Brush Script MT','Segoe Script','Comic Sans MS',cursive;font-size:28px;fill:#1a237e;}</style><text x="10" y="45" class="sig">${displayName}</text></svg>`;
}

export const SEED_CUSTOMERS: Customer[] = [
  // ── Individuals (28) ──
  { id: 'cust-001', version: 1, cif: 'FMT000101', name: 'Chukwuemeka Obi', customerType: 'INDIVIDUAL', phone: '+2348012345678', email: 'c.obi@gmail.com', bvn: '221****4589', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(400), '09:00:00') },
  { id: 'cust-002', version: 1, cif: 'FMT000102', name: 'Ngozi Adeyemi', customerType: 'INDIVIDUAL', phone: '+2348023456789', email: 'ngozi.adeyemi@yahoo.com', bvn: '221****7823', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: true, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(380), '10:00:00') },
  { id: 'cust-003', version: 1, cif: 'FMT000103', name: 'Babatunde Fashola', customerType: 'INDIVIDUAL', phone: '+2348034567890', email: 'b.fashola@outlook.com', bvn: '221****3341', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(360), '08:30:00') },
  { id: 'cust-004', version: 1, cif: 'FMT000104', name: 'Amina Bello', customerType: 'INDIVIDUAL', phone: '+2348045678901', email: 'amina.bello@gmail.com', bvn: '221****9012', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(350), '11:00:00') },
  { id: 'cust-005', version: 1, cif: 'FMT000105', name: 'Emeka Eze', customerType: 'INDIVIDUAL', phone: '+2348056789012', email: 'emeka.eze@gmail.com', bvn: '221****5567', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: true, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(340), '09:30:00') },
  { id: 'cust-006', version: 1, cif: 'FMT000106', name: 'Fatima Usman', customerType: 'INDIVIDUAL', phone: '+2348067890123', email: 'fatima.usman@hotmail.com', bvn: '221****2234', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(330), '10:15:00') },
  { id: 'cust-007', version: 1, cif: 'FMT000107', name: 'Oluwaseun Adesanya', customerType: 'INDIVIDUAL', phone: '+2348078901234', email: 'seun.adesanya@gmail.com', bvn: '221****8890', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(320), '08:00:00') },
  { id: 'cust-008', version: 1, cif: 'FMT000108', name: 'Chidinma Okafor', customerType: 'INDIVIDUAL', phone: '+2348089012345', email: 'chidinma.okafor@gmail.com', bvn: '221****4456', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(310), '09:45:00') },
  { id: 'cust-009', version: 1, cif: 'FMT000109', name: 'Musa Ibrahim', customerType: 'INDIVIDUAL', phone: '+2348090123456', email: 'musa.ibrahim@gmail.com', bvn: '221****1123', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: true, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(300), '10:30:00') },
  { id: 'cust-010', version: 1, cif: 'FMT000110', name: 'Adaora Nwosu', customerType: 'INDIVIDUAL', phone: '+2348011234567', email: 'adaora.nwosu@yahoo.com', bvn: '221****6678', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(290), '11:15:00') },
  { id: 'cust-011', version: 1, cif: 'FMT000111', name: 'Tunde Ogundimu', customerType: 'INDIVIDUAL', phone: '+2348022345678', email: 'tunde.ogundimu@gmail.com', bvn: '221****3345', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(280), '09:00:00') },
  { id: 'cust-012', version: 1, cif: 'FMT000112', name: 'Kemi Adebayo', customerType: 'INDIVIDUAL', phone: '+2348033456789', email: 'kemi.adebayo@gmail.com', bvn: '221****7789', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(270), '10:00:00') },
  { id: 'cust-013', version: 1, cif: 'FMT000113', name: 'Ifeanyi Chukwu', customerType: 'INDIVIDUAL', phone: '+2348044567890', email: 'ifeanyi.chukwu@outlook.com', bvn: '221****2256', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(260), '08:30:00') },
  { id: 'cust-014', version: 1, cif: 'FMT000114', name: 'Zainab Abdullahi', customerType: 'INDIVIDUAL', phone: '+2348055678901', email: 'zainab.abdullahi@gmail.com', bvn: '221****8912', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(250), '11:00:00') },
  { id: 'cust-015', version: 1, cif: 'FMT000115', name: 'Rotimi Akintola', customerType: 'INDIVIDUAL', phone: '+2348066789012', email: 'rotimi.akintola@gmail.com', bvn: '221****5523', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: true, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(240), '09:30:00') },
  { id: 'cust-016', version: 1, cif: 'FMT000116', name: 'Blessing Okoro', customerType: 'INDIVIDUAL', phone: '+2348077890123', email: 'blessing.okoro@yahoo.com', bvn: '221****1190', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(230), '10:15:00') },
  { id: 'cust-017', version: 1, cif: 'FMT000117', name: 'Uche Okonkwo', customerType: 'INDIVIDUAL', phone: '+2348088901234', email: 'uche.okonkwo@gmail.com', bvn: '221****4467', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(220), '08:00:00') },
  { id: 'cust-018', version: 1, cif: 'FMT000118', name: 'Hauwa Garba', customerType: 'INDIVIDUAL', phone: '+2348099012345', email: 'hauwa.garba@gmail.com', bvn: '221****7734', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(210), '09:45:00') },
  { id: 'cust-019', version: 1, cif: 'FMT000119', name: 'Segun Olatunji', customerType: 'INDIVIDUAL', phone: '+2348010123456', email: 'segun.olatunji@gmail.com', bvn: '221****3301', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(200), '10:30:00') },
  { id: 'cust-020', version: 1, cif: 'FMT000120', name: 'Nkechi Onyekachi', customerType: 'INDIVIDUAL', phone: '+2348021234567', email: 'nkechi.onyekachi@outlook.com', bvn: '221****6645', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(190), '11:15:00') },
  { id: 'cust-021', version: 1, cif: 'FMT000121', name: 'Abdulrahman Suleiman', customerType: 'INDIVIDUAL', phone: '+2348032345678', email: 'a.suleiman@gmail.com', bvn: '221****2212', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(180), '09:00:00') },
  { id: 'cust-022', version: 1, cif: 'FMT000122', name: 'Obiageli Nwachukwu', customerType: 'INDIVIDUAL', phone: '+2348043456789', email: 'obi.nwachukwu@gmail.com', bvn: '221****8878', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(170), '10:00:00') },
  { id: 'cust-023', version: 1, cif: 'FMT000123', name: 'Taiwo Afolabi', customerType: 'INDIVIDUAL', phone: '+2348054567890', email: 'taiwo.afolabi@yahoo.com', bvn: '221****5545', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(160), '08:30:00') },
  { id: 'cust-024', version: 1, cif: 'FMT000124', name: 'Yetunde Balogun', customerType: 'INDIVIDUAL', phone: '+2348065678901', email: 'yetunde.balogun@gmail.com', bvn: '221****1156', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(150), '11:00:00') },
  { id: 'cust-025', version: 1, cif: 'FMT000125', name: 'Chidi Okeke', customerType: 'INDIVIDUAL', phone: '+2348076789012', email: 'chidi.okeke@gmail.com', bvn: '221****4423', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(140), '09:30:00') },
  { id: 'cust-026', version: 1, cif: 'FMT000126', name: 'Mariam Lawal', customerType: 'INDIVIDUAL', phone: '+2348087890123', email: 'mariam.lawal@gmail.com', bvn: '221****7790', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(130), '10:15:00') },
  { id: 'cust-027', version: 1, cif: 'FMT000127', name: 'Emeka Ogbonna', customerType: 'INDIVIDUAL', phone: '+2348098901234', email: 'emeka.ogbonna@outlook.com', bvn: '221****3367', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(120), '08:00:00') },
  { id: 'cust-028', version: 1, cif: 'FMT000128', name: 'Funke Osoba', customerType: 'INDIVIDUAL', phone: '+2348019012345', email: 'funke.osoba@gmail.com', bvn: '221****6634', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: true, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(110), '09:45:00') },
  // ── Corporates (12) ──
  { id: 'cust-029', version: 1, cif: 'FMT000129', name: 'Okafor & Sons Ltd', customerType: 'CORPORATE', phone: '+2348020123456', email: 'finance@okaforandsons.com', bvn: '221****2201', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(500), '09:00:00') },
  { id: 'cust-030', version: 1, cif: 'FMT000130', name: 'Lekki Gardens Estates Ltd', customerType: 'CORPORATE', phone: '+2348031234567', email: 'treasury@lekkigardens.ng', bvn: '221****8856', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(490), '10:00:00') },
  { id: 'cust-031', version: 1, cif: 'FMT000131', name: 'Dangote Cement Plc', customerType: 'CORPORATE', phone: '+2348042345678', email: 'treasury@dangotecement.com', bvn: '221****5523', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: true, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(480), '08:30:00') },
  { id: 'cust-032', version: 1, cif: 'FMT000132', name: 'Transcorp Hotels Plc', customerType: 'CORPORATE', phone: '+2348053456789', email: 'finance@transcorphotels.com', bvn: '221****1190', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(470), '11:00:00') },
  { id: 'cust-033', version: 1, cif: 'FMT000133', name: 'Flour Mills of Nigeria Plc', customerType: 'CORPORATE', phone: '+2348064567890', email: 'treasury@flourmills.com.ng', bvn: '221****4467', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(460), '09:30:00') },
  { id: 'cust-034', version: 1, cif: 'FMT000134', name: 'Nestle Nigeria Plc', customerType: 'CORPORATE', phone: '+2348075678901', email: 'finance@nestle.com.ng', bvn: '221****7734', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(450), '10:15:00') },
  { id: 'cust-035', version: 1, cif: 'FMT000135', name: 'Conoil Plc', customerType: 'CORPORATE', phone: '+2348086789012', email: 'treasury@conoil.com.ng', bvn: '221****3301', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(440), '08:00:00') },
  { id: 'cust-036', version: 1, cif: 'FMT000136', name: 'Vitafoam Nigeria Plc', customerType: 'CORPORATE', phone: '+2348097890123', email: 'finance@vitafoam.com.ng', bvn: '221****6645', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(430), '09:45:00') },
  { id: 'cust-037', version: 1, cif: 'FMT000137', name: 'Primus Interiors Ltd', customerType: 'CORPORATE', phone: '+2348018901234', email: 'accounts@primusinteriors.ng', bvn: '221****2212', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(420), '10:30:00') },
  { id: 'cust-038', version: 1, cif: 'FMT000138', name: 'Eko Atlantic City Ltd', customerType: 'CORPORATE', phone: '+2348029012345', email: 'treasury@ekoatlantic.ng', bvn: '221****8878', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(410), '11:15:00') },
  { id: 'cust-039', version: 1, cif: 'FMT000139', name: 'Seplat Energy Plc', customerType: 'CORPORATE', phone: '+2348030123456', email: 'finance@seplatnig.com', bvn: '221****5545', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: true, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(400), '09:00:00') },
  { id: 'cust-040', version: 1, cif: 'FMT000140', name: 'BUA Cement Plc', customerType: 'CORPORATE', phone: '+2348041234567', email: 'treasury@buacement.com', bvn: '221****1156', accountOfficerId: 'usr-002', accountOfficerName: 'Tunde Bakare', isActive: true, isWhtExempt: false, kycStatus: 'VERIFIED', createdAt: ts(daysAgo(390), '10:00:00') },
];

// ─── 4. SIGNATORIES (1-3 per customer with class A/B and SVG specimen) ────────
export const SEED_SIGNATORIES: Signatory[] = [
  // cust-001
  { id: 'sig-001', version: 1, customerId: 'cust-001', name: 'Chukwuemeka Obi', signatoryClass: 'A', specimenSvg: sigSvg('Chukwuemeka Obi'), isActive: true },
  // cust-002
  { id: 'sig-002', version: 1, customerId: 'cust-002', name: 'Ngozi Adeyemi', signatoryClass: 'A', specimenSvg: sigSvg('Ngozi Adeyemi'), isActive: true },
  { id: 'sig-003', version: 1, customerId: 'cust-002', name: 'Adewale Adeyemi', signatoryClass: 'B', specimenSvg: sigSvg('Adewale Adeyemi'), isActive: true },
  // cust-003
  { id: 'sig-004', version: 1, customerId: 'cust-003', name: 'Babatunde Fashola', signatoryClass: 'A', specimenSvg: sigSvg('Babatunde Fashola'), isActive: true },
  // cust-004
  { id: 'sig-005', version: 1, customerId: 'cust-004', name: 'Amina Bello', signatoryClass: 'A', specimenSvg: sigSvg('Amina Bello'), isActive: true },
  { id: 'sig-006', version: 1, customerId: 'cust-004', name: 'Usman Bello', signatoryClass: 'B', specimenSvg: sigSvg('Usman Bello'), isActive: true },
  // cust-005
  { id: 'sig-007', version: 1, customerId: 'cust-005', name: 'Emeka Eze', signatoryClass: 'A', specimenSvg: sigSvg('Emeka Eze'), isActive: true },
  { id: 'sig-008', version: 1, customerId: 'cust-005', name: 'Chioma Eze', signatoryClass: 'B', specimenSvg: sigSvg('Chioma Eze'), isActive: true },
  { id: 'sig-009', version: 1, customerId: 'cust-005', name: 'Ikenna Eze', signatoryClass: 'B', specimenSvg: sigSvg('Ikenna Eze'), isActive: true },
  // cust-006
  { id: 'sig-010', version: 1, customerId: 'cust-006', name: 'Fatima Usman', signatoryClass: 'A', specimenSvg: sigSvg('Fatima Usman'), isActive: true },
  // cust-007
  { id: 'sig-011', version: 1, customerId: 'cust-007', name: 'Oluwaseun Adesanya', signatoryClass: 'A', specimenSvg: sigSvg('Oluwaseun Adesanya'), isActive: true },
  { id: 'sig-012', version: 1, customerId: 'cust-007', name: 'Adunola Adesanya', signatoryClass: 'B', specimenSvg: sigSvg('Adunola Adesanya'), isActive: true },
  // cust-008
  { id: 'sig-013', version: 1, customerId: 'cust-008', name: 'Chidinma Okafor', signatoryClass: 'A', specimenSvg: sigSvg('Chidinma Okafor'), isActive: true },
  // cust-009
  { id: 'sig-014', version: 1, customerId: 'cust-009', name: 'Musa Ibrahim', signatoryClass: 'A', specimenSvg: sigSvg('Musa Ibrahim'), isActive: true },
  { id: 'sig-015', version: 1, customerId: 'cust-009', name: 'Halima Ibrahim', signatoryClass: 'B', specimenSvg: sigSvg('Halima Ibrahim'), isActive: true },
  // cust-010
  { id: 'sig-016', version: 1, customerId: 'cust-010', name: 'Adaora Nwosu', signatoryClass: 'A', specimenSvg: sigSvg('Adaora Nwosu'), isActive: true },
  // cust-011 to cust-028 (one signatory each for brevity, class A)
  { id: 'sig-017', version: 1, customerId: 'cust-011', name: 'Tunde Ogundimu', signatoryClass: 'A', specimenSvg: sigSvg('Tunde Ogundimu'), isActive: true },
  { id: 'sig-018', version: 1, customerId: 'cust-012', name: 'Kemi Adebayo', signatoryClass: 'A', specimenSvg: sigSvg('Kemi Adebayo'), isActive: true },
  { id: 'sig-019', version: 1, customerId: 'cust-013', name: 'Ifeanyi Chukwu', signatoryClass: 'A', specimenSvg: sigSvg('Ifeanyi Chukwu'), isActive: true },
  { id: 'sig-020', version: 1, customerId: 'cust-014', name: 'Zainab Abdullahi', signatoryClass: 'A', specimenSvg: sigSvg('Zainab Abdullahi'), isActive: true },
  { id: 'sig-021', version: 1, customerId: 'cust-015', name: 'Rotimi Akintola', signatoryClass: 'A', specimenSvg: sigSvg('Rotimi Akintola'), isActive: true },
  { id: 'sig-022', version: 1, customerId: 'cust-016', name: 'Blessing Okoro', signatoryClass: 'A', specimenSvg: sigSvg('Blessing Okoro'), isActive: true },
  { id: 'sig-023', version: 1, customerId: 'cust-017', name: 'Uche Okonkwo', signatoryClass: 'A', specimenSvg: sigSvg('Uche Okonkwo'), isActive: true },
  { id: 'sig-024', version: 1, customerId: 'cust-018', name: 'Hauwa Garba', signatoryClass: 'A', specimenSvg: sigSvg('Hauwa Garba'), isActive: true },
  { id: 'sig-025', version: 1, customerId: 'cust-019', name: 'Segun Olatunji', signatoryClass: 'A', specimenSvg: sigSvg('Segun Olatunji'), isActive: true },
  { id: 'sig-026', version: 1, customerId: 'cust-020', name: 'Nkechi Onyekachi', signatoryClass: 'A', specimenSvg: sigSvg('Nkechi Onyekachi'), isActive: true },
  { id: 'sig-027', version: 1, customerId: 'cust-021', name: 'Abdulrahman Suleiman', signatoryClass: 'A', specimenSvg: sigSvg('Abdulrahman Suleiman'), isActive: true },
  { id: 'sig-028', version: 1, customerId: 'cust-022', name: 'Obiageli Nwachukwu', signatoryClass: 'A', specimenSvg: sigSvg('Obiageli Nwachukwu'), isActive: true },
  { id: 'sig-029', version: 1, customerId: 'cust-023', name: 'Taiwo Afolabi', signatoryClass: 'A', specimenSvg: sigSvg('Taiwo Afolabi'), isActive: true },
  { id: 'sig-030', version: 1, customerId: 'cust-024', name: 'Yetunde Balogun', signatoryClass: 'A', specimenSvg: sigSvg('Yetunde Balogun'), isActive: true },
  { id: 'sig-031', version: 1, customerId: 'cust-025', name: 'Chidi Okeke', signatoryClass: 'A', specimenSvg: sigSvg('Chidi Okeke'), isActive: true },
  { id: 'sig-032', version: 1, customerId: 'cust-026', name: 'Mariam Lawal', signatoryClass: 'A', specimenSvg: sigSvg('Mariam Lawal'), isActive: true },
  { id: 'sig-033', version: 1, customerId: 'cust-027', name: 'Emeka Ogbonna', signatoryClass: 'A', specimenSvg: sigSvg('Emeka Ogbonna'), isActive: true },
  { id: 'sig-034', version: 1, customerId: 'cust-028', name: 'Funke Osoba', signatoryClass: 'A', specimenSvg: sigSvg('Funke Osoba'), isActive: true },
  // Corporates — 2-3 signatories each
  { id: 'sig-035', version: 1, customerId: 'cust-029', name: 'Chukwudi Okafor', signatoryClass: 'A', specimenSvg: sigSvg('Chukwudi Okafor'), isActive: true },
  { id: 'sig-036', version: 1, customerId: 'cust-029', name: 'Ngozi Okafor', signatoryClass: 'B', specimenSvg: sigSvg('Ngozi Okafor'), isActive: true },
  { id: 'sig-037', version: 1, customerId: 'cust-030', name: 'Adebayo Lekki', signatoryClass: 'A', specimenSvg: sigSvg('Adebayo Lekki'), isActive: true },
  { id: 'sig-038', version: 1, customerId: 'cust-030', name: 'Folake Lekki', signatoryClass: 'B', specimenSvg: sigSvg('Folake Lekki'), isActive: true },
  { id: 'sig-039', version: 1, customerId: 'cust-031', name: 'Aliko Dangote', signatoryClass: 'A', specimenSvg: sigSvg('Aliko Dangote'), isActive: true },
  { id: 'sig-040', version: 1, customerId: 'cust-031', name: 'Devakumar Edwin', signatoryClass: 'A', specimenSvg: sigSvg('Devakumar Edwin'), isActive: true },
  { id: 'sig-041', version: 1, customerId: 'cust-031', name: 'Olakunle Alake', signatoryClass: 'B', specimenSvg: sigSvg('Olakunle Alake'), isActive: true },
  { id: 'sig-042', version: 1, customerId: 'cust-032', name: 'Tony Elumelu', signatoryClass: 'A', specimenSvg: sigSvg('Tony Elumelu'), isActive: true },
  { id: 'sig-043', version: 1, customerId: 'cust-032', name: 'Owen Omogiafo', signatoryClass: 'B', specimenSvg: sigSvg('Owen Omogiafo'), isActive: true },
  { id: 'sig-044', version: 1, customerId: 'cust-033', name: 'Omoboyede Olusanya', signatoryClass: 'A', specimenSvg: sigSvg('Omoboyede Olusanya'), isActive: true },
  { id: 'sig-045', version: 1, customerId: 'cust-033', name: 'Boye Olusanya', signatoryClass: 'B', specimenSvg: sigSvg('Boye Olusanya'), isActive: true },
  { id: 'sig-046', version: 1, customerId: 'cust-034', name: 'Wassim Elhusseini', signatoryClass: 'A', specimenSvg: sigSvg('Wassim Elhusseini'), isActive: true },
  { id: 'sig-047', version: 1, customerId: 'cust-034', name: 'Adeola Adetutu', signatoryClass: 'B', specimenSvg: sigSvg('Adeola Adetutu'), isActive: true },
  { id: 'sig-048', version: 1, customerId: 'cust-035', name: 'Nicholas Odinaka', signatoryClass: 'A', specimenSvg: sigSvg('Nicholas Odinaka'), isActive: true },
  { id: 'sig-049', version: 1, customerId: 'cust-036', name: 'Taiwo Adeniyi', signatoryClass: 'A', specimenSvg: sigSvg('Taiwo Adeniyi'), isActive: true },
  { id: 'sig-050', version: 1, customerId: 'cust-036', name: 'Bimbo Adeniyi', signatoryClass: 'B', specimenSvg: sigSvg('Bimbo Adeniyi'), isActive: true },
  { id: 'sig-051', version: 1, customerId: 'cust-037', name: 'Emeka Primus', signatoryClass: 'A', specimenSvg: sigSvg('Emeka Primus'), isActive: true },
  { id: 'sig-052', version: 1, customerId: 'cust-038', name: 'David Eko', signatoryClass: 'A', specimenSvg: sigSvg('David Eko'), isActive: true },
  { id: 'sig-053', version: 1, customerId: 'cust-038', name: 'Sandra Eko', signatoryClass: 'B', specimenSvg: sigSvg('Sandra Eko'), isActive: true },
  { id: 'sig-054', version: 1, customerId: 'cust-039', name: 'Roger Brown', signatoryClass: 'A', specimenSvg: sigSvg('Roger Brown'), isActive: true },
  { id: 'sig-055', version: 1, customerId: 'cust-039', name: 'Effiong Okon', signatoryClass: 'B', specimenSvg: sigSvg('Effiong Okon'), isActive: true },
  { id: 'sig-056', version: 1, customerId: 'cust-040', name: 'Abdul Samad Rabiu', signatoryClass: 'A', specimenSvg: sigSvg('Abdul Samad Rabiu'), isActive: true },
  { id: 'sig-057', version: 1, customerId: 'cust-040', name: 'Yusuf Binji', signatoryClass: 'B', specimenSvg: sigSvg('Yusuf Binji'), isActive: true },
];

// ─── 5. MANDATES ──────────────────────────────────────────────────────────────
export const SEED_MANDATES: Mandate[] = [
  { id: 'mnd-001', version: 1, customerId: 'cust-001', rule: 'SOLE', description: 'Sole signatory — Class A only', isActive: true },
  { id: 'mnd-002', version: 1, customerId: 'cust-002', rule: 'A_AND_B', description: 'Class A and Class B must both sign', isActive: true },
  { id: 'mnd-003', version: 1, customerId: 'cust-003', rule: 'SOLE', description: 'Sole signatory', isActive: true },
  { id: 'mnd-004', version: 1, customerId: 'cust-004', rule: 'ANY_TWO', description: 'Any two signatories', isActive: true },
  { id: 'mnd-005', version: 1, customerId: 'cust-005', rule: 'A_AND_B', description: 'Class A and Class B required', isActive: true },
  { id: 'mnd-006', version: 1, customerId: 'cust-006', rule: 'SOLE', description: 'Sole signatory', isActive: true },
  { id: 'mnd-007', version: 1, customerId: 'cust-007', rule: 'ANY_TWO', description: 'Any two signatories', isActive: true },
  { id: 'mnd-008', version: 1, customerId: 'cust-008', rule: 'SOLE', description: 'Sole signatory', isActive: true },
  { id: 'mnd-009', version: 1, customerId: 'cust-009', rule: 'A_AND_B', description: 'Class A and Class B required', isActive: true },
  { id: 'mnd-010', version: 1, customerId: 'cust-010', rule: 'SOLE', description: 'Sole signatory', isActive: true },
  ...Array.from({ length: 18 }, (_, i) => ({
    id: `mnd-${String(i + 11).padStart(3, '0')}`,
    version: 1,
    customerId: `cust-${String(i + 11).padStart(3, '0')}`,
    rule: (['SOLE', 'ANY_TWO', 'A_AND_B'] as const)[i % 3],
    description: ['Sole signatory', 'Any two signatories', 'Class A and Class B required'][i % 3],
    isActive: true,
  })),
  // Corporates
  { id: 'mnd-029', version: 1, customerId: 'cust-029', rule: 'A_AND_B', description: 'Class A and Class B required', isActive: true },
  { id: 'mnd-030', version: 1, customerId: 'cust-030', rule: 'A_AND_B', description: 'Class A and Class B required', isActive: true },
  { id: 'mnd-031', version: 1, customerId: 'cust-031', rule: 'ANY_TWO', description: 'Any two Class A signatories', isActive: true },
  { id: 'mnd-032', version: 1, customerId: 'cust-032', rule: 'A_AND_B', description: 'Class A and Class B required', isActive: true },
  { id: 'mnd-033', version: 1, customerId: 'cust-033', rule: 'A_AND_B', description: 'Class A and Class B required', isActive: true },
  { id: 'mnd-034', version: 1, customerId: 'cust-034', rule: 'ANY_TWO', description: 'Any two signatories', isActive: true },
  { id: 'mnd-035', version: 1, customerId: 'cust-035', rule: 'SOLE', description: 'Sole signatory', isActive: true },
  { id: 'mnd-036', version: 1, customerId: 'cust-036', rule: 'A_AND_B', description: 'Class A and Class B required', isActive: true },
  { id: 'mnd-037', version: 1, customerId: 'cust-037', rule: 'SOLE', description: 'Sole signatory', isActive: true },
  { id: 'mnd-038', version: 1, customerId: 'cust-038', rule: 'A_AND_B', description: 'Class A and Class B required', isActive: true },
  { id: 'mnd-039', version: 1, customerId: 'cust-039', rule: 'ANY_TWO', description: 'Any two signatories', isActive: true },
  { id: 'mnd-040', version: 1, customerId: 'cust-040', rule: 'A_AND_B', description: 'Class A and Class B required', isActive: true },
];

// ─── 6. ACCOUNTS (SS + PA per customer = 80 accounts) ────────────────────────
function nuban(seed: number): string {
  return String(1000000000 + seed).slice(0, 10);
}

export const SEED_ACCOUNTS: Account[] = SEED_CUSTOMERS.flatMap((c, i) => [
  {
    id: `acc-${String(i * 2 + 1).padStart(3, '0')}`,
    version: 1,
    customerId: c.id,
    nuban: nuban(i * 2 + 1001),
    accountType: 'SS' as const,
    accountTypeLabel: 'Savings Account',
    balance: String((200000 + (i * 3_700_000)) % 150_000_000 + 200_000) + '.00',
    currency: 'NGN',
    isActive: true,
  },
  {
    id: `acc-${String(i * 2 + 2).padStart(3, '0')}`,
    version: 1,
    customerId: c.id,
    nuban: nuban(i * 2 + 1002),
    accountType: 'PA' as const,
    accountTypeLabel: 'Personal Account',
    balance: String((500000 + (i * 5_200_000)) % 150_000_000 + 500_000) + '.00',
    currency: 'NGN',
    isActive: true,
  },
]);

// ─── 7. INVESTMENTS (120) ─────────────────────────────────────────────────────
// Distribution:
//   6 mature today
//   18 mature in next 7 days
//   30 mature in next 30 days
//   10 passed maturity awaiting instruction
//   15 anniversary payments due within 14 days
//   41 other active investments

const PRODUCTS: Array<'TERM' | 'CP' | 'CALL'> = ['TERM', 'CP', 'CALL'];
const TENORS = [30, 60, 90, 180, 270, 365];
const RATES = ['12.00', '13.50', '14.00', '15.00', '16.50', '17.00', '18.00', '19.50', '20.00', '21.00', '22.00', '24.00'];

function makeInvestment(
  idx: number,
  custIdx: number,
  product: 'TERM' | 'CP' | 'CALL',
  principal: string,
  rate: string,
  tenorDays: number,
  effectiveDate: string,
  status: 'ACTIVE' | 'MATURED' | 'ROLLED' | 'TERMINATED' | 'AWAITING_INSTRUCTION',
  anniversaryFrequencyDays?: number,
  nextAnniversaryDate?: string
): Investment {
  const cust = SEED_CUSTOMERS[custIdx % SEED_CUSTOMERS.length];
  const acc = SEED_ACCOUNTS.find(a => a.customerId === cust.id && a.accountType === 'SS')!;
  const maturityDate = addDays(effectiveDate, tenorDays);
  const { interestAmt, withholdingTax, netInterest, totalPayout } = calcInvestment(principal, rate, tenorDays);
  return {
    id: `inv-${String(idx).padStart(3, '0')}`,
    version: 1,
    customerId: cust.id,
    customerName: cust.name,
    customerCif: cust.cif,
    accountId: acc?.id ?? `acc-${String(custIdx * 2 + 1).padStart(3, '0')}`,
    nuban: acc?.nuban ?? nuban(custIdx * 2 + 1001),
    product,
    principalAmt: principal,
    intRate: rate,
    effectiveDate,
    tenorDays,
    maturityDate,
    interestAmt,
    withholdingTax,
    netInterest,
    totalPayout,
    anniversaryFrequencyDays,
    nextAnniversaryDate,
    cbsRef: `EZB-${TODAY.slice(0, 4)}-${String(10000 + idx).padStart(5, '0')}`,
    status,
    createdAt: ts(effectiveDate, '09:00:00'),
  };
}

export const SEED_INVESTMENTS: Investment[] = [
  // 6 mature TODAY
  ...Array.from({ length: 6 }, (_, i) =>
    makeInvestment(i + 1, i, PRODUCTS[i % 3], String(5_000_000 + i * 8_000_000), RATES[i % RATES.length], TENORS[i % TENORS.length], addDays(TODAY, -TENORS[i % TENORS.length]), 'MATURED')
  ),
  // 18 mature in next 7 days
  ...Array.from({ length: 18 }, (_, i) =>
    makeInvestment(i + 7, (i + 6) % 40, PRODUCTS[i % 3], String(3_000_000 + i * 6_000_000), RATES[(i + 2) % RATES.length], TENORS[i % TENORS.length], addDays(TODAY, -(TENORS[i % TENORS.length] - (i % 7 + 1))), 'ACTIVE')
  ),
  // 30 mature in next 30 days
  ...Array.from({ length: 30 }, (_, i) =>
    makeInvestment(i + 25, (i + 24) % 40, PRODUCTS[i % 3], String(2_000_000 + i * 4_500_000), RATES[(i + 4) % RATES.length], TENORS[i % TENORS.length], addDays(TODAY, -(TENORS[i % TENORS.length] - (i % 30 + 8))), 'ACTIVE')
  ),
  // 10 passed maturity awaiting instruction
  ...Array.from({ length: 10 }, (_, i) =>
    makeInvestment(i + 55, (i + 54) % 40, PRODUCTS[i % 3], String(10_000_000 + i * 15_000_000), RATES[(i + 6) % RATES.length], 90, addDays(TODAY, -(90 + i + 1)), 'AWAITING_INSTRUCTION')
  ),
  // 15 with anniversary payments due within 14 days
  ...Array.from({ length: 15 }, (_, i) => {
    const freq = [30, 60, 90][i % 3];
    const nextAnn = addDays(TODAY, i % 14 + 1);
    return makeInvestment(i + 65, (i + 64) % 40, 'TERM', String(20_000_000 + i * 10_000_000), RATES[(i + 8) % RATES.length], 365, addDays(TODAY, -(365 - 180)), 'ACTIVE', freq, nextAnn);
  }),
  // 41 other active investments
  ...Array.from({ length: 41 }, (_, i) =>
    makeInvestment(i + 80, (i + 79) % 40, PRODUCTS[i % 3], String(1_000_000 + i * 3_000_000), RATES[(i + 10) % RATES.length], TENORS[i % TENORS.length], addDays(TODAY, -(i % 60 + 5)), 'ACTIVE')
  ),
];

// ─── 8. TREASURY TRANSACTIONS (60) ────────────────────────────────────────────
// Statuses: DRAFT, VERIFICATION, STOPPED, PENDING_HEAD_TREASURY, PENDING_MIS,
//           PENDING_AUDIT, PENDING_MD, PENDING_OPERATIONS, EXEC_FAILED,
//           EXECUTED, COMPLETED, RETURNED, REJECTED, CANCELLED
// Types: INFLOW, ROLLOVER, MATURITY, PRELIQ, ANNIVERSARY, THIRD_PARTY, TRANSFER
// At least 8 pending at each approval level; 3 SLA breaches

function makeControlChecks(txnId: string, allPassed = true): ControlCheck[] {
  const checks = [
    { code: 'CC-01', label: 'Customer KYC Verified' },
    { code: 'CC-02', label: 'Mandate Signature Verified' },
    { code: 'CC-03', label: 'Customer Call-back Confirmed' },
    { code: 'CC-04', label: 'Investment in CBS Confirmed' },
    { code: 'CC-05', label: 'Rate Within Approved Band' },
    { code: 'CC-06', label: 'Tenor Within Policy Limit' },
    { code: 'CC-07', label: 'Principal Above Minimum Threshold' },
    { code: 'CC-08', label: 'Voucher Generated and Reviewed' },
    { code: 'CC-09', label: 'No Duplicate Transaction' },
    { code: 'CC-10', label: 'WHT Correctly Computed' },
    { code: 'CC-11', label: 'Beneficiary Account Verified' },
    { code: 'CC-12', label: 'SLA Compliance Checked' },
  ];
  return checks.map((c, i) => ({
    id: `cc-${txnId}-${i + 1}`,
    version: 1,
    txnId,
    checkCode: c.code,
    checkLabel: c.label,
    passed: allPassed ? true : i < 10,
    checkedAt: ts(TODAY, `09:${String(i * 3).padStart(2, '0')}:00`),
    checkedBy: 'Adaeze Okonkwo',
  }));
}

function makeApprovals(txnId: string, approvedUpTo: number, returnedAt?: number): Approval[] {
  const levels: Array<{ level: 'TO' | 'HT' | 'MIS' | 'AUDIT' | 'MD'; approver: string; approverId: string }> = [
    { level: 'TO', approver: 'Adaeze Okonkwo', approverId: 'usr-001' },
    { level: 'HT', approver: 'Ibrahim Musa', approverId: 'usr-003' },
    { level: 'MIS', approver: 'Chiamaka Eze', approverId: 'usr-004' },
    { level: 'AUDIT', approver: 'Olumide Adeyemi', approverId: 'usr-005' },
    { level: 'MD', approver: 'Mrs. Folake Adebayo', approverId: 'usr-006' },
  ];
  return levels.map((l, i) => {
    if (returnedAt !== undefined && i === returnedAt) {
      return { id: `apr-${txnId}-${i + 1}`, version: 2, txnId, level: l.level, sequence: i + 1, approver: l.approver, approverId: l.approverId, action: 'RETURNED' as const, comment: 'Returned for correction', actionAt: ts(TODAY, `${String(9 + i).padStart(2, '0')}:30:00`), status: 'RETURNED' as const };
    }
    if (i < approvedUpTo) {
      return { id: `apr-${txnId}-${i + 1}`, version: 2, txnId, level: l.level, sequence: i + 1, approver: l.approver, approverId: l.approverId, action: 'APPROVED' as const, comment: 'Approved', actionAt: ts(TODAY, `${String(8 + i).padStart(2, '0')}:${String(15 + i * 10).padStart(2, '0')}:00`), status: 'APPROVED' as const };
    }
    return { id: `apr-${txnId}-${i + 1}`, version: 1, txnId, level: l.level, sequence: i + 1, status: 'PENDING' as const };
  });
}

function makeTxn(
  idx: number,
  custIdx: number,
  type: 'INFLOW' | 'ROLLOVER' | 'MATURITY' | 'PRELIQ' | 'ANNIVERSARY' | 'THIRD_PARTY' | 'TRANSFER',
  status: 'DRAFT' | 'VERIFICATION' | 'STOPPED' | 'PENDING_HEAD_TREASURY' | 'PENDING_MIS' | 'PENDING_AUDIT' | 'PENDING_MD' | 'PENDING_OPERATIONS' | 'EXEC_FAILED' | 'EXECUTED' | 'COMPLETED' | 'RETURNED' | 'REJECTED' | 'CANCELLED',
  approvedUpTo: number,
  principal: string,
  rate: string,
  tenorDays: number,
  effectiveDate: string,
  opts: {
    slaBreached?: boolean;
    executionRef?: string;
    returnedAt?: number;
    cbsRef?: string;
    voucherNo?: string;
  } = {}
): TreasuryTxn {
  const cust = SEED_CUSTOMERS[custIdx % SEED_CUSTOMERS.length];
  const acc = SEED_ACCOUNTS.find(a => a.customerId === cust.id && a.accountType === 'SS')!;
  const maturityDate = addDays(effectiveDate, tenorDays);
  const { interestAmt, withholdingTax, netInterest, totalPayout } = calcInvestment(principal, rate, tenorDays);
  const txnId = `txn-${String(idx).padStart(3, '0')}`;
  const approvalLevelMap: Record<number, 'HT' | 'MIS' | 'AUDIT' | 'MD' | undefined> = { 0: 'HT', 1: 'MIS', 2: 'AUDIT', 3: 'MD', 4: undefined };
  const currentApprovalLevel = status === 'PENDING_HEAD_TREASURY' ? 'HT'
    : status === 'PENDING_MIS' ? 'MIS'
    : status === 'PENDING_AUDIT' ? 'AUDIT'
    : status === 'PENDING_MD' ? 'MD'
    : undefined;

  const initiatedAt = opts.slaBreached
    ? ts(daysAgo(2), '07:00:00')
    : ts(effectiveDate, `${String(7 + (idx % 4)).padStart(2, '0')}:${String(idx % 60).padStart(2, '0')}:00`);

  return {
    id: txnId,
    version: approvedUpTo + 1,
    ref: `TXN-${TODAY.slice(0, 4)}-${String(idx).padStart(3, '0')}`,
    customerId: cust.id,
    customerName: cust.name,
    customerCif: cust.cif,
    accountNumber: acc?.nuban ?? nuban(custIdx * 2 + 1001),
    type,
    principalAmt: principal,
    intRate: rate,
    tenorDays,
    effectiveDate,
    maturityDate,
    interestAmt,
    withholdingTax,
    netInterest,
    totalPayout,
    status,
    currentApprovalLevel,
    cbsRef: opts.cbsRef ?? (approvedUpTo >= 2 ? `EZB-${TODAY.slice(0, 4)}-${String(20000 + idx).padStart(5, '0')}` : undefined),
    voucherId: approvedUpTo >= 1 ? `vch-${String(idx).padStart(3, '0')}` : undefined,
    voucherNo: opts.voucherNo ?? (approvedUpTo >= 1 ? `VCH-${TODAY.slice(0, 4)}-${String(idx).padStart(3, '0')}` : undefined),
    mandateVerified: approvedUpTo >= 1,
    callbackDone: approvedUpTo >= 1,
    cbsVerified: approvedUpTo >= 2,
    initiatedBy: 'Adaeze Okonkwo',
    initiatedById: 'usr-001',
    initiatedAt,
    updatedAt: ts(TODAY, `${String(9 + (idx % 5)).padStart(2, '0')}:${String(idx % 60).padStart(2, '0')}:00`),
    approvals: makeApprovals(txnId, approvedUpTo, opts.returnedAt),
    controlChecks: makeControlChecks(txnId, approvedUpTo >= 1),
    executionRef: opts.executionRef,
    executedBy: opts.executionRef ? 'Emeka Nwosu' : undefined,
    executedAt: opts.executionRef ? ts(TODAY, '10:30:00') : undefined,
    confirmedAt: status === 'COMPLETED' ? ts(TODAY, '11:00:00') : undefined,
    slaBreached: opts.slaBreached ?? false,
  };
}

const TXN_TYPES: Array<'INFLOW' | 'ROLLOVER' | 'MATURITY' | 'PRELIQ' | 'ANNIVERSARY' | 'THIRD_PARTY' | 'TRANSFER'> = [
  'INFLOW', 'ROLLOVER', 'MATURITY', 'PRELIQ', 'ANNIVERSARY', 'THIRD_PARTY', 'TRANSFER',
];

export const SEED_TRANSACTIONS: TreasuryTxn[] = [
  // ── DRAFT (4) ──
  makeTxn(1, 0, 'INFLOW', 'DRAFT', 0, '5000000.00', '15.00', 90, TODAY),
  makeTxn(2, 1, 'ROLLOVER', 'DRAFT', 0, '10000000.00', '16.50', 180, TODAY),
  makeTxn(3, 2, 'MATURITY', 'DRAFT', 0, '8000000.00', '14.00', 60, TODAY),
  makeTxn(4, 3, 'PRELIQ', 'DRAFT', 0, '15000000.00', '17.00', 90, TODAY),

  // ── VERIFICATION (5) ──
  makeTxn(5, 4, 'INFLOW', 'VERIFICATION', 1, '20000000.00', '18.00', 180, TODAY),
  makeTxn(6, 5, 'ANNIVERSARY', 'VERIFICATION', 1, '50000000.00', '19.50', 365, TODAY),
  makeTxn(7, 6, 'THIRD_PARTY', 'VERIFICATION', 1, '12000000.00', '15.00', 90, TODAY),
  makeTxn(8, 7, 'TRANSFER', 'VERIFICATION', 1, '7500000.00', '13.50', 60, TODAY),
  makeTxn(9, 8, 'ROLLOVER', 'VERIFICATION', 1, '30000000.00', '20.00', 270, TODAY),

  // ── STOPPED (3) ──
  makeTxn(10, 9, 'INFLOW', 'STOPPED', 1, '25000000.00', '16.00', 90, daysAgo(2)),
  makeTxn(11, 10, 'MATURITY', 'STOPPED', 1, '40000000.00', '17.50', 180, daysAgo(3)),
  makeTxn(12, 11, 'PRELIQ', 'STOPPED', 1, '18000000.00', '15.50', 60, daysAgo(1)),

  // ── PENDING_HEAD_TREASURY (9 — at least 8 pending at this level) ──
  makeTxn(13, 12, 'INFLOW', 'PENDING_HEAD_TREASURY', 1, '35000000.00', '18.50', 90, TODAY),
  makeTxn(14, 13, 'ROLLOVER', 'PENDING_HEAD_TREASURY', 1, '60000000.00', '19.00', 180, TODAY),
  makeTxn(15, 14, 'MATURITY', 'PENDING_HEAD_TREASURY', 1, '45000000.00', '17.00', 270, TODAY),
  makeTxn(16, 15, 'PRELIQ', 'PENDING_HEAD_TREASURY', 1, '22000000.00', '16.50', 90, TODAY),
  makeTxn(17, 16, 'ANNIVERSARY', 'PENDING_HEAD_TREASURY', 1, '80000000.00', '20.00', 365, TODAY),
  makeTxn(18, 17, 'THIRD_PARTY', 'PENDING_HEAD_TREASURY', 1, '15000000.00', '15.00', 60, TODAY),
  makeTxn(19, 18, 'TRANSFER', 'PENDING_HEAD_TREASURY', 1, '9000000.00', '14.00', 30, TODAY),
  makeTxn(20, 19, 'INFLOW', 'PENDING_HEAD_TREASURY', 1, '55000000.00', '21.00', 180, TODAY),
  makeTxn(21, 20, 'ROLLOVER', 'PENDING_HEAD_TREASURY', 1, '28000000.00', '18.00', 90, TODAY),

  // ── PENDING_MIS (9 — at least 8 pending at this level) ──
  makeTxn(22, 21, 'INFLOW', 'PENDING_MIS', 2, '70000000.00', '19.50', 180, TODAY),
  makeTxn(23, 22, 'MATURITY', 'PENDING_MIS', 2, '90000000.00', '20.00', 270, TODAY),
  makeTxn(24, 23, 'PRELIQ', 'PENDING_MIS', 2, '33000000.00', '17.50', 90, TODAY),
  makeTxn(25, 24, 'ANNIVERSARY', 'PENDING_MIS', 2, '120000000.00', '22.00', 365, TODAY),
  makeTxn(26, 25, 'THIRD_PARTY', 'PENDING_MIS', 2, '18000000.00', '15.50', 60, TODAY),
  makeTxn(27, 26, 'TRANSFER', 'PENDING_MIS', 2, '11000000.00', '14.50', 30, TODAY),
  makeTxn(28, 27, 'ROLLOVER', 'PENDING_MIS', 2, '65000000.00', '20.50', 180, TODAY),
  makeTxn(29, 28, 'INFLOW', 'PENDING_MIS', 2, '42000000.00', '18.50', 90, TODAY),
  makeTxn(30, 29, 'MATURITY', 'PENDING_MIS', 2, '85000000.00', '21.00', 270, TODAY),

  // ── PENDING_AUDIT (9 — at least 8 pending at this level) ──
  makeTxn(31, 30, 'INFLOW', 'PENDING_AUDIT', 3, '100000000.00', '20.00', 180, TODAY),
  makeTxn(32, 31, 'ROLLOVER', 'PENDING_AUDIT', 3, '150000000.00', '21.50', 365, TODAY),
  makeTxn(33, 32, 'MATURITY', 'PENDING_AUDIT', 3, '75000000.00', '19.00', 270, TODAY),
  makeTxn(34, 33, 'PRELIQ', 'PENDING_AUDIT', 3, '48000000.00', '18.00', 90, TODAY),
  makeTxn(35, 34, 'ANNIVERSARY', 'PENDING_AUDIT', 3, '200000000.00', '22.00', 365, TODAY),
  makeTxn(36, 35, 'THIRD_PARTY', 'PENDING_AUDIT', 3, '25000000.00', '16.00', 60, TODAY),
  makeTxn(37, 36, 'TRANSFER', 'PENDING_AUDIT', 3, '14000000.00', '15.00', 30, TODAY),
  makeTxn(38, 37, 'INFLOW', 'PENDING_AUDIT', 3, '88000000.00', '20.50', 180, TODAY),
  makeTxn(39, 38, 'ROLLOVER', 'PENDING_AUDIT', 3, '55000000.00', '19.50', 90, TODAY),

  // ── PENDING_MD (9 — at least 8 pending at this level) ──
  makeTxn(40, 39, 'INFLOW', 'PENDING_MD', 4, '250000000.00', '21.00', 180, TODAY),
  makeTxn(41, 0, 'ROLLOVER', 'PENDING_MD', 4, '300000000.00', '22.00', 365, TODAY),
  makeTxn(42, 1, 'MATURITY', 'PENDING_MD', 4, '180000000.00', '20.00', 270, TODAY),
  makeTxn(43, 2, 'PRELIQ', 'PENDING_MD', 4, '95000000.00', '19.00', 90, TODAY),
  makeTxn(44, 3, 'ANNIVERSARY', 'PENDING_MD', 4, '400000000.00', '23.00', 365, TODAY),
  makeTxn(45, 4, 'THIRD_PARTY', 'PENDING_MD', 4, '35000000.00', '17.00', 60, TODAY),
  makeTxn(46, 5, 'TRANSFER', 'PENDING_MD', 4, '20000000.00', '16.00', 30, TODAY),
  makeTxn(47, 6, 'INFLOW', 'PENDING_MD', 4, '175000000.00', '21.50', 180, TODAY),
  makeTxn(48, 7, 'ROLLOVER', 'PENDING_MD', 4, '120000000.00', '20.50', 90, TODAY),

  // ── PENDING_OPERATIONS (3) ──
  makeTxn(49, 8, 'INFLOW', 'PENDING_OPERATIONS', 5, '500000000.00', '22.00', 180, TODAY),
  makeTxn(50, 9, 'MATURITY', 'PENDING_OPERATIONS', 5, '220000000.00', '21.00', 270, TODAY),
  makeTxn(51, 10, 'ROLLOVER', 'PENDING_OPERATIONS', 5, '350000000.00', '20.00', 365, TODAY),

  // ── EXEC_FAILED (2) ──
  makeTxn(52, 11, 'INFLOW', 'EXEC_FAILED', 5, '80000000.00', '19.00', 90, daysAgo(1), { executionRef: 'RTGS-FAIL-001' }),
  makeTxn(53, 12, 'THIRD_PARTY', 'EXEC_FAILED', 5, '45000000.00', '18.00', 60, daysAgo(1), { executionRef: 'NIBSS-FAIL-002' }),

  // ── EXECUTED (3) ──
  makeTxn(54, 13, 'INFLOW', 'EXECUTED', 5, '150000000.00', '20.00', 180, daysAgo(1), { executionRef: 'RTGS-2026-001' }),
  makeTxn(55, 14, 'MATURITY', 'EXECUTED', 5, '90000000.00', '19.50', 90, daysAgo(1), { executionRef: 'NIBSS-2026-002' }),
  makeTxn(56, 15, 'ROLLOVER', 'EXECUTED', 5, '200000000.00', '21.00', 365, daysAgo(2), { executionRef: 'RTGS-2026-003' }),

  // ── COMPLETED (4) ──
  makeTxn(57, 16, 'INFLOW', 'COMPLETED', 5, '75000000.00', '18.50', 90, daysAgo(3), { executionRef: 'RTGS-2026-004' }),
  makeTxn(58, 17, 'MATURITY', 'COMPLETED', 5, '130000000.00', '20.00', 180, daysAgo(4), { executionRef: 'NIBSS-2026-005' }),
  makeTxn(59, 18, 'ANNIVERSARY', 'COMPLETED', 5, '250000000.00', '22.00', 365, daysAgo(5), { executionRef: 'RTGS-2026-006' }),
  makeTxn(60, 19, 'PRELIQ', 'COMPLETED', 5, '60000000.00', '17.00', 60, daysAgo(6), { executionRef: 'NIBSS-2026-007' }),

  // ── RETURNED (2) ──
  makeTxn(61, 20, 'INFLOW', 'RETURNED', 2, '40000000.00', '16.50', 90, daysAgo(2), { returnedAt: 2 }),
  makeTxn(62, 21, 'ROLLOVER', 'RETURNED', 1, '55000000.00', '17.50', 180, daysAgo(1), { returnedAt: 1 }),

  // ── REJECTED (2) ──
  makeTxn(63, 22, 'PRELIQ', 'REJECTED', 2, '30000000.00', '15.50', 60, daysAgo(3)),
  makeTxn(64, 23, 'THIRD_PARTY', 'REJECTED', 1, '22000000.00', '14.50', 30, daysAgo(2)),

  // ── CANCELLED (2) ──
  makeTxn(65, 24, 'TRANSFER', 'CANCELLED', 0, '10000000.00', '13.50', 30, daysAgo(1)),
  makeTxn(66, 25, 'INFLOW', 'CANCELLED', 0, '8000000.00', '12.00', 30, daysAgo(2)),

  // ── 3 SLA BREACHES (spread across approval levels) ──
  makeTxn(67, 26, 'INFLOW', 'PENDING_HEAD_TREASURY', 1, '95000000.00', '19.00', 90, daysAgo(3), { slaBreached: true }),
  makeTxn(68, 27, 'MATURITY', 'PENDING_MIS', 2, '110000000.00', '20.00', 180, daysAgo(4), { slaBreached: true }),
  makeTxn(69, 28, 'ROLLOVER', 'PENDING_AUDIT', 3, '140000000.00', '21.00', 270, daysAgo(5), { slaBreached: true }),
];

// ─── 9. VOUCHERS ──────────────────────────────────────────────────────────────
export const SEED_VOUCHERS: Voucher[] = SEED_TRANSACTIONS
  .filter(t => t.voucherId)
  .map(t => {
    const { interestAmt, withholdingTax, netInterest, totalPayout } = calcInvestment(t.principalAmt, t.intRate, t.tenorDays);
    return {
      id: t.voucherId!,
      version: 1,
      txnId: t.id,
      voucherNo: t.voucherNo!,
      principalAmt: t.principalAmt,
      intRate: t.intRate,
      tenorDays: t.tenorDays,
      interestAmt,
      withholdingTax,
      netInterest,
      totalPayout,
      valueDate: t.effectiveDate,
      maturityDate: t.maturityDate,
      narration: `${t.type} — ${t.customerName} — ${t.ref}`,
      generatedBy: 'Adaeze Okonkwo',
      generatedAt: ts(t.effectiveDate, '08:45:00'),
    };
  });

// ─── 10. CALLBACK LOGS ────────────────────────────────────────────────────────
export const SEED_CALLBACK_LOGS: CallbackLog[] = SEED_TRANSACTIONS
  .filter(t => t.callbackDone)
  .slice(0, 30)
  .map((t, i) => ({
    id: `cb-${String(i + 1).padStart(3, '0')}`,
    version: 1,
    txnId: t.id,
    customerId: t.customerId,
    calledBy: 'Adaeze Okonkwo',
    calledAt: ts(t.effectiveDate, `08:${String(i % 60).padStart(2, '0')}:00`),
    phoneUsed: SEED_CUSTOMERS.find(c => c.id === t.customerId)?.phone ?? '+2348012345678',
    outcome: 'CONFIRMED' as const,
    notes: `Customer confirmed instruction for ${t.ref}`,
  }));

// ─── 11. INSTRUCTIONS ─────────────────────────────────────────────────────────
export const SEED_INSTRUCTIONS: Instruction[] = SEED_TRANSACTIONS
  .filter(t => t.mandateVerified)
  .slice(0, 40)
  .map((t, i) => ({
    id: `ins-${String(i + 1).padStart(3, '0')}`,
    version: 1,
    txnId: t.id,
    instructionDate: t.effectiveDate,
    instructionType: t.type,
    details: `Customer instruction to ${t.type.toLowerCase()} investment. Principal: ₦${t.principalAmt}. Rate: ${t.intRate}%. Tenor: ${t.tenorDays} days.`,
    receivedBy: 'Adaeze Okonkwo',
    receivedAt: ts(t.effectiveDate, `07:${String(i % 60).padStart(2, '0')}:00`),
  }));

// ─── 12. VERIFICATIONS ────────────────────────────────────────────────────────
export const SEED_VERIFICATIONS: Verification[] = SEED_TRANSACTIONS
  .filter(t => t.mandateVerified)
  .slice(0, 40)
  .map((t, i) => {
    const sigs = SEED_SIGNATORIES.filter(s => s.customerId === t.customerId);
    return {
      id: `ver-${String(i + 1).padStart(3, '0')}`,
      version: 1,
      txnId: t.id,
      mandateVerified: true,
      signatoryIds: sigs.slice(0, 1).map(s => s.id),
      verifiedBy: 'Adaeze Okonkwo',
      verifiedAt: ts(t.effectiveDate, `07:${String(30 + i % 30).padStart(2, '0')}:00`),
      notes: 'Signature verified against specimen on file',
    };
  });

// ─── 13. BENEFICIARIES (25) ───────────────────────────────────────────────────
const BENE_NAMES = [
  'Chukwuemeka Obi', 'Ngozi Adeyemi', 'Babatunde Fashola', 'Amina Bello', 'Emeka Eze',
  'Fatima Usman', 'Oluwaseun Adesanya', 'Chidinma Okafor', 'Musa Ibrahim', 'Adaora Nwosu',
  'Tunde Ogundimu', 'Kemi Adebayo', 'Ifeanyi Chukwu', 'Zainab Abdullahi', 'Rotimi Akintola',
  'Blessing Okoro', 'Uche Okonkwo', 'Hauwa Garba', 'Segun Olatunji', 'Nkechi Onyekachi',
  'Abdulrahman Suleiman', 'Obiageli Nwachukwu', 'Taiwo Afolabi', 'Yetunde Balogun', 'Chidi Okeke',
];

export const SEED_BENEFICIARIES: Beneficiary[] = BENE_NAMES.map((name, i) => {
  const bank = SEED_BANKS.filter(b => b.isActive)[i % 19];
  const cust = SEED_CUSTOMERS[i % SEED_CUSTOMERS.length];
  return {
    id: `ben-${String(i + 1).padStart(3, '0')}`,
    version: 1,
    customerId: cust.id,
    customerName: cust.name,
    beneficiaryName: name,
    bankId: bank.id,
    bankName: bank.name,
    accountNumber: nuban(3000 + i),
    accountName: name.toUpperCase(),
    isActive: true,
    createdAt: ts(daysAgo(100 + i * 5), '10:00:00'),
  };
});

// ─── 14. PUBLIC HOLIDAYS ──────────────────────────────────────────────────────
function makeHoliday(id: string, date: string, name: string, year: number, isEditable = false): PublicHoliday {
  return { id, version: 1, date, name, year, isEditable };
}

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;

export const SEED_PUBLIC_HOLIDAYS: PublicHoliday[] = [
  // Current year
  makeHoliday('hol-001', `${CURRENT_YEAR}-01-01`, "New Year's Day", CURRENT_YEAR),
  makeHoliday('hol-002', `${CURRENT_YEAR}-04-18`, 'Good Friday', CURRENT_YEAR, true),
  makeHoliday('hol-003', `${CURRENT_YEAR}-04-21`, 'Easter Monday', CURRENT_YEAR, true),
  makeHoliday('hol-004', `${CURRENT_YEAR}-05-01`, "Workers' Day", CURRENT_YEAR),
  makeHoliday('hol-005', `${CURRENT_YEAR}-06-12`, 'Democracy Day', CURRENT_YEAR),
  makeHoliday('hol-006', `${CURRENT_YEAR}-06-06`, 'Eid el-Fitr (approx)', CURRENT_YEAR, true),
  makeHoliday('hol-007', `${CURRENT_YEAR}-06-07`, 'Eid el-Fitr Holiday (approx)', CURRENT_YEAR, true),
  makeHoliday('hol-008', `${CURRENT_YEAR}-09-05`, 'Eid el-Kabir (approx)', CURRENT_YEAR, true),
  makeHoliday('hol-009', `${CURRENT_YEAR}-09-06`, 'Eid el-Kabir Holiday (approx)', CURRENT_YEAR, true),
  makeHoliday('hol-010', `${CURRENT_YEAR}-10-01`, 'Independence Day', CURRENT_YEAR),
  makeHoliday('hol-011', `${CURRENT_YEAR}-11-26`, 'Eid el-Maulud (approx)', CURRENT_YEAR, true),
  makeHoliday('hol-012', `${CURRENT_YEAR}-12-25`, 'Christmas Day', CURRENT_YEAR),
  makeHoliday('hol-013', `${CURRENT_YEAR}-12-26`, 'Boxing Day', CURRENT_YEAR),
  // Next year
  makeHoliday('hol-014', `${NEXT_YEAR}-01-01`, "New Year's Day", NEXT_YEAR),
  makeHoliday('hol-015', `${NEXT_YEAR}-04-03`, 'Good Friday', NEXT_YEAR, true),
  makeHoliday('hol-016', `${NEXT_YEAR}-04-06`, 'Easter Monday', NEXT_YEAR, true),
  makeHoliday('hol-017', `${NEXT_YEAR}-05-01`, "Workers' Day", NEXT_YEAR),
  makeHoliday('hol-018', `${NEXT_YEAR}-06-12`, 'Democracy Day', NEXT_YEAR),
  makeHoliday('hol-019', `${NEXT_YEAR}-05-27`, 'Eid el-Fitr (approx)', NEXT_YEAR, true),
  makeHoliday('hol-020', `${NEXT_YEAR}-05-28`, 'Eid el-Fitr Holiday (approx)', NEXT_YEAR, true),
  makeHoliday('hol-021', `${NEXT_YEAR}-08-25`, 'Eid el-Kabir (approx)', NEXT_YEAR, true),
  makeHoliday('hol-022', `${NEXT_YEAR}-08-26`, 'Eid el-Kabir Holiday (approx)', NEXT_YEAR, true),
  makeHoliday('hol-023', `${NEXT_YEAR}-10-01`, 'Independence Day', NEXT_YEAR),
  makeHoliday('hol-024', `${NEXT_YEAR}-11-15`, 'Eid el-Maulud (approx)', NEXT_YEAR, true),
  makeHoliday('hol-025', `${NEXT_YEAR}-12-25`, 'Christmas Day', NEXT_YEAR),
  makeHoliday('hol-026', `${NEXT_YEAR}-12-26`, 'Boxing Day', NEXT_YEAR),
];

// ─── 15. SETTINGS ─────────────────────────────────────────────────────────────
export const SEED_SETTINGS: SysSetting[] = [
  { key: 'WHT_RATE', value: '10', label: 'Withholding Tax Rate (%)', group: 'Tax' },
  { key: 'PRELIQ_CHARGE_RATE', value: '20', label: 'Pre-Liquidation Charge Rate (%)', group: 'Charges' },
  { key: 'TRANSFER_FEE_RATE', value: '0.10', label: 'Transfer Fee Rate (%)', group: 'Charges' },
  { key: 'DAY_COUNT', value: '365', label: 'Day Count Convention', group: 'Calculation' },
  { key: 'WHT_ON_ANNIVERSARY', value: 'false', label: 'Apply WHT on Anniversary Payments', group: 'Tax' },
  { key: 'WHT_BASIS_PRELIQ', value: 'AFTER_CHARGE', label: 'WHT Basis for Pre-Liquidation', group: 'Tax' },
  { key: 'PARTIAL_PRELIQ_INTEREST', value: 'NOT_PAID', label: 'Partial Pre-Liquidation Interest Treatment', group: 'Calculation' },
  { key: 'TP_FEE_MODE', value: 'DEDUCT', label: 'Third-Party Transfer Fee Mode', group: 'Charges' },
  { key: 'ROLLOVER_C_INTEREST', value: 'PAY_OUT', label: 'Rollover Capitalised Interest Treatment', group: 'Calculation' },
  { key: 'ROLLOVER_A_BASIS', value: 'NET', label: 'Rollover Amount Basis', group: 'Calculation' },
  { key: 'MATURITY_HOLIDAY_RULE', value: 'NEXT_BUSINESS_DAY', label: 'Maturity Date Holiday Rule', group: 'Calendar' },
  { key: 'SLA_CUTOFF', value: '15:00', label: 'SLA Cutoff Time', group: 'SLA' },
  { key: 'SLA_HOURS', value: '8', label: 'SLA Hours', group: 'SLA' },
];

// ─── 16. AUDIT EVENTS ─────────────────────────────────────────────────────────
export const SEED_AUDIT_EVENTS: AuditEvent[] = [
  ...SEED_TRANSACTIONS.slice(0, 20).map((t, i) => ({
    id: `aud-${String(i + 1).padStart(3, '0')}`,
    version: 1,
    entityType: 'TreasuryTxn',
    entityId: t.id,
    action: 'INITIATED',
    performedBy: 'Adaeze Okonkwo',
    performedById: 'usr-001',
    performedAt: t.initiatedAt,
    ipAddress: `10.0.1.${41 + i}`,
  })),
  ...SEED_TRANSACTIONS.filter(t => t.approvals.some(a => a.action === 'APPROVED')).slice(0, 20).map((t, i) => ({
    id: `aud-${String(i + 21).padStart(3, '0')}`,
    version: 1,
    entityType: 'TreasuryTxn',
    entityId: t.id,
    action: 'APPROVED',
    performedBy: 'Ibrahim Musa',
    performedById: 'usr-003',
    performedAt: ts(TODAY, `09:${String(i % 60).padStart(2, '0')}:00`),
    ipAddress: `10.0.1.${22 + i}`,
  })),
  ...SEED_TRANSACTIONS.filter(t => t.status === 'COMPLETED').map((t, i) => ({
    id: `aud-${String(i + 41).padStart(3, '0')}`,
    version: 1,
    entityType: 'TreasuryTxn',
    entityId: t.id,
    action: 'COMPLETED',
    performedBy: 'Emeka Nwosu',
    performedById: 'usr-007',
    performedAt: t.confirmedAt ?? ts(TODAY, '11:00:00'),
    ipAddress: '10.0.1.87',
  })),
  ...SEED_TRANSACTIONS.filter(t => t.status === 'REJECTED').map((t, i) => ({
    id: `aud-${String(i + 45).padStart(3, '0')}`,
    version: 1,
    entityType: 'TreasuryTxn',
    entityId: t.id,
    action: 'REJECTED',
    performedBy: 'Ibrahim Musa',
    performedById: 'usr-003',
    performedAt: ts(TODAY, `09:${String(i * 5).padStart(2, '0')}:00`),
    ipAddress: '10.0.1.22',
  })),
];

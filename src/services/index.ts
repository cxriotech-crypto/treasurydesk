/**
 * Service layer entry point. Screens import services from here only — never the store or seed.
 * Each service has a mock (in-browser store) and an HTTP implementation; NEXT_PUBLIC_USE_MOCK
 * selects which one is exported.
 */
export { authService } from './authService';
export { usersService, PERMISSIONS } from './usersService';
export { banksService } from './banksService';
export { holidaysService } from './holidaysService';
export { settingsService, SETTING_META } from './settingsService';
export { customersService } from './customersService';
export { accountsService } from './accountsService';
export { beneficiariesService } from './beneficiariesService';
export { investmentsService } from './investmentsService';
export { transactionsService } from './transactionsService';
export { vouchersService } from './vouchersService';
export { approvalsService } from './approvalsService';
export { operationsService } from './operationsService';
export { callbacksService } from './callbacksService';
export { notificationsService } from './notificationsService';
export { auditService } from './auditService';
export { reportsService, REPORTS, REPORT_ROLES } from './reportsService';
export { dashboardService } from './dashboardService';
export { calendarService } from './calendarService';
export { AppError, USE_MOCK } from './core';
export { onStoreError } from '@/data/store';

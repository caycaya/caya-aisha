export type UserRole =
  | 'Super Admin'
  | 'HR Admin'
  | 'Management'
  | 'Supervisor'
  | 'Employee';

export type RecordStatus = 'active' | 'archived';

export type EmploymentType = 'Full-Time' | 'Contract' | 'Probation' | 'Intern';
export type EmploymentStatus = 'Active' | 'Inactive';
export type GenderOption = 'Laki-laki' | 'Perempuan';

export type AttendanceStatus = 'Present' | 'Late' | 'Absent' | 'Half-Day' | 'Leave';
export type CorrectionStatus = 'None' | 'Pending' | 'Approved' | 'Rejected';

export type LeaveType = 'Annual' | 'Sick' | 'Personal' | 'Maternity' | 'Unpaid';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export type OvertimeStatus = 'Pending' | 'Approved' | 'Rejected';

export type PayrollWorkflowStatus =
  | 'Draft'
  | 'Calculation'
  | 'HR Review'
  | 'Management Approval'
  | 'Finalized'
  | 'Paid';

export type PerformanceRating = 'Exceeds' | 'Meets' | 'Needs Improvement';
export type PerformanceStatus = 'Draft' | 'Submitted' | 'Acknowledged';
export type AnnouncementCategory = 'Policy' | 'Payroll' | 'Event' | 'Urgent';
export type NotificationType = 'Leave' | 'Overtime' | 'Payroll' | 'Attendance' | 'Announcement';
export type PPh21Method = 'TER' | 'Progressive';

export interface CompanyRecord {
  companyId: string;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
  npwp?: string;
  officeLat?: number;
  officeLng?: number;
  geofenceRadiusMeters?: number;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserAccountRecord {
  uid: string;
  companyId: string;
  employeeId?: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: 'active' | 'inactive';
  departmentId?: string;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EmployeeRecord {
  employeeId: string;
  companyId: string;
  uid: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone?: string;
  address?: string;
  dateOfBirth?: string;
  gender?: GenderOption;
  photoUrl?: string;
  nik?: string;
  npwp?: string;
  departmentId: string;
  positionId: string;
  employmentType: EmploymentType;
  joinDate: string;
  contractStartDate?: string;
  contractEndDate?: string;
  employmentStatus: EmploymentStatus;
  supervisorId?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  shiftId?: string;
  baseSalary?: number;
  positionAllowance?: number;
  transportAllowance?: number;
  mealAllowance?: number;
  documentNotes?: string;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DepartmentRecord {
  departmentId: string;
  companyId: string;
  code: string;
  name: string;
  headEmployeeId?: string;
  description?: string;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PositionRecord {
  positionId: string;
  companyId: string;
  departmentId: string;
  title: string;
  grade?: string;
  defaultBaseSalary: number;
  description?: string;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AttendanceRecord {
  attendanceId: string; // deterministic: {employeeId}_{workDate}
  companyId: string;
  employeeId: string;
  uid: string;
  workDate: string; // YYYY-MM-DD
  shiftId?: string;
  clockInAt: unknown;
  clockOutAt?: unknown;
  clockInLat?: number;
  clockInLng?: number;
  clockOutLat?: number;
  clockOutLng?: number;
  gpsVerified?: boolean;
  clockInSelfie?: string;
  clockOutSelfie?: string;
  lateMinutes?: number;
  workMinutes?: number;
  status: AttendanceStatus;
  correctionStatus?: CorrectionStatus;
  correctionReason?: string;
  sourceDevice?: string;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LeaveRequestRecord {
  leaveRequestId: string;
  companyId: string;
  employeeId: string;
  uid: string;
  supervisorId?: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: unknown;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LeaveBalanceRecord {
  balanceId: string; // {employeeId}_{year}
  companyId: string;
  employeeId: string;
  uid: string;
  year: number;
  annualQuota: number;
  annualUsed: number;
  annualRemaining: number;
  sickQuota?: number;
  sickUsed?: number;
  personalUsed?: number;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ShiftRecord {
  shiftId: string;
  companyId: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  breakMinutes: number;
  lateToleranceMinutes: number;
  workDaysLabel?: string;
  isHoliday?: boolean;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OvertimeRequestRecord {
  overtimeId: string;
  companyId: string;
  employeeId: string;
  uid: string;
  supervisorId?: string;
  overtimeDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  reason: string;
  status: OvertimeStatus;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: unknown;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PayrollRunRecord {
  payrollId: string;
  companyId: string;
  periodMonth: string; // YYYY-MM
  periodLabel: string;
  status: PayrollWorkflowStatus;
  isProvisional: boolean;
  employeeCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNetPay: number;
  reviewedBy?: string;
  approvedBy?: string;
  finalizedAt?: unknown;
  paidAt?: unknown;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PayslipRecord {
  payslipId: string;
  payrollId: string;
  companyId: string;
  employeeId: string;
  uid: string;
  employeeName?: string;
  periodMonth: string;
  periodLabel?: string;
  workflowStatus: PayrollWorkflowStatus;
  isProvisional: boolean;
  basicSalary: number;
  positionAllowance?: number;
  transportAllowance?: number;
  mealAllowance?: number;
  overtimePayment?: number;
  otherAllowances?: number;
  grossIncome: number;
  absenceDeduction?: number;
  lateDeduction?: number;
  bpjsEmployment?: number;
  bpjsHealth?: number;
  pph21?: number;
  otherDeductions?: number;
  totalDeductions: number;
  netPay: number;
  calculationNotes?: string;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PerformanceReviewRecord {
  reviewId: string;
  companyId: string;
  employeeId: string;
  uid: string;
  reviewerId?: string;
  cycleLabel: string;
  kpiScore: number;
  competencyScore?: number;
  overallRating: PerformanceRating;
  strengths?: string;
  improvements?: string;
  status: PerformanceStatus;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AnnouncementRecord {
  announcementId: string;
  companyId: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  publishedAt?: unknown;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NotificationRecord {
  notificationId: string;
  companyId: string;
  recipientEmployeeId?: string;
  recipientUid: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuditLogRecord {
  logId: string;
  companyId: string;
  actorUid: string;
  actorEmail?: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  recordStatus: 'active';
  createdBy: string;
  createdAt?: unknown;
}

export interface SystemSettingsRecord {
  settingId: string;
  companyId: string;
  effectiveDate: string; // YYYY-MM-DD
  bpjsHealthEmployeeRate: number;
  bpjsHealthEmployerRate?: number;
  bpjsHealthCapAmount?: number;
  bpjsJhtEmployeeRate: number;
  bpjsJpEmployeeRate: number;
  bpjsJpCapAmount?: number;
  pph21Method: PPh21Method;
  pph21PtkpAnnual?: number;
  pph21Tier1Rate?: number;
  pph21Tier2Rate?: number;
  overtimeHourlyMultiplier: number;
  absenceDailyPenaltyRate?: number;
  latePenaltyPerMinute?: number;
  requireGpsAttendance?: boolean;
  requireSelfieAttendance?: boolean;
  officeLat?: number;
  officeLng?: number;
  maxGeofenceMeters?: number;
  recordStatus: RecordStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type BackofficePage =
  | 'dashboard'
  | 'employees'
  | 'departments'
  | 'positions'
  | 'attendance'
  | 'leave'
  | 'shifts'
  | 'overtime'
  | 'payroll'
  | 'performance'
  | 'announcements'
  | 'reports'
  | 'audit'
  | 'settings';

export type RbacModule =
  | 'dashboard'
  | 'employees'
  | 'departments'
  | 'positions'
  | 'attendance'
  | 'leave'
  | 'shifts'
  | 'overtime'
  | 'payroll'
  | 'performance'
  | 'announcements'
  | 'reports'
  | 'audit'
  | 'settings'
  | 'users';

export type RbacAction = 'view' | 'create' | 'edit' | 'approve' | 'delete';

export const RBAC_MATRIX: Record<UserRole, Record<RbacModule, RbacAction[]>> = {
  'Super Admin': {
    dashboard: ['view'],
    employees: ['view', 'create', 'edit', 'delete'],
    departments: ['view', 'create', 'edit', 'delete'],
    positions: ['view', 'create', 'edit', 'delete'],
    attendance: ['view', 'create', 'edit', 'approve', 'delete'],
    leave: ['view', 'create', 'edit', 'approve', 'delete'],
    shifts: ['view', 'create', 'edit', 'delete'],
    overtime: ['view', 'create', 'edit', 'approve', 'delete'],
    payroll: ['view', 'create', 'edit', 'approve', 'delete'],
    performance: ['view', 'create', 'edit', 'approve', 'delete'],
    announcements: ['view', 'create', 'edit', 'delete'],
    reports: ['view'],
    audit: ['view'],
    settings: ['view', 'create', 'edit'],
    users: ['view', 'create', 'edit', 'delete'],
  },
  'HR Admin': {
    dashboard: ['view'],
    employees: ['view', 'create', 'edit'],
    departments: ['view', 'create', 'edit'],
    positions: ['view', 'create', 'edit'],
    attendance: ['view', 'create', 'edit', 'approve'],
    leave: ['view', 'create', 'edit', 'approve'],
    shifts: ['view', 'create', 'edit'],
    overtime: ['view', 'create', 'edit', 'approve'],
    payroll: ['view', 'create', 'edit'],
    performance: ['view', 'create', 'edit'],
    announcements: ['view', 'create', 'edit'],
    reports: ['view'],
    audit: ['view'],
    settings: ['view'],
    users: ['view'],
  },
  Management: {
    dashboard: ['view'],
    employees: ['view'],
    departments: ['view'],
    positions: ['view'],
    attendance: ['view'],
    leave: ['view'],
    shifts: ['view'],
    overtime: ['view'],
    payroll: ['view', 'edit', 'approve'],
    performance: ['view', 'create', 'edit', 'approve'],
    announcements: ['view'],
    reports: ['view'],
    audit: ['view'],
    settings: ['view'],
    users: [],
  },
  Supervisor: {
    dashboard: ['view'],
    employees: ['view'],
    departments: ['view'],
    positions: ['view'],
    attendance: ['view', 'approve'],
    leave: ['view', 'approve'],
    shifts: ['view'],
    overtime: ['view', 'approve'],
    payroll: [],
    performance: ['view', 'create', 'edit'],
    announcements: ['view'],
    reports: ['view'],
    audit: [],
    settings: [],
    users: [],
  },
  Employee: {
    dashboard: ['view'],
    employees: [],
    departments: [],
    positions: [],
    attendance: ['view', 'create'],
    leave: ['view', 'create'],
    shifts: ['view'],
    overtime: ['view', 'create'],
    payroll: ['view'],
    performance: ['view'],
    announcements: ['view'],
    reports: [],
    audit: [],
    settings: [],
    users: [],
  },
};

export function hasPermission(
  role: UserRole | undefined | null,
  module: RbacModule,
  action: RbacAction = 'view'
): boolean {
  if (!role) return false;
  return RBAC_MATRIX[role]?.[module]?.includes(action) ?? false;
}

export const FIELD_LIMITS = {
  idRegex: /^[a-zA-Z0-9_-]+$/,
  dateRegex: /^\d{4}-\d{2}-\d{2}$/,
  timeRegex: /^\d{2}:\d{2}$/,
  monthRegex: /^\d{4}-\d{2}$/,
  fullNameMax: 120,
  emailMax: 120,
  reasonMax: 500,
  overtimeReasonMax: 400,
  announcementBodyMax: 2000,
  selfieMaxLength: 650000,
} as const;

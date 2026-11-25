import type {
  AnnouncementRecord,
  AttendanceRecord,
  AuditLogRecord,
  CompanyRecord,
  DepartmentRecord,
  EmployeeRecord,
  LeaveBalanceRecord,
  LeaveRequestRecord,
  NotificationRecord,
  OvertimeRequestRecord,
  PayrollRunRecord,
  PayrollWorkflowStatus,
  PayslipRecord,
  PerformanceReviewRecord,
  PositionRecord,
  ShiftRecord,
  SystemSettingsRecord,
  UserAccountRecord,
  UserRole,
} from '../types/hrms';
import {
  calculateDistanceMeters,
  calculateEmployeePayroll,
  evaluateShiftLateness,
} from './payrollCalculator';
import { formatMonthLabel, getMonthPrefix, getTodayISO } from '../utils/dateFormat';

export interface DemoPersona {
  id: string;
  label: string;
  subtitle: string;
  portal: 'backoffice' | 'employee';
  userAccount: UserAccountRecord;
}

const COMPANY_ID = 'comp_nusantara_01';
const DEMO_STORAGE_KEY = 'kerjapay_hrms_demo_store_v1';
const DEMO_ACTIVE_UID_KEY = 'kerjapay_hrms_demo_uid';

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'demo_uid_superadmin',
    label: 'Super Admin',
    subtitle: 'Aisha Cayca · Akses penuh seluruh 14 modul & RBAC',
    portal: 'backoffice',
    userAccount: {
      uid: 'demo_uid_superadmin',
      companyId: COMPANY_ID,
      employeeId: 'emp_001',
      email: 'demo.superadmin@nusantaradigital.co.id',
      displayName: 'Aisha Cayca (Demo)',
      role: 'Super Admin',
      status: 'active',
      departmentId: 'dept_hr',
      recordStatus: 'active',
      createdBy: 'demo_seed',
    },
  },
  {
    id: 'demo_uid_hr',
    label: 'HR Admin',
    subtitle: 'Sinta Maharani · Karyawan, presensi, cuti & hitung payroll',
    portal: 'backoffice',
    userAccount: {
      uid: 'demo_uid_hr',
      companyId: COMPANY_ID,
      employeeId: 'emp_005',
      email: 'demo.hr@nusantaradigital.co.id',
      displayName: 'Sinta Maharani (Demo)',
      role: 'HR Admin',
      status: 'active',
      departmentId: 'dept_hr',
      recordStatus: 'active',
      createdBy: 'demo_seed',
    },
  },
  {
    id: 'demo_uid_mgmt',
    label: 'Management',
    subtitle: 'Budi Hartono · Approval payroll, laporan & audit log',
    portal: 'backoffice',
    userAccount: {
      uid: 'demo_uid_mgmt',
      companyId: COMPANY_ID,
      employeeId: 'emp_006',
      email: 'demo.management@nusantaradigital.co.id',
      displayName: 'Budi Hartono (Demo)',
      role: 'Management',
      status: 'active',
      departmentId: 'dept_fin',
      recordStatus: 'active',
      createdBy: 'demo_seed',
    },
  },
  {
    id: 'demo_uid_sup',
    label: 'Supervisor',
    subtitle: 'Dimas Santoso · Persetujuan cuti, lembur & kinerja tim',
    portal: 'backoffice',
    userAccount: {
      uid: 'demo_uid_sup',
      companyId: COMPANY_ID,
      employeeId: 'emp_004',
      email: 'dimas.santoso@nusantaradigital.co.id',
      displayName: 'Dimas Santoso (Demo)',
      role: 'Supervisor',
      status: 'active',
      departmentId: 'dept_ops',
      recordStatus: 'active',
      createdBy: 'demo_seed',
    },
  },
  {
    id: 'demo_uid_emp',
    label: 'Karyawan (Mobile ESS)',
    subtitle: 'Raka Pratama · Clock-in selfie & GPS, cuti, lembur, slip gaji',
    portal: 'employee',
    userAccount: {
      uid: 'demo_uid_emp',
      companyId: COMPANY_ID,
      employeeId: 'emp_002',
      email: 'raka.pratama@nusantaradigital.co.id',
      displayName: 'Raka Pratama Wijaya (Demo)',
      role: 'Employee',
      status: 'active',
      departmentId: 'dept_eng',
      recordStatus: 'active',
      createdBy: 'demo_seed',
    },
  },
];

interface DemoDbState {
  company: CompanyRecord;
  settings: SystemSettingsRecord;
  users: UserAccountRecord[];
  employees: EmployeeRecord[];
  departments: DepartmentRecord[];
  positions: PositionRecord[];
  shifts: ShiftRecord[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequestRecord[];
  leaveBalances: LeaveBalanceRecord[];
  overtime: OvertimeRequestRecord[];
  payrollRuns: PayrollRunRecord[];
  payslips: PayslipRecord[];
  performance: PerformanceReviewRecord[];
  announcements: AnnouncementRecord[];
  notifications: NotificationRecord[];
  auditLogs: AuditLogRecord[];
}

function buildInitialDemoState(): DemoDbState {
  const today = getTodayISO();
  const month = getMonthPrefix();
  const year = new Date().getFullYear();
  const nowIso = new Date().toISOString();

  const company: CompanyRecord = {
    companyId: COMPANY_ID,
    name: 'PT Nusantara Digital Karya',
    code: 'NDK-HQ',
    address: 'Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan 12190',
    phone: '+62 21 5550 8899',
    email: 'hr@nusantaradigital.co.id',
    npwp: '01.234.567.8-012.000',
    officeLat: -6.225,
    officeLng: 106.8097,
    geofenceRadiusMeters: 500,
    recordStatus: 'active',
    createdBy: 'demo_uid_superadmin',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const settings: SystemSettingsRecord = {
    settingId: 'settings_default_2026',
    companyId: COMPANY_ID,
    effectiveDate: '2026-01-01',
    bpjsHealthEmployeeRate: 0.01,
    bpjsHealthEmployerRate: 0.04,
    bpjsHealthCapAmount: 12_000_000,
    bpjsJhtEmployeeRate: 0.02,
    bpjsJpEmployeeRate: 0.01,
    bpjsJpCapAmount: 10_042_300,
    pph21Method: 'TER',
    pph21PtkpAnnual: 54_000_000,
    pph21Tier1Rate: 0.05,
    pph21Tier2Rate: 0.15,
    overtimeHourlyMultiplier: 1.5,
    absenceDailyPenaltyRate: 1.0,
    latePenaltyPerMinute: 1500,
    requireGpsAttendance: true,
    requireSelfieAttendance: true,
    officeLat: -6.225,
    officeLng: 106.8097,
    maxGeofenceMeters: 500,
    recordStatus: 'active',
    createdBy: 'demo_uid_superadmin',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const departments: DepartmentRecord[] = [
    { departmentId: 'dept_eng', companyId: COMPANY_ID, code: 'ENG', name: 'Engineering & Product', headEmployeeId: 'emp_002', description: 'Pengembangan platform & aplikasi mobile', recordStatus: 'active', createdBy: 'demo_seed' },
    { departmentId: 'dept_hr', companyId: COMPANY_ID, code: 'HRGA', name: 'People & Operations', headEmployeeId: 'emp_001', description: 'Manajemen SDM, payroll, dan kepatuhan', recordStatus: 'active', createdBy: 'demo_seed' },
    { departmentId: 'dept_fin', companyId: COMPANY_ID, code: 'FIN', name: 'Finance & Tax', headEmployeeId: 'emp_006', description: 'Akuntansi, pajak PPh 21, dan kompensasi', recordStatus: 'active', createdBy: 'demo_seed' },
    { departmentId: 'dept_ops', companyId: COMPANY_ID, code: 'OPS', name: 'Operations & Support', headEmployeeId: 'emp_004', description: 'Operasional lapangan dan layanan pelanggan', recordStatus: 'active', createdBy: 'demo_seed' },
  ];

  const positions: PositionRecord[] = [
    { positionId: 'pos_swe', companyId: COMPANY_ID, departmentId: 'dept_eng', title: 'Senior Software Engineer', grade: 'L4', defaultBaseSalary: 15_000_000, recordStatus: 'active', createdBy: 'demo_seed' },
    { positionId: 'pos_android', companyId: COMPANY_ID, departmentId: 'dept_eng', title: 'Android Kotlin Developer', grade: 'L3', defaultBaseSalary: 11_500_000, recordStatus: 'active', createdBy: 'demo_seed' },
    { positionId: 'pos_hr_mgr', companyId: COMPANY_ID, departmentId: 'dept_hr', title: 'HR & Payroll Specialist', grade: 'M1', defaultBaseSalary: 12_500_000, recordStatus: 'active', createdBy: 'demo_seed' },
    { positionId: 'pos_fin_dir', companyId: COMPANY_ID, departmentId: 'dept_fin', title: 'VP Finance & Operations', grade: 'E1', defaultBaseSalary: 22_000_000, recordStatus: 'active', createdBy: 'demo_seed' },
    { positionId: 'pos_ops_sup', companyId: COMPANY_ID, departmentId: 'dept_ops', title: 'Operations Supervisor', grade: 'S1', defaultBaseSalary: 9_200_000, recordStatus: 'active', createdBy: 'demo_seed' },
  ];

  const shifts: ShiftRecord[] = [
    { shiftId: 'shift_reg', companyId: COMPANY_ID, name: 'Regular Office (Senin - Jumat)', startTime: '08:30', endTime: '17:30', breakMinutes: 60, lateToleranceMinutes: 15, workDaysLabel: 'Senin - Jumat', isHoliday: false, recordStatus: 'active', createdBy: 'demo_seed' },
    { shiftId: 'shift_ops_pagi', companyId: COMPANY_ID, name: 'Operasional Pagi', startTime: '07:00', endTime: '16:00', breakMinutes: 60, lateToleranceMinutes: 10, workDaysLabel: 'Senin - Sabtu', isHoliday: false, recordStatus: 'active', createdBy: 'demo_seed' },
  ];

  const employees: EmployeeRecord[] = [
    {
      employeeId: 'emp_001', companyId: COMPANY_ID, uid: 'demo_uid_superadmin', employeeCode: 'NDK-2026-001',
      fullName: 'Aisha Cayca', email: 'demo.superadmin@nusantaradigital.co.id', phone: '+62 812 8800 1001',
      address: 'Jakarta Selatan', dateOfBirth: '1994-05-14', gender: 'Perempuan',
      photoUrl: '/src/assets/images/avatar_admin_1795590992322.jpg', nik: '3174015405940001', npwp: '89.123.456.7-011.000',
      departmentId: 'dept_hr', positionId: 'pos_hr_mgr', employmentType: 'Full-Time', joinDate: '2024-01-10',
      employmentStatus: 'Active', bankName: 'BCA', bankAccountNumber: '5210998811', bankAccountHolder: 'Aisha Cayca',
      shiftId: 'shift_reg', baseSalary: 14_500_000, positionAllowance: 2_500_000, transportAllowance: 900_000, mealAllowance: 750_000,
      documentNotes: 'SK Pengangkatan Permanen terverifikasi', recordStatus: 'active', createdBy: 'demo_seed',
    },
    {
      employeeId: 'emp_002', companyId: COMPANY_ID, uid: 'demo_uid_emp', employeeCode: 'NDK-2026-002',
      fullName: 'Raka Pratama Wijaya', email: 'raka.pratama@nusantaradigital.co.id', phone: '+62 813 9900 2202',
      address: 'Bandung, Jawa Barat', dateOfBirth: '1996-08-21', gender: 'Laki-laki',
      photoUrl: '/src/assets/images/avatar_emp_1_1795590992124.jpg', nik: '3273012108960004', npwp: '77.456.112.3-422.000',
      departmentId: 'dept_eng', positionId: 'pos_swe', employmentType: 'Full-Time', joinDate: '2024-03-04',
      employmentStatus: 'Active', supervisorId: 'emp_004', bankName: 'Mandiri', bankAccountNumber: '1310009912345', bankAccountHolder: 'Raka Pratama Wijaya',
      shiftId: 'shift_reg', baseSalary: 15_000_000, positionAllowance: 2_000_000, transportAllowance: 850_000, mealAllowance: 750_000,
      documentNotes: 'Kontrak PKWTT & sertifikat keamanan data', recordStatus: 'active', createdBy: 'demo_seed',
    },
    {
      employeeId: 'emp_003', companyId: COMPANY_ID, uid: '', employeeCode: 'NDK-2026-003',
      fullName: 'Nadia Kusuma Putri', email: 'nadia.kusuma@nusantaradigital.co.id', phone: '+62 815 7722 3303',
      address: 'Tangerang Selatan', dateOfBirth: '1997-11-02', gender: 'Perempuan',
      photoUrl: '/src/assets/images/avatar_emp_2_1795590994249.jpg', nik: '3674024211970002', npwp: '66.981.221.4-411.000',
      departmentId: 'dept_eng', positionId: 'pos_android', employmentType: 'Contract', joinDate: '2025-02-01',
      contractStartDate: '2025-02-01', contractEndDate: '2027-01-31', employmentStatus: 'Active', supervisorId: 'emp_004',
      bankName: 'BCA', bankAccountNumber: '4970882210', bankAccountHolder: 'Nadia Kusuma Putri',
      shiftId: 'shift_reg', baseSalary: 11_500_000, positionAllowance: 1_200_000, transportAllowance: 750_000, mealAllowance: 650_000,
      documentNotes: 'PKWT Android Engineering 24 bulan', recordStatus: 'active', createdBy: 'demo_seed',
    },
    {
      employeeId: 'emp_004', companyId: COMPANY_ID, uid: 'demo_uid_sup', employeeCode: 'NDK-2026-004',
      fullName: 'Dimas Santoso', email: 'dimas.santoso@nusantaradigital.co.id', phone: '+62 817 6644 4404',
      address: 'Bekasi', dateOfBirth: '1995-03-19', gender: 'Laki-laki',
      photoUrl: '/src/assets/images/avatar_emp_3_1795590993422.jpg', nik: '3275011903950007', npwp: '54.321.887.2-407.000',
      departmentId: 'dept_ops', positionId: 'pos_ops_sup', employmentType: 'Full-Time', joinDate: '2024-07-15',
      employmentStatus: 'Active', supervisorId: 'emp_001', bankName: 'BNI', bankAccountNumber: '0887711229', bankAccountHolder: 'Dimas Santoso',
      shiftId: 'shift_ops_pagi', baseSalary: 9_200_000, positionAllowance: 1_100_000, transportAllowance: 800_000, mealAllowance: 650_000,
      documentNotes: 'Supervisor operasional area Jabodetabek', recordStatus: 'active', createdBy: 'demo_seed',
    },
    {
      employeeId: 'emp_005', companyId: COMPANY_ID, uid: 'demo_uid_hr', employeeCode: 'NDK-2026-005',
      fullName: 'Sinta Maharani', email: 'demo.hr@nusantaradigital.co.id', phone: '+62 811 2200 5505',
      address: 'Jakarta Pusat', dateOfBirth: '1993-09-09', gender: 'Perempuan',
      photoUrl: '/src/assets/images/avatar_emp_2_1795590994249.jpg', nik: '3171024909930002', npwp: '71.223.445.1-014.000',
      departmentId: 'dept_hr', positionId: 'pos_hr_mgr', employmentType: 'Full-Time', joinDate: '2023-08-01',
      employmentStatus: 'Active', supervisorId: 'emp_001', bankName: 'BCA', bankAccountNumber: '6012233445', bankAccountHolder: 'Sinta Maharani',
      shiftId: 'shift_reg', baseSalary: 12_500_000, positionAllowance: 1_800_000, transportAllowance: 850_000, mealAllowance: 700_000,
      documentNotes: 'HR Admin & Payroll Specialist', recordStatus: 'active', createdBy: 'demo_seed',
    },
    {
      employeeId: 'emp_006', companyId: COMPANY_ID, uid: 'demo_uid_mgmt', employeeCode: 'NDK-2026-006',
      fullName: 'Budi Hartono', email: 'demo.management@nusantaradigital.co.id', phone: '+62 812 7700 6606',
      address: 'Jakarta Barat', dateOfBirth: '1988-01-25', gender: 'Laki-laki',
      photoUrl: '/src/assets/images/avatar_emp_3_1795590993422.jpg', nik: '3173012501880009', npwp: '45.998.112.0-031.000',
      departmentId: 'dept_fin', positionId: 'pos_fin_dir', employmentType: 'Full-Time', joinDate: '2022-04-01',
      employmentStatus: 'Active', bankName: 'Mandiri', bankAccountNumber: '1220088991122', bankAccountHolder: 'Budi Hartono',
      shiftId: 'shift_reg', baseSalary: 22_000_000, positionAllowance: 4_500_000, transportAllowance: 1_200_000, mealAllowance: 900_000,
      documentNotes: 'Management Approver Payroll', recordStatus: 'active', createdBy: 'demo_seed',
    },
  ];

  const leaveBalances: LeaveBalanceRecord[] = employees.map((emp) => ({
    balanceId: `${emp.employeeId}_${year}`,
    companyId: COMPANY_ID,
    employeeId: emp.employeeId,
    uid: emp.uid,
    year,
    annualQuota: 12,
    annualUsed: emp.employeeId === 'emp_002' ? 2 : 0,
    annualRemaining: emp.employeeId === 'emp_002' ? 10 : 12,
    sickQuota: 14,
    sickUsed: 0,
    personalUsed: 0,
    recordStatus: 'active',
    createdBy: 'demo_seed',
  }));

  const clockInToday830 = `${today}T08:26:00`;
  const attendance: AttendanceRecord[] = [
    {
      attendanceId: `emp_004_${today}`, companyId: COMPANY_ID, employeeId: 'emp_004', uid: 'demo_uid_sup',
      workDate: today, shiftId: 'shift_ops_pagi', clockInAt: `${today}T06:58:00`,
      clockInLat: -6.225, clockInLng: 106.8097, gpsVerified: true,
      clockInSelfie: '/src/assets/images/avatar_emp_3_1795590993422.jpg',
      lateMinutes: 0, workMinutes: 0,
      status: 'Present', correctionStatus: 'None', sourceDevice: 'Android Kotlin Compose',
      recordStatus: 'active', createdBy: 'demo_uid_sup',
    },
    {
      attendanceId: `emp_003_${today}`, companyId: COMPANY_ID, employeeId: 'emp_003', uid: '',
      workDate: today, shiftId: 'shift_reg', clockInAt: `${today}T08:52:00`,
      clockInLat: -6.2252, clockInLng: 106.8095, gpsVerified: true,
      clockInSelfie: '/src/assets/images/avatar_emp_2_1795590994249.jpg',
      lateMinutes: 22, workMinutes: 0,
      status: 'Late', correctionStatus: 'None', sourceDevice: 'Web ESS PWA',
      recordStatus: 'active', createdBy: 'demo_seed',
    },
    {
      attendanceId: `emp_002_2026-11-23`, companyId: COMPANY_ID, employeeId: 'emp_002', uid: 'demo_uid_emp',
      workDate: '2026-11-23', shiftId: 'shift_reg', clockInAt: clockInToday830, clockOutAt: `${today}T17:38:00`,
      clockInLat: -6.225, clockInLng: 106.8097, gpsVerified: true,
      clockInSelfie: '/src/assets/images/avatar_emp_1_1795590992124.jpg',
      clockOutSelfie: '/src/assets/images/avatar_emp_1_1795590992124.jpg',
      lateMinutes: 0, workMinutes: 552,
      status: 'Present', correctionStatus: 'None', sourceDevice: 'Web ESS PWA',
      recordStatus: 'active', createdBy: 'demo_uid_emp',
    },
  ];

  const leaves: LeaveRequestRecord[] = [
    {
      leaveRequestId: 'lv_demo_001', companyId: COMPANY_ID, employeeId: 'emp_003', uid: '',
      supervisorId: 'emp_004', leaveType: 'Annual', startDate: today, endDate: today, totalDays: 1,
      reason: 'Keperluan administrasi keluarga di Tangerang', status: 'Pending',
      recordStatus: 'active', createdBy: 'demo_seed', createdAt: nowIso, updatedAt: nowIso,
    },
    {
      leaveRequestId: 'lv_demo_002', companyId: COMPANY_ID, employeeId: 'emp_002', uid: 'demo_uid_emp',
      supervisorId: 'emp_004', leaveType: 'Annual', startDate: '2026-11-12', endDate: '2026-11-13', totalDays: 2,
      reason: 'Acara keluarga di Bandung', status: 'Approved', reviewedBy: 'demo_uid_sup',
      recordStatus: 'active', createdBy: 'demo_uid_emp', createdAt: nowIso, updatedAt: nowIso,
    },
  ];

  const overtime: OvertimeRequestRecord[] = [
    {
      overtimeId: 'ot_demo_001', companyId: COMPANY_ID, employeeId: 'emp_002', uid: 'demo_uid_emp',
      supervisorId: 'emp_004', overtimeDate: today, startTime: '18:00', endTime: '20:30', durationHours: 2.5,
      reason: 'Finalisasi sinkronisasi Firestore & Android Jetpack Compose', status: 'Pending',
      recordStatus: 'active', createdBy: 'demo_uid_emp', createdAt: nowIso, updatedAt: nowIso,
    },
    {
      overtimeId: 'ot_demo_002', companyId: COMPANY_ID, employeeId: 'emp_002', uid: 'demo_uid_emp',
      supervisorId: 'emp_004', overtimeDate: `${month}-10`, startTime: '18:00', endTime: '21:00', durationHours: 3,
      reason: 'Deploy pembaruan sistem payroll', status: 'Approved', reviewedBy: 'demo_uid_sup',
      recordStatus: 'active', createdBy: 'demo_uid_emp', createdAt: nowIso, updatedAt: nowIso,
    },
  ];

  const payrollId = `pay_${month.replace('-', '_')}`;
  const payslips: PayslipRecord[] = employees.map((emp) => {
    const otHrs = emp.employeeId === 'emp_002' ? 3 : 0;
    const calc = calculateEmployeePayroll({
      employee: emp,
      settings,
      approvedOvertimeHours: otHrs,
      absentDays: 0,
      totalLateMinutes: emp.employeeId === 'emp_003' ? 22 : 0,
      workflowStatus: 'HR Review',
    });
    return {
      payslipId: `${payrollId}_${emp.employeeId}`,
      payrollId,
      companyId: COMPANY_ID,
      employeeId: emp.employeeId,
      uid: emp.uid,
      employeeName: emp.fullName,
      periodMonth: month,
      periodLabel: formatMonthLabel(month),
      workflowStatus: 'HR Review',
      ...calc,
      recordStatus: 'active',
      createdBy: 'demo_uid_hr',
    };
  });

  const payrollRuns: PayrollRunRecord[] = [
    {
      payrollId,
      companyId: COMPANY_ID,
      periodMonth: month,
      periodLabel: formatMonthLabel(month),
      status: 'HR Review',
      isProvisional: true,
      employeeCount: payslips.length,
      totalGross: payslips.reduce((a, b) => a + b.grossIncome, 0),
      totalDeductions: payslips.reduce((a, b) => a + b.totalDeductions, 0),
      totalNetPay: payslips.reduce((a, b) => a + b.netPay, 0),
      reviewedBy: 'demo_uid_hr',
      recordStatus: 'active',
      createdBy: 'demo_uid_hr',
    },
  ];

  const performance: PerformanceReviewRecord[] = [
    {
      reviewId: 'perf_demo_001',
      companyId: COMPANY_ID,
      employeeId: 'emp_002',
      uid: 'demo_uid_emp',
      reviewerId: 'emp_004',
      cycleLabel: 'H2 2026 Review',
      kpiScore: 92,
      competencyScore: 90,
      overallRating: 'Exceeds',
      strengths: 'Konsistensi pengiriman fitur dan reliabilitas arsitektur backend.',
      improvements: 'Perkuat mentoring lintas tim Android & QA.',
      status: 'Submitted',
      recordStatus: 'active',
      createdBy: 'demo_uid_sup',
    },
  ];

  const announcements: AnnouncementRecord[] = [
    {
      announcementId: 'ann_demo_001',
      companyId: COMPANY_ID,
      title: 'Kebijakan Presensi Mobile & Perhitungan PPh 21 TER 2026',
      body: 'Seluruh karyawan wajib melakukan Clock-In dan Clock-Out melalui aplikasi Android KerjaPay atau Web ESS dengan verifikasi GPS kantor. Rincian BPJS dan PPh 21 tersedia pada slip gaji bulanan.',
      category: 'Policy',
      publishedAt: nowIso,
      recordStatus: 'active',
      createdBy: 'demo_uid_superadmin',
      createdAt: nowIso,
    },
    {
      announcementId: 'ann_demo_002',
      companyId: COMPANY_ID,
      title: 'Jadwal Persetujuan Payroll Periode Berjalan',
      body: 'HR Admin dan Management diharapkan menuntaskan verifikasi lembur dan payroll sebelum tanggal 26 setiap bulan.',
      category: 'Payroll',
      publishedAt: nowIso,
      recordStatus: 'active',
      createdBy: 'demo_uid_hr',
      createdAt: nowIso,
    },
  ];

  const notifications: NotificationRecord[] = [
    {
      notificationId: 'notif_demo_001',
      companyId: COMPANY_ID,
      recipientEmployeeId: 'emp_002',
      recipientUid: 'demo_uid_emp',
      title: 'Slip Gaji Periode Berjalan Siap Ditinjau',
      message: `Slip gaji ${formatMonthLabel(month)} berstatus HR Review (provisional) telah tersedia di menu Laporan.`,
      type: 'Payroll',
      isRead: false,
      recordStatus: 'active',
      createdBy: 'demo_uid_hr',
      createdAt: nowIso,
    },
  ];

  const auditLogs: AuditLogRecord[] = [
    {
      logId: 'log_demo_001',
      companyId: COMPANY_ID,
      actorUid: 'demo_uid_hr',
      actorEmail: 'demo.hr@nusantaradigital.co.id',
      actorRole: 'HR Admin',
      action: 'PAYROLL_WORKFLOW_TRANSITION',
      targetCollection: 'payroll',
      targetId: payrollId,
      summary: `Mengajukan payroll ${formatMonthLabel(month)} ke tahap HR Review.`,
      recordStatus: 'active',
      createdBy: 'demo_uid_hr',
      createdAt: nowIso,
    },
  ];

  return {
    company,
    settings,
    users: DEMO_PERSONAS.map((p) => p.userAccount),
    employees,
    departments,
    positions,
    shifts,
    attendance,
    leaves,
    leaveBalances,
    overtime,
    payrollRuns,
    payslips,
    performance,
    announcements,
    notifications,
    auditLogs,
  };
}

class DemoSessionManager {
  private state: DemoDbState;
  private activeDemoUid: string | null = null;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;

  constructor() {
    this.state = this.loadState();
    try {
      if (typeof sessionStorage !== 'undefined') {
        this.activeDemoUid = sessionStorage.getItem(DEMO_ACTIVE_UID_KEY);
      }
    } catch {
      this.activeDemoUid = null;
    }

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('kerjapay_hrms_realtime_v1');
        this.channel.onmessage = () => {
          this.state = this.loadState();
          this.listeners.forEach((fn) => fn());
        };
      } catch {
        this.channel = null;
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (ev) => {
        if (ev.key === DEMO_STORAGE_KEY) {
          this.state = this.loadState();
          this.listeners.forEach((fn) => fn());
        }
      });
    }
  }

  private loadState(): DemoDbState {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(DEMO_STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw) as DemoDbState;
        }
      }
    } catch {
      // ignore parse failure
    }
    return buildInitialDemoState();
  }

  private persistAndNotify() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(this.state));
      }
    } catch {
      // ignore quota failure
    }
    try {
      this.channel?.postMessage({ updatedAt: Date.now() });
    } catch {
      // ignore closed channel
    }
    this.listeners.forEach((fn) => fn());
  }

  getActiveDemoUid(): string | null {
    try {
      if (typeof sessionStorage !== 'undefined') {
        return sessionStorage.getItem(DEMO_ACTIVE_UID_KEY) ?? this.activeDemoUid;
      }
    } catch {
      // ignore
    }
    return this.activeDemoUid;
  }

  getActivePersona(): DemoPersona | null {
    const uid = this.getActiveDemoUid();
    if (!uid) return null;
    const base = DEMO_PERSONAS.find((p) => p.id === uid);
    if (!base) return null;
    const latestUser = this.state.users.find((u) => u.uid === base.id) || base.userAccount;
    return {
      ...base,
      userAccount: latestUser,
    };
  }

  loginDemo(personaId: string): DemoPersona {
    const persona = DEMO_PERSONAS.find((p) => p.id === personaId) || DEMO_PERSONAS[0];
    this.activeDemoUid = persona.id;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(DEMO_ACTIVE_UID_KEY, persona.id);
      }
    } catch {
      // ignore
    }
    const latestUser = this.state.users.find((u) => u.uid === persona.id) || persona.userAccount;
    return {
      ...persona,
      userAccount: latestUser,
    };
  }

  logoutDemo() {
    this.activeDemoUid = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(DEMO_ACTIVE_UID_KEY);
      }
    } catch {
      // ignore
    }
  }

  resetDemoData() {
    this.state = buildInitialDemoState();
    this.persistAndNotify();
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    callback();
    return () => {
      this.listeners.delete(callback);
    };
  }

  getSnapshot(role: UserRole, uid: string) {
    const isBackoffice = role === 'Super Admin' || role === 'HR Admin' || role === 'Management' || role === 'Supervisor';
    const isPayrollAdmin = role === 'Super Admin' || role === 'HR Admin' || role === 'Management';
    return {
      company: this.state.company,
      settings: this.state.settings,
      users: role === 'Super Admin' || role === 'HR Admin' ? this.state.users : this.state.users.filter((u) => u.uid === uid),
      employees: isBackoffice ? this.state.employees : this.state.employees.filter((e) => e.uid === uid),
      departments: this.state.departments,
      positions: this.state.positions,
      shifts: this.state.shifts,
      attendance: isBackoffice ? this.state.attendance : this.state.attendance.filter((a) => a.uid === uid),
      leaves: isBackoffice ? this.state.leaves : this.state.leaves.filter((l) => l.uid === uid),
      leaveBalances: isBackoffice ? this.state.leaveBalances : this.state.leaveBalances.filter((b) => b.uid === uid),
      overtime: isBackoffice ? this.state.overtime : this.state.overtime.filter((o) => o.uid === uid),
      payrollRuns: isPayrollAdmin ? this.state.payrollRuns : [],
      payslips: isPayrollAdmin ? this.state.payslips : this.state.payslips.filter((p) => p.uid === uid),
      performance: isBackoffice ? this.state.performance : this.state.performance.filter((r) => r.uid === uid),
      announcements: this.state.announcements,
      notifications: role === 'Super Admin' || role === 'HR Admin' ? this.state.notifications : this.state.notifications.filter((n) => n.recipientUid === uid),
      auditLogs: isPayrollAdmin ? this.state.auditLogs : [],
    };
  }

  private addAudit(actorRole: string, action: string, targetCollection: string, targetId: string, summary: string) {
    const persona = this.getActivePersona();
    const uid = persona?.userAccount.uid || 'demo_uid';
    this.state.auditLogs = [
      {
        logId: `log_${Date.now()}`,
        companyId: COMPANY_ID,
        actorUid: uid,
        actorEmail: persona?.userAccount.email || '',
        actorRole,
        action,
        targetCollection,
        targetId,
        summary,
        recordStatus: 'active',
        createdBy: uid,
        createdAt: new Date().toISOString(),
      },
      ...this.state.auditLogs,
    ];
  }

  saveEmployee(payload: Omit<EmployeeRecord, 'createdBy' | 'createdAt' | 'updatedAt' | 'recordStatus'>, isNew: boolean, actorRole: string) {
    const now = new Date().toISOString();
    if (isNew) {
      const rec: EmployeeRecord = { ...payload, recordStatus: 'active', createdBy: 'demo', createdAt: now, updatedAt: now };
      this.state.employees = [rec, ...this.state.employees];
      const year = new Date().getFullYear();
      this.state.leaveBalances = [
        {
          balanceId: `${payload.employeeId}_${year}`,
          companyId: payload.companyId || COMPANY_ID,
          employeeId: payload.employeeId,
          uid: payload.uid || '',
          year,
          annualQuota: 12,
          annualUsed: 0,
          annualRemaining: 12,
          sickQuota: 14,
          sickUsed: 0,
          personalUsed: 0,
          recordStatus: 'active',
          createdBy: 'demo',
        },
        ...this.state.leaveBalances,
      ];
      this.addAudit(actorRole, 'EMPLOYEE_CREATE', 'employees', payload.employeeId, `Menambahkan karyawan demo: ${payload.fullName}.`);
    } else {
      this.state.employees = this.state.employees.map((e) =>
        e.employeeId === payload.employeeId ? { ...e, ...payload, updatedAt: now } : e
      );
      this.addAudit(actorRole, 'EMPLOYEE_UPDATE', 'employees', payload.employeeId, `Memperbarui karyawan demo: ${payload.fullName}.`);
    }
    this.persistAndNotify();
  }

  updateUserRole(targetUid: string, role: UserRole, status: 'active' | 'inactive', actorRole: string, employeeId?: string) {
    this.state.users = this.state.users.map((u) =>
      u.uid === targetUid ? { ...u, role, status, ...(employeeId !== undefined ? { employeeId } : {}) } : u
    );
    this.addAudit(actorRole, 'USER_RBAC_UPDATE', 'users', targetUid, `Mengubah peran demo ${targetUid} -> ${role} (${status}).`);
    this.persistAndNotify();
  }

  saveDepartment(payload: Pick<DepartmentRecord, 'departmentId' | 'companyId' | 'code' | 'name' | 'headEmployeeId' | 'description'>, isNew: boolean, actorRole: string) {
    if (isNew) {
      this.state.departments = [...this.state.departments, { ...payload, recordStatus: 'active', createdBy: 'demo' }];
    } else {
      this.state.departments = this.state.departments.map((d) => (d.departmentId === payload.departmentId ? { ...d, ...payload } : d));
    }
    this.addAudit(actorRole, isNew ? 'DEPARTMENT_CREATE' : 'DEPARTMENT_UPDATE', 'departments', payload.departmentId, `Departemen ${payload.name}`);
    this.persistAndNotify();
  }

  savePosition(payload: Pick<PositionRecord, 'positionId' | 'companyId' | 'departmentId' | 'title' | 'grade' | 'defaultBaseSalary' | 'description'>, isNew: boolean, actorRole: string) {
    if (isNew) {
      this.state.positions = [...this.state.positions, { ...payload, recordStatus: 'active', createdBy: 'demo' }];
    } else {
      this.state.positions = this.state.positions.map((p) => (p.positionId === payload.positionId ? { ...p, ...payload } : p));
    }
    this.addAudit(actorRole, isNew ? 'POSITION_CREATE' : 'POSITION_UPDATE', 'positions', payload.positionId, `Jabatan ${payload.title}`);
    this.persistAndNotify();
  }

  saveShift(payload: Pick<ShiftRecord, 'shiftId' | 'companyId' | 'name' | 'startTime' | 'endTime' | 'breakMinutes' | 'lateToleranceMinutes' | 'workDaysLabel' | 'isHoliday'>, isNew: boolean, actorRole: string) {
    if (isNew) {
      this.state.shifts = [...this.state.shifts, { ...payload, recordStatus: 'active', createdBy: 'demo' }];
    } else {
      this.state.shifts = this.state.shifts.map((s) => (s.shiftId === payload.shiftId ? { ...s, ...payload } : s));
    }
    this.addAudit(actorRole, isNew ? 'SHIFT_CREATE' : 'SHIFT_UPDATE', 'shifts', payload.shiftId, `Shift ${payload.name}`);
    this.persistAndNotify();
  }

  clockIn(params: { employee: EmployeeRecord; shift?: ShiftRecord; settings?: SystemSettingsRecord; lat?: number; lng?: number; selfieDataUrl?: string; sourceDevice?: string }) {
    const workDate = getTodayISO();
    const attendanceId = `${params.employee.employeeId}_${workDate}`;
    if (this.state.attendance.some((a) => a.attendanceId === attendanceId)) {
      throw new Error(`DUPLICATE_ATTENDANCE: Presensi masuk untuk tanggal ${workDate} sudah tercatat.`);
    }
    const { lateMinutes, status } = evaluateShiftLateness(new Date(), params.shift);
    let gpsVerified = true;
    if (params.settings?.requireGpsAttendance && params.settings.officeLat && params.settings.officeLng) {
      gpsVerified =
        typeof params.lat === 'number' && typeof params.lng === 'number'
          ? calculateDistanceMeters(params.lat, params.lng, params.settings.officeLat, params.settings.officeLng) <=
            (params.settings.maxGeofenceMeters ?? 500)
          : false;
    }
    const rec: AttendanceRecord = {
      attendanceId,
      companyId: params.employee.companyId,
      employeeId: params.employee.employeeId,
      uid: params.employee.uid || this.getActiveDemoUid() || 'demo',
      workDate,
      shiftId: params.shift?.shiftId || params.employee.shiftId || 'shift_reg',
      clockInAt: new Date().toISOString(),
      clockInLat: params.lat,
      clockInLng: params.lng,
      gpsVerified,
      clockInSelfie: params.selfieDataUrl,
      lateMinutes,
      workMinutes: 0,
      status,
      correctionStatus: 'None',
      sourceDevice: params.sourceDevice || 'Demo ESS PWA',
      recordStatus: 'active',
      createdBy: 'demo',
    };
    this.state.attendance = [rec, ...this.state.attendance];
    this.persistAndNotify();
    return { attendanceId, status, lateMinutes, gpsVerified };
  }

  clockOut(params: { employee: EmployeeRecord; lat?: number; lng?: number; selfieDataUrl?: string }) {
    const workDate = getTodayISO();
    const attendanceId = `${params.employee.employeeId}_${workDate}`;
    const existing = this.state.attendance.find((a) => a.attendanceId === attendanceId);
    if (!existing) throw new Error('NO_CLOCK_IN: Anda belum melakukan Clock-In hari ini.');
    if (existing.clockOutAt) throw new Error('ALREADY_CLOCKED_OUT: Presensi pulang hari ini sudah tercatat.');
    const inDate = existing.clockInAt ? new Date(String(existing.clockInAt)) : new Date();
    const workMinutes = Math.max(0, Math.round((Date.now() - inDate.getTime()) / 60000));
    this.state.attendance = this.state.attendance.map((a) =>
      a.attendanceId === attendanceId
        ? { ...a, clockOutAt: new Date().toISOString(), clockOutLat: params.lat, clockOutLng: params.lng, clockOutSelfie: params.selfieDataUrl, workMinutes }
        : a
    );
    this.persistAndNotify();
    return { workMinutes };
  }

  requestCorrection(attendanceId: string, reason: string) {
    this.state.attendance = this.state.attendance.map((a) =>
      a.attendanceId === attendanceId ? { ...a, correctionStatus: 'Pending', correctionReason: reason } : a
    );
    this.persistAndNotify();
  }

  resolveCorrection(attendanceId: string, decision: 'Approved' | 'Rejected', newStatus: AttendanceRecord['status'], actorRole: string) {
    this.state.attendance = this.state.attendance.map((a) =>
      a.attendanceId === attendanceId
        ? { ...a, correctionStatus: decision, ...(decision === 'Approved' ? { status: newStatus } : {}) }
        : a
    );
    this.addAudit(actorRole, `ATTENDANCE_CORRECTION_${decision.toUpperCase()}`, 'attendance', attendanceId, `Koreksi presensi ${attendanceId}: ${decision}`);
    this.persistAndNotify();
  }

  submitLeave(params: { employee: EmployeeRecord; leaveType: LeaveRequestRecord['leaveType']; startDate: string; endDate: string; totalDays: number; reason: string }) {
    const leaveRequestId = `lv_${Date.now()}`;
    this.state.leaves = [
      {
        leaveRequestId,
        companyId: params.employee.companyId,
        employeeId: params.employee.employeeId,
        uid: params.employee.uid || this.getActiveDemoUid() || 'demo',
        supervisorId: params.employee.supervisorId || '',
        leaveType: params.leaveType,
        startDate: params.startDate,
        endDate: params.endDate,
        totalDays: Math.max(1, params.totalDays),
        reason: params.reason,
        status: 'Pending',
        recordStatus: 'active',
        createdBy: 'demo',
        createdAt: new Date().toISOString(),
      },
      ...this.state.leaves,
    ];
    this.persistAndNotify();
  }

  decideLeave(params: { leave: LeaveRequestRecord; decision: 'Approved' | 'Rejected'; rejectionReason?: string; actorRole: string }) {
    const target = this.state.leaves.find((l) => l.leaveRequestId === params.leave.leaveRequestId);
    if (!target || target.status !== 'Pending') {
      throw new Error(`CONFLICT_LEAVE: Pengajuan cuti ini sudah berstatus ${target?.status || 'tidak diketahui'}.`);
    }
    this.state.leaves = this.state.leaves.map((l) =>
      l.leaveRequestId === params.leave.leaveRequestId
        ? { ...l, status: params.decision, rejectionReason: params.decision === 'Rejected' ? params.rejectionReason || 'Ditolak' : '' }
        : l
    );
    if (params.decision === 'Approved' && target.leaveType === 'Annual') {
      this.state.leaveBalances = this.state.leaveBalances.map((b) =>
        b.employeeId === target.employeeId
          ? {
              ...b,
              annualUsed: b.annualUsed + target.totalDays,
              annualRemaining: Math.max(0, b.annualQuota - (b.annualUsed + target.totalDays)),
            }
          : b
      );
    }
    if (target.uid) {
      this.state.notifications = [
        {
          notificationId: `notif_${Date.now()}`,
          companyId: target.companyId,
          recipientEmployeeId: target.employeeId,
          recipientUid: target.uid,
          title: `Pengajuan Cuti ${params.decision === 'Approved' ? 'Disetujui' : 'Ditolak'}`,
          message: `Cuti ${target.leaveType} (${target.startDate} s.d. ${target.endDate}) telah ${params.decision === 'Approved' ? 'disetujui' : 'ditolak'}.`,
          type: 'Leave',
          isRead: false,
          recordStatus: 'active',
          createdBy: 'demo',
          createdAt: new Date().toISOString(),
        },
        ...this.state.notifications,
      ];
    }
    this.addAudit(params.actorRole, `LEAVE_${params.decision.toUpperCase()}`, 'leave_requests', target.leaveRequestId, `Cuti ${target.employeeId} (${target.totalDays} hari) -> ${params.decision}`);
    this.persistAndNotify();
  }

  submitOvertime(params: { employee: EmployeeRecord; overtimeDate: string; startTime: string; endTime: string; durationHours: number; reason: string }) {
    this.state.overtime = [
      {
        overtimeId: `ot_${Date.now()}`,
        companyId: params.employee.companyId,
        employeeId: params.employee.employeeId,
        uid: params.employee.uid || this.getActiveDemoUid() || 'demo',
        overtimeDate: params.overtimeDate,
        startTime: params.startTime,
        endTime: params.endTime,
        durationHours: params.durationHours,
        reason: params.reason,
        status: 'Pending',
        recordStatus: 'active',
        createdBy: 'demo',
        createdAt: new Date().toISOString(),
      },
      ...this.state.overtime,
    ];
    this.persistAndNotify();
  }

  decideOvertime(params: { overtime: OvertimeRequestRecord; decision: 'Approved' | 'Rejected'; rejectionReason?: string; actorRole: string }) {
    this.state.overtime = this.state.overtime.map((o) =>
      o.overtimeId === params.overtime.overtimeId
        ? { ...o, status: params.decision, rejectionReason: params.decision === 'Rejected' ? params.rejectionReason || 'Ditolak' : '' }
        : o
    );
    this.addAudit(params.actorRole, `OVERTIME_${params.decision.toUpperCase()}`, 'overtime_requests', params.overtime.overtimeId, `Lembur ${params.overtime.employeeId} (${params.overtime.durationHours} jam) -> ${params.decision}`);
    this.persistAndNotify();
  }

  generatePayroll(params: { periodMonth?: string; employees: EmployeeRecord[]; attendance: AttendanceRecord[]; overtime: OvertimeRequestRecord[]; settings: SystemSettingsRecord; existingRun?: PayrollRunRecord; actorRole: string }) {
    const periodMonth = params.periodMonth || getMonthPrefix();
    const payrollId = `pay_${periodMonth.replace('-', '_')}`;
    if (params.existingRun?.status === 'Paid') {
      throw new Error('Payroll periode ini sudah berstatus Paid dan terkunci permanen.');
    }
    const activeEmps = this.state.employees.filter((e) => e.employmentStatus === 'Active');
    const newSlips: PayslipRecord[] = activeEmps.map((emp) => {
      const otHrs = this.state.overtime
        .filter((o) => o.employeeId === emp.employeeId && o.status === 'Approved' && o.overtimeDate.startsWith(periodMonth))
        .reduce((a, o) => a + o.durationHours, 0);
      const empAtt = this.state.attendance.filter((a) => a.employeeId === emp.employeeId && a.workDate.startsWith(periodMonth));
      const calc = calculateEmployeePayroll({
        employee: emp,
        settings: this.state.settings,
        approvedOvertimeHours: otHrs,
        absentDays: empAtt.filter((a) => a.status === 'Absent').length,
        totalLateMinutes: empAtt.reduce((a, aItem) => a + (aItem.lateMinutes || 0), 0),
        workflowStatus: 'Calculation',
      });
      return {
        payslipId: `${payrollId}_${emp.employeeId}`,
        payrollId,
        companyId: COMPANY_ID,
        employeeId: emp.employeeId,
        uid: emp.uid,
        employeeName: emp.fullName,
        periodMonth,
        periodLabel: formatMonthLabel(periodMonth),
        workflowStatus: 'Calculation',
        ...calc,
        recordStatus: 'active',
        createdBy: 'demo',
      };
    });

    const newRun: PayrollRunRecord = {
      payrollId,
      companyId: COMPANY_ID,
      periodMonth,
      periodLabel: formatMonthLabel(periodMonth),
      status: 'Calculation',
      isProvisional: true,
      employeeCount: newSlips.length,
      totalGross: newSlips.reduce((a, b) => a + b.grossIncome, 0),
      totalDeductions: newSlips.reduce((a, b) => a + b.totalDeductions, 0),
      totalNetPay: newSlips.reduce((a, b) => a + b.netPay, 0),
      recordStatus: 'active',
      createdBy: 'demo',
    };

    this.state.payslips = [...this.state.payslips.filter((s) => s.payrollId !== payrollId), ...newSlips];
    this.state.payrollRuns = [newRun, ...this.state.payrollRuns.filter((r) => r.payrollId !== payrollId)];
    this.addAudit(params.actorRole, 'PAYROLL_CALCULATE', 'payroll', payrollId, `Menghitung payroll demo ${formatMonthLabel(periodMonth)} (${newSlips.length} karyawan).`);
    this.persistAndNotify();
    return payrollId;
  }

  advancePayroll(params: { run: PayrollRunRecord; nextStatus: PayrollWorkflowStatus; actorRole: string }) {
    if (params.run.status === 'Paid') throw new Error('Payroll sudah berstatus Paid dan tidak dapat diubah.');
    const isProvisional = params.nextStatus !== 'Finalized' && params.nextStatus !== 'Paid';
    this.state.payrollRuns = this.state.payrollRuns.map((r) =>
      r.payrollId === params.run.payrollId ? { ...r, status: params.nextStatus, isProvisional } : r
    );
    this.state.payslips = this.state.payslips.map((s) =>
      s.payrollId === params.run.payrollId ? { ...s, workflowStatus: params.nextStatus, isProvisional } : s
    );
    this.addAudit(params.actorRole, 'PAYROLL_WORKFLOW_TRANSITION', 'payroll', params.run.payrollId, `Status payroll ${params.run.periodLabel} -> ${params.nextStatus}.`);
    this.persistAndNotify();
  }

  savePerformance(payload: Omit<PerformanceReviewRecord, 'createdBy' | 'createdAt' | 'updatedAt' | 'recordStatus'>, isNew: boolean, actorRole: string) {
    if (isNew) {
      this.state.performance = [{ ...payload, recordStatus: 'active', createdBy: 'demo' }, ...this.state.performance];
    } else {
      this.state.performance = this.state.performance.map((r) => (r.reviewId === payload.reviewId ? { ...r, ...payload } : r));
    }
    this.addAudit(actorRole, 'PERFORMANCE_UPDATE', 'performance_reviews', payload.reviewId, `Evaluasi kinerja ${payload.employeeId}`);
    this.persistAndNotify();
  }

  acknowledgePerformance(reviewId: string) {
    this.state.performance = this.state.performance.map((r) => (r.reviewId === reviewId ? { ...r, status: 'Acknowledged' } : r));
    this.persistAndNotify();
  }

  publishAnnouncement(payload: Pick<AnnouncementRecord, 'companyId' | 'title' | 'body' | 'category'>, actorRole: string) {
    const ann: AnnouncementRecord = {
      announcementId: `ann_${Date.now()}`,
      companyId: payload.companyId || COMPANY_ID,
      title: payload.title,
      body: payload.body,
      category: payload.category,
      publishedAt: new Date().toISOString(),
      recordStatus: 'active',
      createdBy: 'demo',
      createdAt: new Date().toISOString(),
    };
    this.state.announcements = [ann, ...this.state.announcements];
    this.addAudit(actorRole, 'ANNOUNCEMENT_PUBLISH', 'announcements', ann.announcementId, `Pengumuman: ${payload.title}`);
    this.persistAndNotify();
  }

  deleteAnnouncement(announcementId: string, actorRole: string) {
    this.state.announcements = this.state.announcements.filter((a) => a.announcementId !== announcementId);
    this.addAudit(actorRole, 'ANNOUNCEMENT_DELETE', 'announcements', announcementId, `Menghapus pengumuman ${announcementId}`);
    this.persistAndNotify();
  }

  markNotificationRead(notificationId: string) {
    this.state.notifications = this.state.notifications.map((n) => (n.notificationId === notificationId ? { ...n, isRead: true } : n));
    this.persistAndNotify();
  }

  saveSettings(settings: SystemSettingsRecord, actorRole: string) {
    this.state.settings = { ...settings, updatedAt: new Date().toISOString() };
    this.addAudit(actorRole, 'SYSTEM_SETTINGS_UPDATE', 'system_settings', settings.settingId, `Memperbarui konfigurasi PPh 21 (${settings.pph21Method}) & BPJS.`);
    this.persistAndNotify();
  }
}

export const demoStore = new DemoSessionManager();

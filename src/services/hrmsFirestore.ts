import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  FIELD_LIMITS,
  type AnnouncementRecord,
  type AttendanceRecord,
  type AuditLogRecord,
  type CompanyRecord,
  type DepartmentRecord,
  type EmployeeRecord,
  type LeaveBalanceRecord,
  type LeaveRequestRecord,
  type NotificationRecord,
  type OvertimeRequestRecord,
  type PayrollRunRecord,
  type PayrollWorkflowStatus,
  type PayslipRecord,
  type PerformanceReviewRecord,
  type PositionRecord,
  type ShiftRecord,
  type SystemSettingsRecord,
  type UserAccountRecord,
  type UserRole,
} from '../types/hrms';
import {
  calculateDistanceMeters,
  calculateEmployeePayroll,
  evaluateShiftLateness,
} from './payrollCalculator';
import { formatMonthLabel, getMonthPrefix, getTodayISO } from '../utils/dateFormat';
import { demoStore } from './demoSessionStore';

export const DEFAULT_COMPANY_ID = 'comp_nusantara_01';
export const DEFAULT_SETTINGS_ID = 'settings_default_2026';
export const BOOTSTRAP_SUPER_ADMIN_EMAIL = 'caycayaisha62@gmail.com';

function isDemoSessionActive(): boolean {
  return !auth.currentUser && demoStore.getActivePersona() !== null;
}

export function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (cleaned.length >= 2) return cleaned.slice(0, 96);
  return `${fallbackPrefix}_${Date.now()}`;
}

export function trimStr(val: string | undefined | null, maxLen: number): string {
  if (!val) return '';
  return val.trim().slice(0, maxLen);
}

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function toJsDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val instanceof Timestamp) return val.toDate();
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function writeAuditLog(params: {
  companyId: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const logId = makeId('log');
  const path = `audit_logs/${logId}`;
  try {
    await setDoc(doc(db, 'audit_logs', logId), {
      logId,
      companyId: params.companyId || DEFAULT_COMPANY_ID,
      actorUid: user.uid,
      actorEmail: trimStr(user.email, 120),
      actorRole: trimStr(params.actorRole, 40),
      action: trimStr(params.action, 100),
      targetCollection: trimStr(params.targetCollection, 64),
      targetId: trimStr(params.targetId, 80),
      summary: trimStr(params.summary, 400),
      recordStatus: 'active',
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Ensures the signed-in Firebase Auth user has a corresponding RBAC profile in /users/{uid}
 * and automatically binds any pre-created /employees/{id} record matching their verified email.
 */
export async function syncAuthenticatedUserProfile(): Promise<{
  userAccount: UserAccountRecord;
  employee: EmployeeRecord | null;
}> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('Tidak ada sesi Firebase Auth yang aktif.');
  }
  const uid = fbUser.uid;
  const email = (fbUser.email || '').toLowerCase();
  const isBootstrap = email === BOOTSTRAP_SUPER_ADMIN_EMAIL.toLowerCase();

  let matchedEmployee: EmployeeRecord | null = null;
  try {
    const empByUid = await getDocs(
      query(collection(db, 'employees'), where('uid', '==', uid), limit(1))
    );
    if (!empByUid.empty) {
      matchedEmployee = empByUid.docs[0].data() as EmployeeRecord;
    } else if (email) {
      const empByEmail = await getDocs(
        query(collection(db, 'employees'), where('email', '==', email), limit(1))
      );
      if (!empByEmail.empty) {
        const empDoc = empByEmail.docs[0];
        const empData = empDoc.data() as EmployeeRecord;
        if (!empData.uid) {
          await updateDoc(doc(db, 'employees', empDoc.id), {
            uid,
            updatedAt: serverTimestamp(),
          });
          matchedEmployee = { ...empData, uid };
        } else {
          matchedEmployee = empData;
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'employees');
  }

  const userRef = doc(db, 'users', uid);
  let userAccount: UserAccountRecord | null = null;
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      userAccount = snap.data() as UserAccountRecord;
      if (isBootstrap && userAccount.role !== 'Super Admin') {
        await updateDoc(userRef, {
          role: 'Super Admin',
          status: 'active',
          updatedAt: serverTimestamp(),
        });
        userAccount = { ...userAccount, role: 'Super Admin', status: 'active' };
      }
    } else {
      const newAccount: UserAccountRecord = {
        uid,
        companyId: matchedEmployee?.companyId || DEFAULT_COMPANY_ID,
        employeeId: matchedEmployee?.employeeId || '',
        email: trimStr(email || `${uid}@kerjapay.local`, 120),
        displayName: trimStr(fbUser.displayName || matchedEmployee?.fullName || email.split('@')[0] || 'User', 120),
        role: isBootstrap ? 'Super Admin' : 'Employee',
        status: 'active',
        departmentId: matchedEmployee?.departmentId || '',
        recordStatus: 'active',
        createdBy: uid,
      };
      await setDoc(userRef, {
        ...newAccount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      userAccount = newAccount;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }

  if (isBootstrap) {
    await ensureInitialCompanyData(uid, email);
    if (!matchedEmployee) {
      try {
        const empSnap = await getDoc(doc(db, 'employees', 'emp_001'));
        if (empSnap.exists()) {
          matchedEmployee = empSnap.data() as EmployeeRecord;
        }
      } catch {
        // Fallback resolved by live onSnapshot listener
      }
    }
    if (matchedEmployee && !userAccount.employeeId) {
      userAccount = { ...userAccount, employeeId: matchedEmployee.employeeId };
      try {
        await updateDoc(userRef, {
          employeeId: matchedEmployee.employeeId,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Non-blocking
      }
    }
  }

  return { userAccount, employee: matchedEmployee };
}

/**
 * Seeds foundational Indonesian enterprise HRMS data if companies/{DEFAULT_COMPANY_ID} does not exist yet.
 * Only callable by Super Admin (verified bootstrap or Super Admin role).
 */
export async function ensureInitialCompanyData(actorUid: string, actorEmail: string): Promise<void> {
  const companyRef = doc(db, 'companies', DEFAULT_COMPANY_ID);
  try {
    const snap = await getDoc(companyRef);
    if (snap.exists()) return;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `companies/${DEFAULT_COMPANY_ID}`);
  }

  try {
    const batch = writeBatch(db);
    const ts = serverTimestamp();

    batch.set(companyRef, {
      companyId: DEFAULT_COMPANY_ID,
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
      createdBy: actorUid,
      createdAt: ts,
      updatedAt: ts,
    });

    batch.set(doc(db, 'system_settings', DEFAULT_SETTINGS_ID), {
      settingId: DEFAULT_SETTINGS_ID,
      companyId: DEFAULT_COMPANY_ID,
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
      createdBy: actorUid,
      createdAt: ts,
      updatedAt: ts,
    });

    const departments = [
      { departmentId: 'dept_eng', code: 'ENG', name: 'Engineering & Product', description: 'Pengembangan platform & aplikasi mobile' },
      { departmentId: 'dept_hr', code: 'HRGA', name: 'People & Operations', description: 'Manajemen SDM, payroll, dan kepatuhan' },
      { departmentId: 'dept_fin', code: 'FIN', name: 'Finance & Tax', description: 'Akuntansi, pajak PPh 21, dan kompensasi' },
      { departmentId: 'dept_ops', code: 'OPS', name: 'Operations & Support', description: 'Operasional lapangan dan layanan pelanggan' },
    ];
    for (const d of departments) {
      batch.set(doc(db, 'departments', d.departmentId), {
        ...d,
        companyId: DEFAULT_COMPANY_ID,
        headEmployeeId: '',
        recordStatus: 'active',
        createdBy: actorUid,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    const positions = [
      { positionId: 'pos_swe', departmentId: 'dept_eng', title: 'Senior Software Engineer', grade: 'L4', defaultBaseSalary: 14_500_000 },
      { positionId: 'pos_android', departmentId: 'dept_eng', title: 'Android Kotlin Developer', grade: 'L3', defaultBaseSalary: 11_500_000 },
      { positionId: 'pos_hr_mgr', departmentId: 'dept_hr', title: 'HR & Payroll Specialist', grade: 'M1', defaultBaseSalary: 10_500_000 },
      { positionId: 'pos_fin_ana', departmentId: 'dept_fin', title: 'Finance & Tax Analyst', grade: 'L3', defaultBaseSalary: 9_800_000 },
      { positionId: 'pos_ops_sup', departmentId: 'dept_ops', title: 'Operations Supervisor', grade: 'S1', defaultBaseSalary: 9_200_000 },
    ];
    for (const p of positions) {
      batch.set(doc(db, 'positions', p.positionId), {
        ...p,
        companyId: DEFAULT_COMPANY_ID,
        description: `${p.title} (${p.grade})`,
        recordStatus: 'active',
        createdBy: actorUid,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    const shifts = [
      {
        shiftId: 'shift_reg',
        name: 'Regular Office (Senin - Jumat)',
        startTime: '08:30',
        endTime: '17:30',
        breakMinutes: 60,
        lateToleranceMinutes: 15,
        workDaysLabel: 'Senin - Jumat',
        isHoliday: false,
      },
      {
        shiftId: 'shift_ops_pagi',
        name: 'Operasional Pagi',
        startTime: '07:00',
        endTime: '16:00',
        breakMinutes: 60,
        lateToleranceMinutes: 10,
        workDaysLabel: 'Senin - Sabtu',
        isHoliday: false,
      },
    ];
    for (const s of shifts) {
      batch.set(doc(db, 'shifts', s.shiftId), {
        ...s,
        companyId: DEFAULT_COMPANY_ID,
        recordStatus: 'active',
        createdBy: actorUid,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    const employeesSeed: Array<Omit<EmployeeRecord, 'createdAt' | 'updatedAt'>> = [
      {
        employeeId: 'emp_001',
        companyId: DEFAULT_COMPANY_ID,
        uid: actorUid,
        employeeCode: 'NDK-2026-001',
        fullName: 'Aisha Cayca',
        email: actorEmail.toLowerCase(),
        phone: '+62 812 8800 1001',
        address: 'Jakarta Selatan',
        dateOfBirth: '1994-05-14',
        gender: 'Perempuan',
        photoUrl: '/src/assets/images/avatar_admin_1795590992322.jpg',
        nik: '3174015405940001',
        npwp: '89.123.456.7-011.000',
        departmentId: 'dept_hr',
        positionId: 'pos_hr_mgr',
        employmentType: 'Full-Time',
        joinDate: '2024-01-10',
        employmentStatus: 'Active',
        bankName: 'BCA',
        bankAccountNumber: '5210998811',
        bankAccountHolder: 'Aisha Cayca',
        shiftId: 'shift_reg',
        baseSalary: 14_500_000,
        positionAllowance: 2_500_000,
        transportAllowance: 900_000,
        mealAllowance: 750_000,
        documentNotes: 'SK Pengangkatan Permanen terverifikasi',
        recordStatus: 'active',
        createdBy: actorUid,
      },
      {
        employeeId: 'emp_002',
        companyId: DEFAULT_COMPANY_ID,
        uid: '',
        employeeCode: 'NDK-2026-002',
        fullName: 'Raka Pratama Wijaya',
        email: 'raka.pratama@nusantaradigital.co.id',
        phone: '+62 813 9900 2202',
        address: 'Bandung, Jawa Barat',
        dateOfBirth: '1996-08-21',
        gender: 'Laki-laki',
        photoUrl: '/src/assets/images/avatar_emp_1_1795590992124.jpg',
        nik: '3273012108960004',
        npwp: '77.456.112.3-422.000',
        departmentId: 'dept_eng',
        positionId: 'pos_swe',
        employmentType: 'Full-Time',
        joinDate: '2024-03-04',
        employmentStatus: 'Active',
        supervisorId: 'emp_001',
        bankName: 'Mandiri',
        bankAccountNumber: '1310009912345',
        bankAccountHolder: 'Raka Pratama Wijaya',
        shiftId: 'shift_reg',
        baseSalary: 15_000_000,
        positionAllowance: 2_000_000,
        transportAllowance: 850_000,
        mealAllowance: 750_000,
        documentNotes: 'Kontrak PKWTT & sertifikat keamanan data',
        recordStatus: 'active',
        createdBy: actorUid,
      },
      {
        employeeId: 'emp_003',
        companyId: DEFAULT_COMPANY_ID,
        uid: '',
        employeeCode: 'NDK-2026-003',
        fullName: 'Nadia Kusuma Putri',
        email: 'nadia.kusuma@nusantaradigital.co.id',
        phone: '+62 815 7722 3303',
        address: 'Tangerang Selatan',
        dateOfBirth: '1997-11-02',
        gender: 'Perempuan',
        photoUrl: '/src/assets/images/avatar_emp_2_1795590994249.jpg',
        nik: '3674024211970002',
        npwp: '66.981.221.4-411.000',
        departmentId: 'dept_eng',
        positionId: 'pos_android',
        employmentType: 'Contract',
        joinDate: '2025-02-01',
        contractStartDate: '2025-02-01',
        contractEndDate: '2027-01-31',
        employmentStatus: 'Active',
        supervisorId: 'emp_001',
        bankName: 'BCA',
        bankAccountNumber: '4970882210',
        bankAccountHolder: 'Nadia Kusuma Putri',
        shiftId: 'shift_reg',
        baseSalary: 11_500_000,
        positionAllowance: 1_200_000,
        transportAllowance: 750_000,
        mealAllowance: 650_000,
        documentNotes: 'PKWT Android Engineering 24 bulan',
        recordStatus: 'active',
        createdBy: actorUid,
      },
      {
        employeeId: 'emp_004',
        companyId: DEFAULT_COMPANY_ID,
        uid: '',
        employeeCode: 'NDK-2026-004',
        fullName: 'Dimas Santoso',
        email: 'dimas.santoso@nusantaradigital.co.id',
        phone: '+62 817 6644 4404',
        address: 'Bekasi',
        dateOfBirth: '1995-03-19',
        gender: 'Laki-laki',
        photoUrl: '/src/assets/images/avatar_emp_3_1795590993422.jpg',
        nik: '3275011903950007',
        npwp: '54.321.887.2-407.000',
        departmentId: 'dept_ops',
        positionId: 'pos_ops_sup',
        employmentType: 'Full-Time',
        joinDate: '2024-07-15',
        employmentStatus: 'Active',
        supervisorId: 'emp_001',
        bankName: 'BNI',
        bankAccountNumber: '0887711229',
        bankAccountHolder: 'Dimas Santoso',
        shiftId: 'shift_ops_pagi',
        baseSalary: 9_200_000,
        positionAllowance: 1_100_000,
        transportAllowance: 800_000,
        mealAllowance: 650_000,
        documentNotes: 'Supervisor operasional area Jabodetabek',
        recordStatus: 'active',
        createdBy: actorUid,
      },
    ];

    const currentYear = new Date().getFullYear();
    for (const emp of employeesSeed) {
      batch.set(doc(db, 'employees', emp.employeeId), {
        ...emp,
        createdAt: ts,
        updatedAt: ts,
      });
      const balId = `${emp.employeeId}_${currentYear}`;
      batch.set(doc(db, 'leave_balances', balId), {
        balanceId: balId,
        companyId: DEFAULT_COMPANY_ID,
        employeeId: emp.employeeId,
        uid: emp.uid,
        year: currentYear,
        annualQuota: 12,
        annualUsed: emp.employeeId === 'emp_002' ? 2 : 0,
        annualRemaining: emp.employeeId === 'emp_002' ? 10 : 12,
        sickQuota: 14,
        sickUsed: 0,
        personalUsed: 0,
        recordStatus: 'active',
        createdBy: actorUid,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    batch.set(doc(db, 'announcements', 'ann_q4_2026'), {
      announcementId: 'ann_q4_2026',
      companyId: DEFAULT_COMPANY_ID,
      title: 'Kebijakan Presensi Mobile & Perhitungan PPh 21 TER 2026',
      body: 'Seluruh karyawan wajib melakukan Clock-In dan Clock-Out melalui aplikasi Android KerjaPay atau Web ESS dengan verifikasi GPS kantor. Potongan BPJS dan PPh 21 dapat dilihat pada rincian slip gaji bulanan.',
      category: 'Policy',
      publishedAt: ts,
      recordStatus: 'active',
      createdBy: actorUid,
      createdAt: ts,
      updatedAt: ts,
    });

    const today = getTodayISO();
    const seededAttendanceId = `emp_002_${today}`;
    batch.set(doc(db, 'attendance', seededAttendanceId), {
      attendanceId: seededAttendanceId,
      companyId: DEFAULT_COMPANY_ID,
      employeeId: 'emp_002',
      uid: actorUid,
      workDate: today,
      shiftId: 'shift_reg',
      clockInAt: ts,
      clockInLat: -6.225,
      clockInLng: 106.8097,
      gpsVerified: true,
      clockInSelfie: '/src/assets/images/avatar_emp_1_1795590992124.jpg',
      lateMinutes: 0,
      workMinutes: 0,
      status: 'Present',
      correctionStatus: 'None',
      sourceDevice: 'Web Backoffice Seed',
      recordStatus: 'active',
      createdBy: actorUid,
      createdAt: ts,
      updatedAt: ts,
    });

    batch.set(doc(db, 'leave_requests', 'lv_seed_001'), {
      leaveRequestId: 'lv_seed_001',
      companyId: DEFAULT_COMPANY_ID,
      employeeId: 'emp_003',
      uid: actorUid,
      supervisorId: 'emp_001',
      leaveType: 'Annual',
      startDate: today,
      endDate: today,
      totalDays: 1,
      reason: 'Keperluan administrasi keluarga di Tangerang',
      status: 'Pending',
      recordStatus: 'active',
      createdBy: actorUid,
      createdAt: ts,
      updatedAt: ts,
    });

    batch.set(doc(db, 'overtime_requests', 'ot_seed_001'), {
      overtimeId: 'ot_seed_001',
      companyId: DEFAULT_COMPANY_ID,
      employeeId: 'emp_002',
      uid: actorUid,
      supervisorId: 'emp_001',
      overtimeDate: today,
      startTime: '18:00',
      endTime: '20:30',
      durationHours: 2.5,
      reason: 'Migrasi sinkronisasi database Firestore & Android release check',
      status: 'Pending',
      recordStatus: 'active',
      createdBy: actorUid,
      createdAt: ts,
      updatedAt: ts,
    });

    batch.set(doc(db, 'performance_reviews', 'perf_seed_001'), {
      reviewId: 'perf_seed_001',
      companyId: DEFAULT_COMPANY_ID,
      employeeId: 'emp_002',
      uid: actorUid,
      reviewerId: 'emp_001',
      cycleLabel: 'H2 2026 Review',
      kpiScore: 91,
      competencyScore: 89,
      overallRating: 'Exceeds',
      strengths: 'Konsistensi pengiriman fitur dan reliabilitas arsitektur backend.',
      improvements: 'Perkuat mentoring lintas tim Android & QA.',
      status: 'Submitted',
      recordStatus: 'active',
      createdBy: actorUid,
      createdAt: ts,
      updatedAt: ts,
    });

    await batch.commit();
    await writeAuditLog({
      companyId: DEFAULT_COMPANY_ID,
      actorRole: 'Super Admin',
      action: 'BOOTSTRAP_SEED',
      targetCollection: 'companies',
      targetId: DEFAULT_COMPANY_ID,
      summary: 'Inisialisasi data master perusahaan, departemen, jabatan, shift, karyawan, dan pengaturan payroll Indonesia.',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'companies/bootstrap');
  }
}

export interface HrmsSubscriptions {
  onCompanies?: (items: CompanyRecord[], pendingWrites: boolean) => void;
  onSettings?: (items: SystemSettingsRecord[]) => void;
  onUsers?: (items: UserAccountRecord[]) => void;
  onEmployees?: (items: EmployeeRecord[], pendingWrites: boolean) => void;
  onDepartments?: (items: DepartmentRecord[]) => void;
  onPositions?: (items: PositionRecord[]) => void;
  onShifts?: (items: ShiftRecord[]) => void;
  onAttendance?: (items: AttendanceRecord[], pendingWrites: boolean) => void;
  onLeaves?: (items: LeaveRequestRecord[]) => void;
  onLeaveBalances?: (items: LeaveBalanceRecord[]) => void;
  onOvertime?: (items: OvertimeRequestRecord[]) => void;
  onPayrollRuns?: (items: PayrollRunRecord[]) => void;
  onPayslips?: (items: PayslipRecord[]) => void;
  onPerformance?: (items: PerformanceReviewRecord[]) => void;
  onAnnouncements?: (items: AnnouncementRecord[]) => void;
  onNotifications?: (items: NotificationRecord[]) => void;
  onAuditLogs?: (items: AuditLogRecord[]) => void;
  onSyncState?: (meta: { hasPendingWrites: boolean; fromCache: boolean; lastSyncedAt: number }) => void;
}

function sortByTimestampDesc<T extends { createdAt?: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = toJsDate(a.createdAt)?.getTime() ?? Date.now();
    const tb = toJsDate(b.createdAt)?.getTime() ?? Date.now();
    return tb - ta;
  });
}

function sortAttendanceDesc(items: AttendanceRecord[]): AttendanceRecord[] {
  return [...items].sort((a, b) => {
    const dateCmp = String(b.workDate || '').localeCompare(String(a.workDate || ''));
    if (dateCmp !== 0) return dateCmp;
    const ta = toJsDate(a.clockInAt)?.getTime() ?? toJsDate(a.createdAt)?.getTime() ?? Date.now();
    const tb = toJsDate(b.clockInAt)?.getTime() ?? toJsDate(b.createdAt)?.getTime() ?? Date.now();
    return tb - ta;
  });
}

/**
 * Attaches role-scoped real-time Firestore listeners adhering strictly to firestore.rules list guards.
 */
export function subscribeHrmsWorkspace(
  role: UserRole,
  uid: string,
  callbacks: HrmsSubscriptions
): () => void {
  if (isDemoSessionActive()) {
    return demoStore.subscribe(() => {
      const snap = demoStore.getSnapshot(role, uid);
      callbacks.onCompanies?.([snap.company], false);
      callbacks.onSettings?.([snap.settings]);
      callbacks.onUsers?.(snap.users);
      callbacks.onEmployees?.(snap.employees, false);
      callbacks.onDepartments?.(snap.departments);
      callbacks.onPositions?.(snap.positions);
      callbacks.onShifts?.(snap.shifts);
      callbacks.onAttendance?.(sortAttendanceDesc(snap.attendance), false);
      callbacks.onLeaves?.(snap.leaves);
      callbacks.onLeaveBalances?.(snap.leaveBalances);
      callbacks.onOvertime?.(snap.overtime);
      callbacks.onPayrollRuns?.(snap.payrollRuns);
      callbacks.onPayslips?.(snap.payslips);
      callbacks.onPerformance?.(snap.performance);
      callbacks.onAnnouncements?.(snap.announcements);
      callbacks.onNotifications?.(snap.notifications);
      callbacks.onAuditLogs?.(snap.auditLogs);
      callbacks.onSyncState?.({
        hasPendingWrites: false,
        fromCache: false,
        lastSyncedAt: Date.now(),
      });
    });
  }

  const unsubs: Unsubscribe[] = [];
  const isBackoffice = role === 'Super Admin' || role === 'HR Admin' || role === 'Management' || role === 'Supervisor';
  const isPayrollAdmin = role === 'Super Admin' || role === 'HR Admin' || role === 'Management';
  const isUserAdmin = role === 'Super Admin' || role === 'HR Admin';
  const isAuditReader = role === 'Super Admin' || role === 'HR Admin' || role === 'Management';

  const watch = <T>(
    qRef: ReturnType<typeof query>,
    pathLabel: string,
    handler?: (items: T[], hasPendingWrites: boolean) => void
  ) => {
    if (!handler) return;
    unsubs.push(
      onSnapshot(
        qRef,
        { includeMetadataChanges: true },
        (snap) => {
          const items = snap.docs.map((d) => d.data() as T);
          handler(items, snap.metadata.hasPendingWrites);
          callbacks.onSyncState?.({
            hasPendingWrites: snap.metadata.hasPendingWrites,
            fromCache: snap.metadata.fromCache,
            lastSyncedAt: Date.now(),
          });
        },
        (error) => handleFirestoreError(error, OperationType.LIST, pathLabel)
      )
    );
  };

  watch<CompanyRecord>(
    query(collection(db, 'companies'), where('recordStatus', '==', 'active')),
    'companies',
    (items, pending) => callbacks.onCompanies?.(items, pending)
  );

  watch<SystemSettingsRecord>(
    query(collection(db, 'system_settings'), where('recordStatus', '==', 'active')),
    'system_settings',
    (items) => callbacks.onSettings?.(items)
  );

  watch<DepartmentRecord>(
    query(collection(db, 'departments'), where('recordStatus', '==', 'active')),
    'departments',
    (items) => callbacks.onDepartments?.(items)
  );

  watch<PositionRecord>(
    query(collection(db, 'positions'), where('recordStatus', '==', 'active')),
    'positions',
    (items) => callbacks.onPositions?.(items)
  );

  watch<ShiftRecord>(
    query(collection(db, 'shifts'), where('recordStatus', '==', 'active')),
    'shifts',
    (items) => callbacks.onShifts?.(items)
  );

  watch<AnnouncementRecord>(
    query(collection(db, 'announcements'), where('recordStatus', '==', 'active')),
    'announcements',
    (items) => callbacks.onAnnouncements?.(sortByTimestampDesc(items))
  );

  if (isUserAdmin) {
    watch<UserAccountRecord>(query(collection(db, 'users')), 'users', (items) =>
      callbacks.onUsers?.(items)
    );
  } else {
    watch<UserAccountRecord>(
      query(collection(db, 'users'), where('uid', '==', uid)),
      'users',
      (items) => callbacks.onUsers?.(items)
    );
  }

  if (isBackoffice) {
    watch<EmployeeRecord>(collection(db, 'employees'), 'employees', (items, pending) =>
      callbacks.onEmployees?.(items, pending)
    );
    watch<AttendanceRecord>(
      query(collection(db, 'attendance'), orderBy('workDate', 'desc'), limit(250)),
      'attendance',
      (items, pending) => callbacks.onAttendance?.(sortAttendanceDesc(items), pending)
    );
    watch<LeaveRequestRecord>(
      query(collection(db, 'leave_requests'), orderBy('createdAt', 'desc'), limit(200)),
      'leave_requests',
      (items) => callbacks.onLeaves?.(sortByTimestampDesc(items))
    );
    watch<LeaveBalanceRecord>(collection(db, 'leave_balances'), 'leave_balances', (items) =>
      callbacks.onLeaveBalances?.(items)
    );
    watch<OvertimeRequestRecord>(
      query(collection(db, 'overtime_requests'), orderBy('overtimeDate', 'desc'), limit(200)),
      'overtime_requests',
      (items) => callbacks.onOvertime?.(items)
    );
    watch<PerformanceReviewRecord>(collection(db, 'performance_reviews'), 'performance_reviews', (items) =>
      callbacks.onPerformance?.(items)
    );
  } else {
    watch<EmployeeRecord>(
      query(collection(db, 'employees'), where('uid', '==', uid)),
      'employees',
      (items, pending) => callbacks.onEmployees?.(items, pending)
    );
    watch<AttendanceRecord>(
      query(collection(db, 'attendance'), where('uid', '==', uid), limit(90)),
      'attendance',
      (items, pending) => callbacks.onAttendance?.(sortAttendanceDesc(items), pending)
    );
    watch<LeaveRequestRecord>(
      query(collection(db, 'leave_requests'), where('uid', '==', uid), limit(60)),
      'leave_requests',
      (items) => callbacks.onLeaves?.(sortByTimestampDesc(items))
    );
    watch<LeaveBalanceRecord>(
      query(collection(db, 'leave_balances'), where('uid', '==', uid)),
      'leave_balances',
      (items) => callbacks.onLeaveBalances?.(items)
    );
    watch<OvertimeRequestRecord>(
      query(collection(db, 'overtime_requests'), where('uid', '==', uid), limit(60)),
      'overtime_requests',
      (items) =>
        callbacks.onOvertime?.(
          [...items].sort((a, b) => String(b.overtimeDate || '').localeCompare(String(a.overtimeDate || '')))
        )
    );
    watch<PerformanceReviewRecord>(
      query(collection(db, 'performance_reviews'), where('uid', '==', uid)),
      'performance_reviews',
      (items) => callbacks.onPerformance?.(items)
    );
  }

  if (isPayrollAdmin) {
    watch<PayrollRunRecord>(
      query(collection(db, 'payroll'), orderBy('periodMonth', 'desc'), limit(36)),
      'payroll',
      (items) => callbacks.onPayrollRuns?.(items)
    );
    watch<PayslipRecord>(
      query(collection(db, 'payslips'), orderBy('periodMonth', 'desc'), limit(300)),
      'payslips',
      (items) => callbacks.onPayslips?.(items)
    );
  } else {
    watch<PayslipRecord>(
      query(collection(db, 'payslips'), where('uid', '==', uid), limit(36)),
      'payslips',
      (items) =>
        callbacks.onPayslips?.(
          [...items].sort((a, b) => String(b.periodMonth || '').localeCompare(String(a.periodMonth || '')))
        )
    );
  }

  if (isUserAdmin) {
    watch<NotificationRecord>(
      query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(100)),
      'notifications',
      (items) => callbacks.onNotifications?.(items)
    );
  } else {
    watch<NotificationRecord>(
      query(collection(db, 'notifications'), where('recipientUid', '==', uid), limit(60)),
      'notifications',
      (items) => callbacks.onNotifications?.(sortByTimestampDesc(items))
    );
  }

  if (isAuditReader) {
    watch<AuditLogRecord>(
      query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(120)),
      'audit_logs',
      (items) => callbacks.onAuditLogs?.(items)
    );
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

// --- CRUD Operations ---

export async function saveEmployeeRecord(
  payload: Omit<EmployeeRecord, 'createdBy' | 'createdAt' | 'updatedAt' | 'recordStatus'>,
  isNew: boolean,
  actorRole: string
): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.saveEmployee(payload, isNew, actorRole);
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const employeeId = sanitizeId(payload.employeeId, 'emp');
  const empRef = doc(db, 'employees', employeeId);
  const path = `employees/${employeeId}`;
  try {
    const cleanEmail = trimStr(payload.email.toLowerCase(), FIELD_LIMITS.emailMax);
    if (isNew) {
      const batch = writeBatch(db);
      const ts = serverTimestamp();
      batch.set(empRef, {
        ...payload,
        employeeId,
        companyId: payload.companyId || DEFAULT_COMPANY_ID,
        uid: payload.uid || '',
        employeeCode: trimStr(payload.employeeCode, 40),
        fullName: trimStr(payload.fullName, FIELD_LIMITS.fullNameMax),
        email: cleanEmail,
        phone: trimStr(payload.phone, 40),
        address: trimStr(payload.address, 300),
        nik: trimStr(payload.nik, 32),
        npwp: trimStr(payload.npwp, 32),
        documentNotes: trimStr(payload.documentNotes, 500),
        baseSalary: Number(payload.baseSalary) || 0,
        positionAllowance: Number(payload.positionAllowance) || 0,
        transportAllowance: Number(payload.transportAllowance) || 0,
        mealAllowance: Number(payload.mealAllowance) || 0,
        recordStatus: 'active',
        createdBy: uid,
        createdAt: ts,
        updatedAt: ts,
      });

      const year = new Date().getFullYear();
      const balId = `${employeeId}_${year}`;
      batch.set(doc(db, 'leave_balances', balId), {
        balanceId: balId,
        companyId: payload.companyId || DEFAULT_COMPANY_ID,
        employeeId,
        uid: payload.uid || '',
        year,
        annualQuota: 12,
        annualUsed: 0,
        annualRemaining: 12,
        sickQuota: 14,
        sickUsed: 0,
        personalUsed: 0,
        recordStatus: 'active',
        createdBy: uid,
        createdAt: ts,
        updatedAt: ts,
      });
      await batch.commit();
      await writeAuditLog({
        companyId: payload.companyId || DEFAULT_COMPANY_ID,
        actorRole,
        action: 'EMPLOYEE_CREATE',
        targetCollection: 'employees',
        targetId: employeeId,
        summary: `Menambahkan karyawan baru: ${payload.fullName} (${payload.employeeCode}).`,
      });
    } else {
      await updateDoc(empRef, {
        ...payload,
        employeeId,
        employeeCode: trimStr(payload.employeeCode, 40),
        fullName: trimStr(payload.fullName, FIELD_LIMITS.fullNameMax),
        email: cleanEmail,
        phone: trimStr(payload.phone, 40),
        address: trimStr(payload.address, 300),
        nik: trimStr(payload.nik, 32),
        npwp: trimStr(payload.npwp, 32),
        documentNotes: trimStr(payload.documentNotes, 500),
        baseSalary: Number(payload.baseSalary) || 0,
        positionAllowance: Number(payload.positionAllowance) || 0,
        transportAllowance: Number(payload.transportAllowance) || 0,
        mealAllowance: Number(payload.mealAllowance) || 0,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        companyId: payload.companyId || DEFAULT_COMPANY_ID,
        actorRole,
        action: 'EMPLOYEE_UPDATE',
        targetCollection: 'employees',
        targetId: employeeId,
        summary: `Memperbarui profil karyawan: ${payload.fullName} (${payload.employmentStatus}).`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function updateUserAccountRoleStatus(
  targetUid: string,
  role: UserRole,
  status: 'active' | 'inactive',
  actorRole: string,
  employeeId?: string
): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.updateUserRole(targetUid, role, status, actorRole, employeeId);
    return;
  }
  const path = `users/${targetUid}`;
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      role,
      status,
      ...(employeeId !== undefined ? { employeeId } : {}),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      companyId: DEFAULT_COMPANY_ID,
      actorRole,
      action: 'USER_RBAC_UPDATE',
      targetCollection: 'users',
      targetId: targetUid,
      summary: `Mengubah peran akun ${targetUid} menjadi ${role} (${status}).`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveDepartmentRecord(
  payload: Pick<DepartmentRecord, 'departmentId' | 'companyId' | 'code' | 'name' | 'headEmployeeId' | 'description'>,
  isNew: boolean,
  actorRole: string
): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.saveDepartment(payload, isNew, actorRole);
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const departmentId = sanitizeId(payload.departmentId, 'dept');
  const path = `departments/${departmentId}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'departments', departmentId), {
        ...payload,
        departmentId,
        code: trimStr(payload.code, 24).toUpperCase(),
        name: trimStr(payload.name, 100),
        description: trimStr(payload.description, 300),
        recordStatus: 'active',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'departments', departmentId), {
        code: trimStr(payload.code, 24).toUpperCase(),
        name: trimStr(payload.name, 100),
        headEmployeeId: payload.headEmployeeId || '',
        description: trimStr(payload.description, 300),
        updatedAt: serverTimestamp(),
      });
    }
    await writeAuditLog({
      companyId: payload.companyId,
      actorRole,
      action: isNew ? 'DEPARTMENT_CREATE' : 'DEPARTMENT_UPDATE',
      targetCollection: 'departments',
      targetId: departmentId,
      summary: `${isNew ? 'Menambah' : 'Memperbarui'} departemen ${payload.name}.`,
    });
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function savePositionRecord(
  payload: Pick<PositionRecord, 'positionId' | 'companyId' | 'departmentId' | 'title' | 'grade' | 'defaultBaseSalary' | 'description'>,
  isNew: boolean,
  actorRole: string
): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.savePosition(payload, isNew, actorRole);
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const positionId = sanitizeId(payload.positionId, 'pos');
  const path = `positions/${positionId}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'positions', positionId), {
        ...payload,
        positionId,
        title: trimStr(payload.title, 100),
        grade: trimStr(payload.grade, 24),
        defaultBaseSalary: Math.max(0, Number(payload.defaultBaseSalary) || 0),
        description: trimStr(payload.description, 300),
        recordStatus: 'active',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'positions', positionId), {
        departmentId: payload.departmentId,
        title: trimStr(payload.title, 100),
        grade: trimStr(payload.grade, 24),
        defaultBaseSalary: Math.max(0, Number(payload.defaultBaseSalary) || 0),
        description: trimStr(payload.description, 300),
        updatedAt: serverTimestamp(),
      });
    }
    await writeAuditLog({
      companyId: payload.companyId,
      actorRole,
      action: isNew ? 'POSITION_CREATE' : 'POSITION_UPDATE',
      targetCollection: 'positions',
      targetId: positionId,
      summary: `${isNew ? 'Menambah' : 'Memperbarui'} jabatan ${payload.title}.`,
    });
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function saveShiftRecord(
  payload: Pick<ShiftRecord, 'shiftId' | 'companyId' | 'name' | 'startTime' | 'endTime' | 'breakMinutes' | 'lateToleranceMinutes' | 'workDaysLabel' | 'isHoliday'>,
  isNew: boolean,
  actorRole: string
): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.saveShift(payload, isNew, actorRole);
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const shiftId = sanitizeId(payload.shiftId, 'shift');
  const path = `shifts/${shiftId}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'shifts', shiftId), {
        ...payload,
        shiftId,
        name: trimStr(payload.name, 80),
        workDaysLabel: trimStr(payload.workDaysLabel, 100),
        breakMinutes: Math.max(0, Number(payload.breakMinutes) || 0),
        lateToleranceMinutes: Math.max(0, Number(payload.lateToleranceMinutes) || 0),
        isHoliday: Boolean(payload.isHoliday),
        recordStatus: 'active',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'shifts', shiftId), {
        name: trimStr(payload.name, 80),
        startTime: payload.startTime,
        endTime: payload.endTime,
        breakMinutes: Math.max(0, Number(payload.breakMinutes) || 0),
        lateToleranceMinutes: Math.max(0, Number(payload.lateToleranceMinutes) || 0),
        workDaysLabel: trimStr(payload.workDaysLabel, 100),
        isHoliday: Boolean(payload.isHoliday),
        updatedAt: serverTimestamp(),
      });
    }
    await writeAuditLog({
      companyId: payload.companyId,
      actorRole,
      action: isNew ? 'SHIFT_CREATE' : 'SHIFT_UPDATE',
      targetCollection: 'shifts',
      targetId: shiftId,
      summary: `${isNew ? 'Menambah' : 'Memperbarui'} jadwal shift ${payload.name} (${payload.startTime}-${payload.endTime}).`,
    });
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

/**
 * Atomic Clock-In using deterministic composite ID {employeeId}_{workDate}
 * to strictly prevent duplicate attendance records across concurrent devices.
 */
export async function submitClockIn(params: {
  employee: EmployeeRecord;
  shift?: ShiftRecord;
  settings?: SystemSettingsRecord;
  lat?: number;
  lng?: number;
  selfieDataUrl?: string;
  sourceDevice?: string;
}): Promise<{ attendanceId: string; status: 'Present' | 'Late'; lateMinutes: number; gpsVerified: boolean }> {
  if (isDemoSessionActive()) {
    return demoStore.clockIn(params);
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const workDate = getTodayISO();
  const attendanceId = `${params.employee.employeeId}_${workDate}`;
  const attRef = doc(db, 'attendance', attendanceId);
  const path = `attendance/${attendanceId}`;

  const now = new Date();
  const { lateMinutes, status } = evaluateShiftLateness(now, params.shift);

  let gpsVerified = true;
  if (params.settings?.requireGpsAttendance && params.settings.officeLat && params.settings.officeLng) {
    if (typeof params.lat === 'number' && typeof params.lng === 'number') {
      const dist = calculateDistanceMeters(
        params.lat,
        params.lng,
        params.settings.officeLat,
        params.settings.officeLng
      );
      gpsVerified = dist <= (params.settings.maxGeofenceMeters ?? 500);
    } else {
      gpsVerified = false;
    }
  }

  try {
    await runTransaction(db, async (tx) => {
      const existingSnap = await tx.get(attRef);
      if (existingSnap.exists()) {
        throw new Error(`DUPLICATE_ATTENDANCE: Presensi masuk untuk tanggal ${workDate} sudah tercatat.`);
      }
      tx.set(attRef, {
        attendanceId,
        companyId: params.employee.companyId || DEFAULT_COMPANY_ID,
        employeeId: params.employee.employeeId,
        uid,
        workDate,
        shiftId: params.shift?.shiftId || params.employee.shiftId || 'shift_reg',
        clockInAt: serverTimestamp(),
        ...(typeof params.lat === 'number' ? { clockInLat: params.lat } : {}),
        ...(typeof params.lng === 'number' ? { clockInLng: params.lng } : {}),
        gpsVerified,
        ...(params.selfieDataUrl
          ? { clockInSelfie: params.selfieDataUrl.slice(0, FIELD_LIMITS.selfieMaxLength) }
          : {}),
        lateMinutes,
        workMinutes: 0,
        status,
        correctionStatus: 'None',
        sourceDevice: trimStr(params.sourceDevice || 'Web Portal', 64),
        recordStatus: 'active',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    return { attendanceId, status, lateMinutes, gpsVerified };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DUPLICATE_ATTENDANCE:')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Atomic Clock-Out updating the existing {employeeId}_{workDate} document.
 */
export async function submitClockOut(params: {
  employee: EmployeeRecord;
  lat?: number;
  lng?: number;
  selfieDataUrl?: string;
}): Promise<{ workMinutes: number }> {
  if (isDemoSessionActive()) {
    return demoStore.clockOut(params);
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const workDate = getTodayISO();
  const attendanceId = `${params.employee.employeeId}_${workDate}`;
  const attRef = doc(db, 'attendance', attendanceId);
  const path = `attendance/${attendanceId}`;

  let computedMinutes = 0;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(attRef);
      if (!snap.exists()) {
        throw new Error('NO_CLOCK_IN: Anda belum melakukan Clock-In hari ini.');
      }
      const data = snap.data() as AttendanceRecord;
      if (data.clockOutAt) {
        throw new Error('ALREADY_CLOCKED_OUT: Presensi pulang hari ini sudah tercatat.');
      }
      const inDate = toJsDate(data.clockInAt) || new Date();
      computedMinutes = Math.max(0, Math.round((Date.now() - inDate.getTime()) / 60000));
      tx.update(attRef, {
        clockOutAt: serverTimestamp(),
        ...(typeof params.lat === 'number' ? { clockOutLat: params.lat } : {}),
        ...(typeof params.lng === 'number' ? { clockOutLng: params.lng } : {}),
        ...(params.selfieDataUrl
          ? { clockOutSelfie: params.selfieDataUrl.slice(0, FIELD_LIMITS.selfieMaxLength) }
          : {}),
        workMinutes: computedMinutes,
        updatedAt: serverTimestamp(),
      });
    });
    return { workMinutes: computedMinutes };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith('NO_CLOCK_IN:') || error.message.startsWith('ALREADY_CLOCKED_OUT:'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function requestAttendanceCorrection(
  attendanceId: string,
  reason: string
): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.requestCorrection(attendanceId, reason);
    return;
  }
  const path = `attendance/${attendanceId}`;
  try {
    await updateDoc(doc(db, 'attendance', attendanceId), {
      correctionStatus: 'Pending',
      correctionReason: trimStr(reason, 300),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function resolveAttendanceCorrection(
  attendanceId: string,
  decision: 'Approved' | 'Rejected',
  newStatus: AttendanceRecord['status'],
  actorRole: string
): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.resolveCorrection(attendanceId, decision, newStatus, actorRole);
    return;
  }
  const path = `attendance/${attendanceId}`;
  try {
    await updateDoc(doc(db, 'attendance', attendanceId), {
      correctionStatus: decision,
      ...(decision === 'Approved' ? { status: newStatus } : {}),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      companyId: DEFAULT_COMPANY_ID,
      actorRole,
      action: `ATTENDANCE_CORRECTION_${decision.toUpperCase()}`,
      targetCollection: 'attendance',
      targetId: attendanceId,
      summary: `Koreksi presensi ${attendanceId} diputuskan: ${decision}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitLeaveRequest(params: {
  employee: EmployeeRecord;
  leaveType: LeaveRequestRecord['leaveType'];
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
}): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.submitLeave(params);
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const leaveRequestId = makeId('lv');
  const path = `leave_requests/${leaveRequestId}`;
  try {
    await setDoc(doc(db, 'leave_requests', leaveRequestId), {
      leaveRequestId,
      companyId: params.employee.companyId || DEFAULT_COMPANY_ID,
      employeeId: params.employee.employeeId,
      uid: params.employee.uid || uid,
      supervisorId: params.employee.supervisorId || '',
      leaveType: params.leaveType,
      startDate: params.startDate,
      endDate: params.endDate,
      totalDays: Math.max(1, Math.round(params.totalDays)),
      reason: trimStr(params.reason, FIELD_LIMITS.reasonMax),
      status: 'Pending',
      recordStatus: 'active',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Atomic Leave Approval / Rejection with conflict detection & leave balance deduction.
 */
export async function decideLeaveRequest(params: {
  leave: LeaveRequestRecord;
  decision: 'Approved' | 'Rejected';
  rejectionReason?: string;
  actorRole: string;
}): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.decideLeave(params);
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const leaveRef = doc(db, 'leave_requests', params.leave.leaveRequestId);
  const year = Number(params.leave.startDate.slice(0, 4)) || new Date().getFullYear();
  const balanceId = `${params.leave.employeeId}_${year}`;
  const balRef = doc(db, 'leave_balances', balanceId);

  try {
    await runTransaction(db, async (tx) => {
      const lvSnap = await tx.get(leaveRef);
      if (!lvSnap.exists()) throw new Error('Pengajuan cuti tidak ditemukan.');
      const current = lvSnap.data() as LeaveRequestRecord;
      if (current.status !== 'Pending') {
        throw new Error(`CONFLICT_LEAVE: Pengajuan cuti ini sudah berstatus ${current.status}.`);
      }

      if (params.decision === 'Approved' && current.leaveType === 'Annual') {
        const balSnap = await tx.get(balRef);
        if (balSnap.exists()) {
          const bal = balSnap.data() as LeaveBalanceRecord;
          const newUsed = bal.annualUsed + current.totalDays;
          const newRemaining = Math.max(0, bal.annualQuota - newUsed);
          tx.update(balRef, {
            annualUsed: newUsed,
            annualRemaining: newRemaining,
            updatedAt: serverTimestamp(),
          });
        }
      }

      tx.update(leaveRef, {
        status: params.decision,
        rejectionReason: params.decision === 'Rejected' ? trimStr(params.rejectionReason || 'Ditolak oleh approver', 300) : '',
        reviewedBy: uid,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    if (params.leave.uid) {
      const notifId = makeId('notif');
      await setDoc(doc(db, 'notifications', notifId), {
        notificationId: notifId,
        companyId: params.leave.companyId,
        recipientEmployeeId: params.leave.employeeId,
        recipientUid: params.leave.uid,
        title: `Pengajuan Cuti ${params.decision === 'Approved' ? 'Disetujui' : 'Ditolak'}`,
        message: `Cuti ${params.leave.leaveType} (${params.leave.startDate} s.d. ${params.leave.endDate}) telah ${
          params.decision === 'Approved' ? 'disetujui' : 'ditolak'
        }.`,
        type: 'Leave',
        isRead: false,
        recordStatus: 'active',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await writeAuditLog({
      companyId: params.leave.companyId,
      actorRole: params.actorRole,
      action: `LEAVE_${params.decision.toUpperCase()}`,
      targetCollection: 'leave_requests',
      targetId: params.leave.leaveRequestId,
      summary: `Cuti ${params.leave.employeeId} (${params.leave.totalDays} hari) diputuskan ${params.decision}.`,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('CONFLICT_LEAVE:')) throw error;
    handleFirestoreError(error, OperationType.UPDATE, `leave_requests/${params.leave.leaveRequestId}`);
  }
}

export async function submitOvertimeRequest(params: {
  employee: EmployeeRecord;
  overtimeDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  reason: string;
}): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.submitOvertime(params);
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const overtimeId = makeId('ot');
  try {
    await setDoc(doc(db, 'overtime_requests', overtimeId), {
      overtimeId,
      companyId: params.employee.companyId || DEFAULT_COMPANY_ID,
      employeeId: params.employee.employeeId,
      uid: params.employee.uid || uid,
      supervisorId: params.employee.supervisorId || '',
      overtimeDate: params.overtimeDate,
      startTime: params.startTime,
      endTime: params.endTime,
      durationHours: Math.max(0.5, Number(params.durationHours) || 1),
      reason: trimStr(params.reason, FIELD_LIMITS.overtimeReasonMax),
      status: 'Pending',
      recordStatus: 'active',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `overtime_requests/${overtimeId}`);
  }
}

export async function decideOvertimeRequest(params: {
  overtime: OvertimeRequestRecord;
  decision: 'Approved' | 'Rejected';
  rejectionReason?: string;
  actorRole: string;
}): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.decideOvertime(params);
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const otRef = doc(db, 'overtime_requests', params.overtime.overtimeId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(otRef);
      if (!snap.exists()) throw new Error('Data lembur tidak ditemukan.');
      const cur = snap.data() as OvertimeRequestRecord;
      if (cur.status !== 'Pending') {
        throw new Error(`Lembur ini sudah berstatus ${cur.status}.`);
      }
      tx.update(otRef, {
        status: params.decision,
        rejectionReason: params.decision === 'Rejected' ? trimStr(params.rejectionReason || 'Ditolak', 300) : '',
        reviewedBy: uid,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await writeAuditLog({
      companyId: params.overtime.companyId,
      actorRole: params.actorRole,
      action: `OVERTIME_${params.decision.toUpperCase()}`,
      targetCollection: 'overtime_requests',
      targetId: params.overtime.overtimeId,
      summary: `Lembur ${params.overtime.employeeId} (${params.overtime.durationHours} jam) diputuskan ${params.decision}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `overtime_requests/${params.overtime.overtimeId}`);
  }
}

/**
 * Generates or recalculates monthly PayrollRun + itemized Payslips for all Active employees.
 * Locked once payroll status reaches 'Paid'.
 */
export async function generateMonthlyPayroll(params: {
  periodMonth?: string;
  employees: EmployeeRecord[];
  attendance: AttendanceRecord[];
  overtime: OvertimeRequestRecord[];
  settings: SystemSettingsRecord;
  existingRun?: PayrollRunRecord;
  existingPayslips?: PayslipRecord[];
  actorRole: string;
}): Promise<string> {
  if (isDemoSessionActive()) {
    return demoStore.generatePayroll(params);
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const periodMonth = params.periodMonth || getMonthPrefix();
  const payrollId = `pay_${periodMonth.replace('-', '_')}`;

  if (params.existingRun?.status === 'Paid') {
    throw new Error('Payroll periode ini sudah berstatus Paid dan terkunci permanen.');
  }

  const activeEmps = params.employees.filter((e) => e.employmentStatus === 'Active' && e.recordStatus === 'active');
  const existingSlipById = new Map((params.existingPayslips || []).map((s) => [s.payslipId, s]));
  const batch = writeBatch(db);
  const ts = serverTimestamp();

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNetPay = 0;

  for (const emp of activeEmps) {
    const empOtHours = params.overtime
      .filter(
        (o) =>
          o.employeeId === emp.employeeId &&
          o.status === 'Approved' &&
          o.overtimeDate.startsWith(periodMonth)
      )
      .reduce((acc, o) => acc + (o.durationHours || 0), 0);

    const empAtt = params.attendance.filter(
      (a) => a.employeeId === emp.employeeId && a.workDate.startsWith(periodMonth)
    );
    const absentDays = empAtt.filter((a) => a.status === 'Absent').length;
    const totalLateMinutes = empAtt.reduce((acc, a) => acc + (a.lateMinutes || 0), 0);

    const breakdown = calculateEmployeePayroll({
      employee: emp,
      settings: params.settings,
      approvedOvertimeHours: empOtHours,
      absentDays,
      totalLateMinutes,
      workflowStatus: 'Calculation',
    });

    totalGross += breakdown.grossIncome;
    totalDeductions += breakdown.totalDeductions;
    totalNetPay += breakdown.netPay;

    const payslipId = `${payrollId}_${emp.employeeId}`;
    const prevSlip = existingSlipById.get(payslipId);
    batch.set(doc(db, 'payslips', payslipId), {
      payslipId,
      payrollId,
      companyId: emp.companyId || DEFAULT_COMPANY_ID,
      employeeId: emp.employeeId,
      uid: emp.uid || '',
      employeeName: trimStr(emp.fullName, 120),
      periodMonth,
      periodLabel: formatMonthLabel(periodMonth),
      workflowStatus: 'Calculation',
      isProvisional: breakdown.isProvisional,
      basicSalary: breakdown.basicSalary,
      positionAllowance: breakdown.positionAllowance,
      transportAllowance: breakdown.transportAllowance,
      mealAllowance: breakdown.mealAllowance,
      overtimePayment: breakdown.overtimePayment,
      otherAllowances: breakdown.otherAllowances,
      grossIncome: breakdown.grossIncome,
      absenceDeduction: breakdown.absenceDeduction,
      lateDeduction: breakdown.lateDeduction,
      bpjsEmployment: breakdown.bpjsEmployment,
      bpjsHealth: breakdown.bpjsHealth,
      pph21: breakdown.pph21,
      otherDeductions: breakdown.otherDeductions,
      totalDeductions: breakdown.totalDeductions,
      netPay: breakdown.netPay,
      calculationNotes: trimStr(breakdown.calculationNotes, 500),
      recordStatus: 'active',
      createdBy: prevSlip?.createdBy || uid,
      createdAt: prevSlip?.createdAt || ts,
      updatedAt: ts,
    });
  }

  batch.set(doc(db, 'payroll', payrollId), {
    payrollId,
    companyId: DEFAULT_COMPANY_ID,
    periodMonth,
    periodLabel: formatMonthLabel(periodMonth),
    status: 'Calculation',
    isProvisional: true,
    employeeCount: activeEmps.length,
    totalGross,
    totalDeductions,
    totalNetPay,
    recordStatus: 'active',
    createdBy: params.existingRun?.createdBy || uid,
    createdAt: params.existingRun?.createdAt || ts,
    updatedAt: ts,
  });

  try {
    await batch.commit();
    await writeAuditLog({
      companyId: DEFAULT_COMPANY_ID,
      actorRole: params.actorRole,
      action: 'PAYROLL_CALCULATE',
      targetCollection: 'payroll',
      targetId: payrollId,
      summary: `Menghitung payroll ${formatMonthLabel(periodMonth)} untuk ${activeEmps.length} karyawan (Total Net: Rp ${totalNetPay.toLocaleString('id-ID')}).`,
    });
    return payrollId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `payroll/${payrollId}`);
  }
}

export async function advancePayrollStatus(params: {
  run: PayrollRunRecord;
  payslips: PayslipRecord[];
  nextStatus: PayrollWorkflowStatus;
  actorRole: string;
}): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.advancePayroll(params);
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  if (params.run.status === 'Paid') {
    throw new Error('Payroll sudah berstatus Paid dan tidak dapat diubah.');
  }

  const batch = writeBatch(db);
  const ts = serverTimestamp();
  const isProvisional = params.nextStatus !== 'Finalized' && params.nextStatus !== 'Paid';

  batch.update(doc(db, 'payroll', params.run.payrollId), {
    status: params.nextStatus,
    isProvisional,
    ...(params.nextStatus === 'HR Review' ? { reviewedBy: uid } : {}),
    ...(params.nextStatus === 'Management Approval' ? { approvedBy: uid } : {}),
    ...(params.nextStatus === 'Finalized' ? { finalizedAt: ts } : {}),
    ...(params.nextStatus === 'Paid' ? { paidAt: ts } : {}),
    updatedAt: ts,
  });

  const childSlips = params.payslips.filter((p) => p.payrollId === params.run.payrollId);
  for (const slip of childSlips) {
    batch.update(doc(db, 'payslips', slip.payslipId), {
      workflowStatus: params.nextStatus,
      isProvisional,
      updatedAt: ts,
    });
  }

  try {
    await batch.commit();
    await writeAuditLog({
      companyId: params.run.companyId,
      actorRole: params.actorRole,
      action: 'PAYROLL_WORKFLOW_TRANSITION',
      targetCollection: 'payroll',
      targetId: params.run.payrollId,
      summary: `Status payroll ${params.run.periodLabel} berubah dari ${params.run.status} menjadi ${params.nextStatus}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `payroll/${params.run.payrollId}`);
  }
}

export async function savePerformanceReview(
  payload: Omit<PerformanceReviewRecord, 'createdBy' | 'createdAt' | 'updatedAt' | 'recordStatus'>,
  isNew: boolean,
  actorRole: string
): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.savePerformance(payload, isNew, actorRole);
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const reviewId = sanitizeId(payload.reviewId, 'perf');
  try {
    if (isNew) {
      await setDoc(doc(db, 'performance_reviews', reviewId), {
        ...payload,
        reviewId,
        cycleLabel: trimStr(payload.cycleLabel, 60),
        kpiScore: Math.min(100, Math.max(0, Number(payload.kpiScore) || 0)),
        competencyScore: Math.min(100, Math.max(0, Number(payload.competencyScore) || 0)),
        strengths: trimStr(payload.strengths, 500),
        improvements: trimStr(payload.improvements, 500),
        recordStatus: 'active',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'performance_reviews', reviewId), {
        kpiScore: Math.min(100, Math.max(0, Number(payload.kpiScore) || 0)),
        competencyScore: Math.min(100, Math.max(0, Number(payload.competencyScore) || 0)),
        overallRating: payload.overallRating,
        strengths: trimStr(payload.strengths, 500),
        improvements: trimStr(payload.improvements, 500),
        status: payload.status,
        updatedAt: serverTimestamp(),
      });
    }
    await writeAuditLog({
      companyId: payload.companyId,
      actorRole,
      action: isNew ? 'PERFORMANCE_CREATE' : 'PERFORMANCE_UPDATE',
      targetCollection: 'performance_reviews',
      targetId: reviewId,
      summary: `Evaluasi kinerja ${payload.cycleLabel} untuk ${payload.employeeId} (${payload.overallRating}).`,
    });
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, `performance_reviews/${reviewId}`);
  }
}

export async function acknowledgePerformanceReview(reviewId: string): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.acknowledgePerformance(reviewId);
    return;
  }
  try {
    await updateDoc(doc(db, 'performance_reviews', reviewId), {
      status: 'Acknowledged',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `performance_reviews/${reviewId}`);
  }
}

export async function publishAnnouncement(
  payload: Pick<AnnouncementRecord, 'companyId' | 'title' | 'body' | 'category'>,
  actorRole: string
): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.publishAnnouncement(payload, actorRole);
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Autentikasi diperlukan.');
  const announcementId = makeId('ann');
  try {
    await setDoc(doc(db, 'announcements', announcementId), {
      announcementId,
      companyId: payload.companyId || DEFAULT_COMPANY_ID,
      title: trimStr(payload.title, 160),
      body: trimStr(payload.body, FIELD_LIMITS.announcementBodyMax),
      category: payload.category,
      publishedAt: serverTimestamp(),
      recordStatus: 'active',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      companyId: payload.companyId || DEFAULT_COMPANY_ID,
      actorRole,
      action: 'ANNOUNCEMENT_PUBLISH',
      targetCollection: 'announcements',
      targetId: announcementId,
      summary: `Menerbitkan pengumuman [${payload.category}]: ${payload.title}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `announcements/${announcementId}`);
  }
}

export async function deleteAnnouncement(announcementId: string, actorRole: string): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.deleteAnnouncement(announcementId, actorRole);
    return;
  }
  try {
    await deleteDoc(doc(db, 'announcements', announcementId));
    await writeAuditLog({
      companyId: DEFAULT_COMPANY_ID,
      actorRole,
      action: 'ANNOUNCEMENT_DELETE',
      targetCollection: 'announcements',
      targetId: announcementId,
      summary: `Menghapus pengumuman ${announcementId}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `announcements/${announcementId}`);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.markNotificationRead(notificationId);
    return;
  }
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      isRead: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function saveSystemSettings(
  settings: SystemSettingsRecord,
  actorRole: string
): Promise<void> {
  if (isDemoSessionActive()) {
    demoStore.saveSettings(settings, actorRole);
    return;
  }
  const path = `system_settings/${settings.settingId}`;
  try {
    await updateDoc(doc(db, 'system_settings', settings.settingId), {
      effectiveDate: settings.effectiveDate,
      bpjsHealthEmployeeRate: Number(settings.bpjsHealthEmployeeRate),
      bpjsHealthEmployerRate: Number(settings.bpjsHealthEmployerRate ?? 0.04),
      bpjsHealthCapAmount: Number(settings.bpjsHealthCapAmount ?? 12_000_000),
      bpjsJhtEmployeeRate: Number(settings.bpjsJhtEmployeeRate),
      bpjsJpEmployeeRate: Number(settings.bpjsJpEmployeeRate),
      bpjsJpCapAmount: Number(settings.bpjsJpCapAmount ?? 10_042_300),
      pph21Method: settings.pph21Method,
      pph21PtkpAnnual: Number(settings.pph21PtkpAnnual ?? 54_000_000),
      pph21Tier1Rate: Number(settings.pph21Tier1Rate ?? 0.05),
      pph21Tier2Rate: Number(settings.pph21Tier2Rate ?? 0.15),
      overtimeHourlyMultiplier: Math.max(1, Number(settings.overtimeHourlyMultiplier)),
      absenceDailyPenaltyRate: Number(settings.absenceDailyPenaltyRate ?? 1),
      latePenaltyPerMinute: Number(settings.latePenaltyPerMinute ?? 1500),
      requireGpsAttendance: Boolean(settings.requireGpsAttendance),
      requireSelfieAttendance: Boolean(settings.requireSelfieAttendance),
      officeLat: Number(settings.officeLat ?? -6.225),
      officeLng: Number(settings.officeLng ?? 106.8097),
      maxGeofenceMeters: Number(settings.maxGeofenceMeters ?? 500),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      companyId: settings.companyId,
      actorRole,
      action: 'SYSTEM_SETTINGS_UPDATE',
      targetCollection: 'system_settings',
      targetId: settings.settingId,
      summary: `Memperbarui parameter PPh 21 (${settings.pph21Method}), BPJS, dan geofence kantor (efektif ${settings.effectiveDate}).`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

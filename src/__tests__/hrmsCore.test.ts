import { describe, expect, it } from 'vitest';
import { DEMO_PERSONAS, demoStore } from '../services/demoSessionStore';
import {
  calculateDistanceMeters,
  calculateEmployeePayroll,
  evaluateShiftLateness,
} from '../services/payrollCalculator';
import { hasPermission, type EmployeeRecord, type SystemSettingsRecord } from '../types/hrms';
import { formatDateDMY } from '../utils/dateFormat';

const baseSettings: SystemSettingsRecord = {
  settingId: 'settings_default_2026',
  companyId: 'comp_nusantara_01',
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
  createdBy: 'uid_admin',
};

const sampleEmployee: EmployeeRecord = {
  employeeId: 'emp_002',
  companyId: 'comp_nusantara_01',
  uid: 'uid_002',
  employeeCode: 'NDK-2026-002',
  fullName: 'Raka Pratama Wijaya',
  email: 'raka@nusantaradigital.co.id',
  departmentId: 'dept_eng',
  positionId: 'pos_swe',
  employmentType: 'Full-Time',
  joinDate: '2024-03-04',
  employmentStatus: 'Active',
  baseSalary: 15_000_000,
  positionAllowance: 2_000_000,
  transportAllowance: 850_000,
  mealAllowance: 750_000,
  recordStatus: 'active',
  createdBy: 'uid_admin',
};

describe('Indonesian Payroll Calculation Engine', () => {
  it('computes gross income, BPJS salary caps, overtime (173 divisor), and provisional flag', () => {
    const result = calculateEmployeePayroll({
      employee: sampleEmployee,
      settings: baseSettings,
      approvedOvertimeHours: 4,
      absentDays: 0,
      totalLateMinutes: 0,
      workflowStatus: 'Calculation',
    });

    // Overtime = (15_000_000 / 173) * 4 * 1.5 = 520,231
    expect(result.overtimePayment).toBe(Math.round((15_000_000 / 173) * 4 * 1.5));
    expect(result.grossIncome).toBe(15_000_000 + 2_000_000 + 850_000 + 750_000 + result.overtimePayment);

    // BPJS Health capped at 12,000,000 * 1% = 120,000
    expect(result.bpjsHealth).toBe(120_000);

    // BPJS JHT = 17,000,000 * 2% = 340,000; JP capped at 10,042,300 * 1% = 100,423 -> total 440,423
    expect(result.bpjsEmployment).toBe(340_000 + 100_423);

    expect(result.pph21).toBeGreaterThan(0);
    expect(result.netPay).toBe(result.grossIncome - result.totalDeductions);
    expect(result.isProvisional).toBe(true);
  });

  it('supports Progressive PPh 21 mode and marks Finalized/Paid payslips non-provisional', () => {
    const result = calculateEmployeePayroll({
      employee: sampleEmployee,
      settings: { ...baseSettings, pph21Method: 'Progressive' },
      approvedOvertimeHours: 0,
      absentDays: 1,
      totalLateMinutes: 20,
      workflowStatus: 'Finalized',
    });

    expect(result.absenceDeduction).toBe(Math.round(15_000_000 / 22));
    expect(result.lateDeduction).toBe(30_000);
    expect(result.pph21).toBeGreaterThan(0);
    expect(result.isProvisional).toBe(false);
  });
});

describe('RBAC Permission Matrix Enforcement', () => {
  it('grants Super Admin full permissions and restricts Employee strictly from admin modules', () => {
    expect(hasPermission('Super Admin', 'settings', 'edit')).toBe(true);
    expect(hasPermission('Super Admin', 'users', 'delete')).toBe(true);

    expect(hasPermission('HR Admin', 'employees', 'create')).toBe(true);
    expect(hasPermission('HR Admin', 'settings', 'edit')).toBe(false);

    expect(hasPermission('Management', 'payroll', 'approve')).toBe(true);
    expect(hasPermission('Management', 'employees', 'edit')).toBe(false);

    expect(hasPermission('Supervisor', 'leave', 'approve')).toBe(true);
    expect(hasPermission('Supervisor', 'payroll', 'view')).toBe(false);

    expect(hasPermission('Employee', 'employees', 'view')).toBe(false);
    expect(hasPermission('Employee', 'audit', 'view')).toBe(false);
  });
});

describe('Geofencing, Shift Lateness & Date Formatting', () => {
  it('evaluates office geofence distance accurately via Haversine', () => {
    expect(calculateDistanceMeters(-6.225, 106.8097, -6.225, 106.8097)).toBe(0);
    const farDist = calculateDistanceMeters(-6.225, 106.8097, -6.25, 106.8097);
    expect(farDist).toBeGreaterThan(2000);
  });

  it('detects shift lateness beyond tolerance', () => {
    const onTime = new Date(2026, 10, 13, 8, 40, 0);
    const late = new Date(2026, 10, 13, 9, 5, 0);
    expect(evaluateShiftLateness(onTime, { startTime: '08:30', lateToleranceMinutes: 15 })).toEqual({
      lateMinutes: 0,
      status: 'Present',
    });
    expect(evaluateShiftLateness(late, { startTime: '08:30', lateToleranceMinutes: 15 })).toEqual({
      lateMinutes: 35,
      status: 'Late',
    });
  });

  it('formats dates consistently as DD-MMM-YYYY', () => {
    expect(formatDateDMY('2026-11-13')).toBe('13-Nov-2026');
  });
});

describe('Instant Demo Accounts & Local Sandbox Store', () => {
  it('provides all 5 RBAC personas and supports login/logout/reset', () => {
    expect(DEMO_PERSONAS).toHaveLength(5);
    const roles = DEMO_PERSONAS.map((p) => p.userAccount.role);
    expect(roles).toEqual(['Super Admin', 'HR Admin', 'Management', 'Supervisor', 'Employee']);

    const active = demoStore.loginDemo('demo_uid_emp');
    expect(active.userAccount.role).toBe('Employee');
    expect(demoStore.getActivePersona()?.id).toBe('demo_uid_emp');

    demoStore.logoutDemo();
    expect(demoStore.getActivePersona()).toBeNull();
  });

  it('prevents duplicate clock-in on the same date, deducts approved annual leave, and generates payroll', () => {
    demoStore.resetDemoData();
    demoStore.loginDemo('demo_uid_emp');
    const empSnap = demoStore.getSnapshot('Employee', 'demo_uid_emp');
    const emp = empSnap.employees[0];
    expect(emp).toBeDefined();

    const clockRes = demoStore.clockIn({
      employee: emp,
      shift: empSnap.shifts[0],
      settings: empSnap.settings,
      lat: -6.225,
      lng: 106.8097,
      selfieDataUrl: 'data:image/jpeg;base64,demo_clockin_selfie',
    });
    expect(clockRes.gpsVerified).toBe(true);
    expect(() =>
      demoStore.clockIn({
        employee: emp,
        shift: empSnap.shifts[0],
        settings: empSnap.settings,
      })
    ).toThrow(/DUPLICATE_ATTENDANCE/);

    demoStore.clockOut({
      employee: emp,
      lat: -6.225,
      lng: 106.8097,
      selfieDataUrl: 'data:image/jpeg;base64,demo_clockout_selfie',
    });
    const afterClockSnap = demoStore.getSnapshot('Employee', 'demo_uid_emp');
    const savedToday = afterClockSnap.attendance.find((a) => a.attendanceId === clockRes.attendanceId);
    expect(savedToday?.clockInSelfie).toBe('data:image/jpeg;base64,demo_clockin_selfie');
    expect(savedToday?.clockOutSelfie).toBe('data:image/jpeg;base64,demo_clockout_selfie');

    demoStore.loginDemo('demo_uid_sup');
    const supSnap = demoStore.getSnapshot('Supervisor', 'demo_uid_sup');
    const pendingLeave = supSnap.leaves.find((l) => l.status === 'Pending');
    expect(pendingLeave).toBeDefined();
    const beforeBal = supSnap.leaveBalances.find((b) => b.employeeId === pendingLeave!.employeeId)!;
    demoStore.decideLeave({
      leave: pendingLeave!,
      decision: 'Approved',
      actorRole: 'Supervisor',
    });
    const afterBal = demoStore
      .getSnapshot('Supervisor', 'demo_uid_sup')
      .leaveBalances.find((b) => b.employeeId === pendingLeave!.employeeId)!;
    expect(afterBal.annualUsed).toBe(beforeBal.annualUsed + pendingLeave!.totalDays);

    demoStore.loginDemo('demo_uid_hr');
    const hrSnap = demoStore.getSnapshot('HR Admin', 'demo_uid_hr');
    const payrollId = demoStore.generatePayroll({
      employees: hrSnap.employees,
      attendance: hrSnap.attendance,
      overtime: hrSnap.overtime,
      settings: hrSnap.settings,
      actorRole: 'HR Admin',
    });
    expect(payrollId).toMatch(/^pay_/);
    demoStore.logoutDemo();
    demoStore.resetDemoData();
  });
});

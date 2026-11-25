import type {
  EmployeeRecord,
  PayrollWorkflowStatus,
  PayslipRecord,
  ShiftRecord,
  SystemSettingsRecord,
} from '../types/hrms';

export interface PayrollCalculationInput {
  employee: EmployeeRecord;
  settings: SystemSettingsRecord;
  approvedOvertimeHours: number;
  absentDays: number;
  totalLateMinutes: number;
  otherAllowances?: number;
  otherDeductions?: number;
  workflowStatus?: PayrollWorkflowStatus;
}

export interface PayrollCalculationBreakdown {
  basicSalary: number;
  positionAllowance: number;
  transportAllowance: number;
  mealAllowance: number;
  overtimePayment: number;
  otherAllowances: number;
  grossIncome: number;
  absenceDeduction: number;
  lateDeduction: number;
  bpjsHealth: number;
  bpjsEmployment: number;
  pph21: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  isProvisional: boolean;
  calculationNotes: string;
}

/**
 * Computes monthly Indonesian payroll breakdown using configurable SystemSettings.
 * Marks statutory components as provisional unless final tax/BPJS reconciliation is verified.
 */
export function calculateEmployeePayroll(
  input: PayrollCalculationInput
): PayrollCalculationBreakdown {
  const {
    employee,
    settings,
    approvedOvertimeHours,
    absentDays,
    totalLateMinutes,
    otherAllowances = 0,
    otherDeductions = 0,
    workflowStatus = 'Calculation',
  } = input;

  const basicSalary = Math.max(0, Math.round(employee.baseSalary ?? 0));
  const positionAllowance = Math.max(0, Math.round(employee.positionAllowance ?? 0));
  const transportAllowance = Math.max(0, Math.round(employee.transportAllowance ?? 0));
  const mealAllowance = Math.max(0, Math.round(employee.mealAllowance ?? 0));

  // Indonesian standard hourly wage divider = 173 hours/month (Kepmenaker 102/2004)
  const hourlyRate = basicSalary / 173;
  const overtimePayment = Math.max(
    0,
    Math.round(hourlyRate * Math.max(0, approvedOvertimeHours) * (settings.overtimeHourlyMultiplier || 1.5))
  );

  const safeOtherAllowances = Math.max(0, Math.round(otherAllowances));
  const grossIncome =
    basicSalary +
    positionAllowance +
    transportAllowance +
    mealAllowance +
    overtimePayment +
    safeOtherAllowances;

  // Deductions: Absence & Late penalties
  const dailyBasic = basicSalary / 22;
  const absenceRate = settings.absenceDailyPenaltyRate ?? 1;
  const absenceDeduction = Math.max(0, Math.round(Math.max(0, absentDays) * dailyBasic * absenceRate));

  const lateRate = settings.latePenaltyPerMinute ?? 0;
  const lateDeduction = Math.max(0, Math.round(Math.max(0, totalLateMinutes) * lateRate));

  // BPJS Kesehatan (employee share with configurable cap, default Rp 12.000.000)
  const bpjsHealthCap = settings.bpjsHealthCapAmount ?? 12_000_000;
  const bpjsHealthBase = Math.min(basicSalary + positionAllowance, bpjsHealthCap);
  const bpjsHealth = Math.max(0, Math.round(bpjsHealthBase * (settings.bpjsHealthEmployeeRate ?? 0.01)));

  // BPJS Ketenagakerjaan: JHT (uncapped) + JP (capped, default Rp 10.042.300)
  const jhtBase = basicSalary + positionAllowance;
  const jpCap = settings.bpjsJpCapAmount ?? 10_042_300;
  const jpBase = Math.min(jhtBase, jpCap);
  const bpjsJht = Math.round(jhtBase * (settings.bpjsJhtEmployeeRate ?? 0.02));
  const bpjsJp = Math.round(jpBase * (settings.bpjsJpEmployeeRate ?? 0.01));
  const bpjsEmployment = Math.max(0, bpjsJht + bpjsJp);

  // Configurable Indonesian PPh 21 estimate (TER / Progressive)
  const ptkpAnnual = settings.pph21PtkpAnnual ?? 54_000_000;
  const tier1Rate = settings.pph21Tier1Rate ?? 0.05;
  const tier2Rate = settings.pph21Tier2Rate ?? 0.15;

  let pph21 = 0;
  if (settings.pph21Method === 'TER') {
    const monthlyPtkpThreshold = ptkpAnnual / 12;
    if (grossIncome > monthlyPtkpThreshold) {
      // Configurable simplified TER bracket progression for monthly withholding
      const excessRatio = (grossIncome - monthlyPtkpThreshold) / Math.max(1, grossIncome);
      const effectiveRate = grossIncome > 15_000_000 ? tier1Rate * 0.8 : tier1Rate * 0.45 * excessRatio;
      pph21 = Math.max(0, Math.round(grossIncome * Math.min(tier2Rate, effectiveRate)));
    }
  } else {
    // Progressive annualized method (5% up to 60jt taxable/yr, 15% above)
    const biayaJabatanMonthly = Math.min(500_000, Math.round(grossIncome * 0.05));
    const netAnnual = Math.max(0, (grossIncome - biayaJabatanMonthly - bpjsEmployment) * 12);
    const pkpAnnual = Math.max(0, netAnnual - ptkpAnnual);
    if (pkpAnnual > 0) {
      const tier1Taxable = Math.min(pkpAnnual, 60_000_000);
      const tier2Taxable = Math.max(0, pkpAnnual - 60_000_000);
      const annualTax = tier1Taxable * tier1Rate + tier2Taxable * tier2Rate;
      pph21 = Math.max(0, Math.round(annualTax / 12));
    }
  }

  const safeOtherDeductions = Math.max(0, Math.round(otherDeductions));
  const totalDeductions =
    absenceDeduction +
    lateDeduction +
    bpjsHealth +
    bpjsEmployment +
    pph21 +
    safeOtherDeductions;

  const netPay = Math.max(0, grossIncome - totalDeductions);
  const isProvisional = workflowStatus !== 'Finalized' && workflowStatus !== 'Paid';

  const calculationNotes = `Metode PPh 21: ${settings.pph21Method} (efektif ${settings.effectiveDate}). Lembur: ${approvedOvertimeHours} jam × ${settings.overtimeHourlyMultiplier}x. Status perhitungan: ${
    isProvisional ? 'Provisional (menunggu persetujuan akhir)' : 'Finalized'
  }.`;

  return {
    basicSalary,
    positionAllowance,
    transportAllowance,
    mealAllowance,
    overtimePayment,
    otherAllowances: safeOtherAllowances,
    grossIncome,
    absenceDeduction,
    lateDeduction,
    bpjsHealth,
    bpjsEmployment,
    pph21,
    otherDeductions: safeOtherDeductions,
    totalDeductions,
    netPay,
    isProvisional,
    calculationNotes,
  };
}

/**
 * Haversine distance calculation in meters for attendance geofence verification.
 */
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Calculates lateness in minutes against assigned Shift startTime & tolerance.
 */
export function evaluateShiftLateness(
  clockInDate: Date,
  shift: Pick<ShiftRecord, 'startTime' | 'lateToleranceMinutes'> | undefined
): { lateMinutes: number; status: 'Present' | 'Late' } {
  if (!shift) {
    return { lateMinutes: 0, status: 'Present' };
  }
  const [h, m] = shift.startTime.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    return { lateMinutes: 0, status: 'Present' };
  }
  const scheduled = new Date(clockInDate);
  scheduled.setHours(h, m, 0, 0);
  const diffMinutes = Math.floor((clockInDate.getTime() - scheduled.getTime()) / 60000);
  const tolerance = shift.lateToleranceMinutes ?? 0;
  if (diffMinutes > tolerance) {
    return { lateMinutes: diffMinutes, status: 'Late' };
  }
  return { lateMinutes: 0, status: 'Present' };
}

export function buildPayslipSummaryCSV(payslips: PayslipRecord[]): string {
  const headers = [
    'Payslip ID',
    'Employee ID',
    'Nama Karyawan',
    'Periode',
    'Status',
    'Gaji Pokok',
    'Total Tunjangan & Lembur',
    'Penghasilan Bruto',
    'BPJS Kes + TK',
    'PPh 21',
    'Potongan Lain',
    'Total Potongan',
    'Gaji Bersih (Net)',
  ];
  const rows = payslips.map((p) => {
    const allowances =
      (p.positionAllowance ?? 0) +
      (p.transportAllowance ?? 0) +
      (p.mealAllowance ?? 0) +
      (p.overtimePayment ?? 0) +
      (p.otherAllowances ?? 0);
    const bpjsTotal = (p.bpjsHealth ?? 0) + (p.bpjsEmployment ?? 0);
    const otherDed = (p.absenceDeduction ?? 0) + (p.lateDeduction ?? 0) + (p.otherDeductions ?? 0);
    return [
      p.payslipId,
      p.employeeId,
      `"${(p.employeeName || '').replace(/"/g, '""')}"`,
      p.periodMonth,
      p.workflowStatus,
      p.basicSalary,
      allowances,
      p.grossIncome,
      bpjsTotal,
      p.pph21 ?? 0,
      otherDed,
      p.totalDeductions,
      p.netPay,
    ].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

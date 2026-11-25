import React, { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  Clock,
  CreditCard,
  Edit3,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Plus,
  Search,
  Settings,
  Smartphone,
  Users,
  X,
} from 'lucide-react';
import {
  hasPermission,
  type AnnouncementRecord,
  type AttendanceRecord,
  type AuditLogRecord,
  type BackofficePage,
  type CompanyRecord,
  type DepartmentRecord,
  type EmployeeRecord,
  type LeaveBalanceRecord,
  type LeaveRequestRecord,
  type OvertimeRequestRecord,
  type PayrollRunRecord,
  type PayrollWorkflowStatus,
  type PayslipRecord,
  type PerformanceReviewRecord,
  type PositionRecord,
  type ShiftRecord,
  type SystemSettingsRecord,
  type UserAccountRecord,
} from '../../types/hrms';
import {
  advancePayrollStatus,
  decideLeaveRequest,
  decideOvertimeRequest,
  generateMonthlyPayroll,
  resolveAttendanceCorrection,
  saveEmployeeRecord,
  toJsDate,
} from '../../services/hrmsFirestore';
import { formatIDR } from '../../utils/currency';
import { formatDateDMY, formatMonthLabel, formatTimeHM, getMonthPrefix, getTodayISO } from '../../utils/dateFormat';
import { EmployeeFormModal } from './EmployeeFormModal';
import {
  AnnouncementsPanel,
  AuditLogsPanel,
  DepartmentsPanel,
  PerformancePanel,
  PositionsPanel,
  ReportsPanel,
  SettingsAndRbacPanel,
  ShiftsPanel,
} from './BackofficeSecondaryViews';
import { PayslipPrintableModal } from '../PayslipPrintableModal';
import { AttendancePhotoModal } from '../AttendancePhotoModal';

export interface HrmsWorkspaceData {
  company?: CompanyRecord;
  settings?: SystemSettingsRecord;
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
  auditLogs: AuditLogRecord[];
  hasPendingWrites: boolean;
  lastSyncedAt?: number;
}

interface BackofficeEnterpriseProps {
  currentUser: UserAccountRecord;
  data: HrmsWorkspaceData;
  onSwitchToEmployeePortal: () => void;
  onLogout: () => void;
}

const NAV_ITEMS: Array<{
  id: BackofficePage;
  label: string;
  icon: React.FC<{ className?: string }>;
  module: Parameters<typeof hasPermission>[1];
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { id: 'employees', label: 'Karyawan', icon: Users, module: 'employees' },
  { id: 'departments', label: 'Departemen', icon: Building2, module: 'departments' },
  { id: 'positions', label: 'Jabatan', icon: Briefcase, module: 'positions' },
  { id: 'attendance', label: 'Presensi', icon: Clock, module: 'attendance' },
  { id: 'leave', label: 'Cuti', icon: CalendarClock, module: 'leave' },
  { id: 'shifts', label: 'Shift & Jadwal', icon: Activity, module: 'shifts' },
  { id: 'overtime', label: 'Lembur', icon: FileText, module: 'overtime' },
  { id: 'payroll', label: 'Payroll', icon: CreditCard, module: 'payroll' },
  { id: 'performance', label: 'Kinerja', icon: Award, module: 'performance' },
  { id: 'announcements', label: 'Pengumuman', icon: Megaphone, module: 'announcements' },
  { id: 'reports', label: 'Laporan', icon: BarChart3, module: 'reports' },
  { id: 'audit', label: 'Audit Logs', icon: History, module: 'audit' },
  { id: 'settings', label: 'Pengaturan', icon: Settings, module: 'settings' },
];

const NEXT_WORKFLOW_MAP: Record<PayrollWorkflowStatus, PayrollWorkflowStatus | null> = {
  Draft: 'Calculation',
  Calculation: 'HR Review',
  'HR Review': 'Management Approval',
  'Management Approval': 'Finalized',
  Finalized: 'Paid',
  Paid: null,
};

export const BackofficeEnterprise: React.FC<BackofficeEnterpriseProps> = ({
  currentUser,
  data,
  onSwitchToEmployeePortal,
  onLogout,
}) => {
  const [activePage, setActivePage] = useState<BackofficePage>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Employee filters & pagination
  const [empSearch, setEmpSearch] = useState('');
  const [empDeptFilter, setEmpDeptFilter] = useState('ALL');
  const [empStatusFilter, setEmpStatusFilter] = useState('ALL');
  const [empPage, setEmpPage] = useState(1);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null | undefined>(undefined);

  // Payroll period & slip modal
  const [selectedPeriodMonth, setSelectedPeriodMonth] = useState(getMonthPrefix());
  const [payrollBusy, setPayrollBusy] = useState(false);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [viewingPayslip, setViewingPayslip] = useState<PayslipRecord | null>(null);

  // Rejection modal state
  const [rejectModal, setRejectModal] = useState<{
    type: 'leave' | 'overtime';
    item: LeaveRequestRecord | OvertimeRequestRecord;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [inspectingAttendance, setInspectingAttendance] = useState<AttendanceRecord | null>(null);
  const [liveTimeLabel, setLiveTimeLabel] = useState(() =>
    new Date().toLocaleTimeString('id-ID', { hour12: false })
  );

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveTimeLabel(new Date().toLocaleTimeString('id-ID', { hour12: false }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((n) => hasPermission(currentUser.role, n.module, 'view')),
    [currentUser.role]
  );

  const today = getTodayISO();
  const currentMonth = getMonthPrefix();

  // Dashboard Metrics (all 10 required widgets)
  const metrics = useMemo(() => {
    const totalEmployees = data.employees.length;
    const activeEmployees = data.employees.filter((e) => e.employmentStatus === 'Active').length;
    const inactiveEmployees = data.employees.filter((e) => e.employmentStatus === 'Inactive').length;

    const todayAttendance = data.attendance.filter((a) => a.workDate === today);
    const presentToday = todayAttendance.filter((a) => a.status === 'Present' || a.status === 'Late').length;
    const lateToday = todayAttendance.filter((a) => a.status === 'Late').length;
    const absentToday = Math.max(0, activeEmployees - presentToday);

    const pendingLeaves = data.leaves.filter((l) => l.status === 'Pending').length;
    const pendingOvertime = data.overtime.filter((o) => o.status === 'Pending').length;

    const monthAtt = data.attendance.filter((a) => a.workDate.startsWith(currentMonth));
    const monthlyPresent = monthAtt.filter((a) => a.status === 'Present').length;
    const monthlyLate = monthAtt.filter((a) => a.status === 'Late').length;
    const monthlyAbsent = monthAtt.filter((a) => a.status === 'Absent').length;

    const deptDistribution = data.departments.map((d) => ({
      departmentId: d.departmentId,
      name: d.name,
      code: d.code,
      count: data.employees.filter((e) => e.departmentId === d.departmentId).length,
    }));

    return {
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      presentToday,
      absentToday,
      lateToday,
      pendingLeaves,
      pendingOvertime,
      monthlyPresent,
      monthlyLate,
      monthlyAbsent,
      deptDistribution,
    };
  }, [data, today, currentMonth]);

  const filteredEmployees = useMemo(() => {
    return data.employees.filter((e) => {
      const matchSearch =
        !empSearch.trim() ||
        e.fullName.toLowerCase().includes(empSearch.toLowerCase()) ||
        e.employeeCode.toLowerCase().includes(empSearch.toLowerCase()) ||
        e.email.toLowerCase().includes(empSearch.toLowerCase());
      const matchDept = empDeptFilter === 'ALL' || e.departmentId === empDeptFilter;
      const matchStatus = empStatusFilter === 'ALL' || e.employmentStatus === empStatusFilter;
      return matchSearch && matchDept && matchStatus;
    });
  }, [data.employees, empSearch, empDeptFilter, empStatusFilter]);

  const pageSize = 8;
  const totalEmpPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const pagedEmployees = filteredEmployees.slice((empPage - 1) * pageSize, empPage * pageSize);

  const currentRun = data.payrollRuns.find((r) => r.periodMonth === selectedPeriodMonth);
  const currentRunSlips = data.payslips.filter((p) => p.periodMonth === selectedPeriodMonth);

  const handleToggleEmployeeStatus = async (emp: EmployeeRecord) => {
    const nextStatus = emp.employmentStatus === 'Active' ? 'Inactive' : 'Active';
    await saveEmployeeRecord(
      {
        employeeId: emp.employeeId,
        companyId: emp.companyId,
        uid: emp.uid,
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        email: emp.email,
        phone: emp.phone || '',
        address: emp.address || '',
        dateOfBirth: emp.dateOfBirth || '',
        gender: emp.gender || 'Laki-laki',
        photoUrl: emp.photoUrl || '',
        nik: emp.nik || '',
        npwp: emp.npwp || '',
        departmentId: emp.departmentId,
        positionId: emp.positionId,
        employmentType: emp.employmentType,
        joinDate: emp.joinDate,
        contractStartDate: emp.contractStartDate || '',
        contractEndDate: emp.contractEndDate || '',
        employmentStatus: nextStatus,
        supervisorId: emp.supervisorId || '',
        bankName: emp.bankName || '',
        bankAccountNumber: emp.bankAccountNumber || '',
        bankAccountHolder: emp.bankAccountHolder || '',
        shiftId: emp.shiftId || 'shift_reg',
        baseSalary: emp.baseSalary ?? 0,
        positionAllowance: emp.positionAllowance ?? 0,
        transportAllowance: emp.transportAllowance ?? 0,
        mealAllowance: emp.mealAllowance ?? 0,
        documentNotes: emp.documentNotes || '',
      },
      false,
      currentUser.role
    );
  };

  const handleCalculatePayroll = async () => {
    if (!data.settings) {
      setPayrollError('Pengaturan sistem payroll belum tersedia.');
      return;
    }
    setPayrollBusy(true);
    setPayrollError(null);
    try {
      await generateMonthlyPayroll({
        periodMonth: selectedPeriodMonth,
        employees: data.employees,
        attendance: data.attendance,
        overtime: data.overtime,
        settings: data.settings,
        existingRun: currentRun,
        existingPayslips: currentRunSlips,
        actorRole: currentUser.role,
      });
    } catch (err) {
      setPayrollError(err instanceof Error ? err.message : 'Gagal menghitung payroll.');
    } finally {
      setPayrollBusy(false);
    }
  };

  const handleAdvancePayroll = async (nextStatus: PayrollWorkflowStatus) => {
    if (!currentRun) return;
    setPayrollBusy(true);
    setPayrollError(null);
    try {
      await advancePayrollStatus({
        run: currentRun,
        payslips: currentRunSlips,
        nextStatus,
        actorRole: currentUser.role,
      });
    } catch (err) {
      setPayrollError(err instanceof Error ? err.message : 'Gagal memproses workflow payroll.');
    } finally {
      setPayrollBusy(false);
    }
  };

  const handleApproveLeave = async (leave: LeaveRequestRecord) => {
    setActionBusy(leave.leaveRequestId);
    setActionMessage(null);
    try {
      await decideLeaveRequest({ leave, decision: 'Approved', actorRole: currentUser.role });
      setActionMessage(`Cuti ${leave.employeeId} disetujui dan saldo cuti diperbarui secara atomik.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Gagal menyetujui cuti.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleApproveOvertime = async (ot: OvertimeRequestRecord) => {
    setActionBusy(ot.overtimeId);
    setActionMessage(null);
    try {
      await decideOvertimeRequest({ overtime: ot, decision: 'Approved', actorRole: currentUser.role });
      setActionMessage(`Lembur ${ot.employeeId} (${ot.durationHours} jam) disetujui.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Gagal menyetujui lembur.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModal) return;
    setActionBusy('reject');
    try {
      if (rejectModal.type === 'leave') {
        await decideLeaveRequest({
          leave: rejectModal.item as LeaveRequestRecord,
          decision: 'Rejected',
          rejectionReason: rejectReason,
          actorRole: currentUser.role,
        });
      } else {
        await decideOvertimeRequest({
          overtime: rejectModal.item as OvertimeRequestRecord,
          decision: 'Rejected',
          rejectionReason: rejectReason,
          actorRole: currentUser.role,
        });
      }
      setRejectModal(null);
      setRejectReason('');
    } finally {
      setActionBusy(null);
    }
  };

  const activeNavTitle = visibleNav.find((n) => n.id === activePage)?.label || 'Dashboard';

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-950 text-slate-200 flex flex-col transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/src/assets/images/brand_emblem_1795590990670.jpg"
              alt="KerjaPay"
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg object-cover"
            />
            <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
              KerjaPay HRM
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActivePage(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2.5">
          <div className="text-xs">
            <p className="font-semibold text-white truncate">{currentUser.displayName}</p>
            <p className="text-slate-400 truncate">
              {currentUser.role} · {data.company?.code || 'NDK-HQ'}
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToEmployeePortal}
            className="w-full min-h-[38px] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 border border-slate-800 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>Buka Mode ESS Karyawan</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[38px] inline-flex items-center justify-center gap-2 rounded-xl text-xs font-medium text-rose-300 hover:bg-rose-950/50"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-700"
              aria-label="Buka menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 truncate">
                {data.company?.name || 'PT Nusantara Digital Karya'} / {activeNavTitle}
              </p>
              <h1 className="text-lg font-bold text-slate-900 truncate">{activeNavTitle}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {data.hasPendingWrites ? (
              <span className="text-xs font-medium text-amber-700">
                Menyinkronkan perubahan...
              </span>
            ) : data.lastSyncedAt ? (
              <span className="hidden md:inline text-xs font-medium text-emerald-700 font-mono tabular-nums">
                Real-Time · {new Date(data.lastSyncedAt).toLocaleTimeString('id-ID', { hour12: false })}
              </span>
            ) : null}
            <span className="hidden sm:inline text-xs text-slate-500 font-mono tabular-nums">
              {formatDateDMY(today)} · {liveTimeLabel}
            </span>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {actionMessage && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-900 flex items-center justify-between">
              <span>{actionMessage}</span>
              <button type="button" onClick={() => setActionMessage(null)} className="font-semibold">
                Tutup
              </button>
            </div>
          )}

          {activePage === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500">Total Karyawan</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {metrics.totalEmployees}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Aktif {metrics.activeEmployees} · Nonaktif {metrics.inactiveEmployees}
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500">Hadir Hari Ini</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                    {metrics.presentToday}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Terlambat {metrics.lateToday} · Belum Hadir {metrics.absentToday}
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500">Menunggu Persetujuan Cuti</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                    {metrics.pendingLeaves}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActivePage('leave')}
                    className="text-xs font-medium text-slate-900 hover:underline mt-2"
                  >
                    Tinjau pengajuan cuti
                  </button>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500">Menunggu Persetujuan Lembur</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {metrics.pendingOvertime}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActivePage('overtime')}
                    className="text-xs font-medium text-slate-900 hover:underline mt-2"
                  >
                    Tinjau pengajuan lembur
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Statistik Kehadiran Bulan {formatMonthLabel(currentMonth)}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Agregasi real-time dari koleksi attendance Firestore
                    </p>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: 'Hadir Tepat Waktu (Present)', value: metrics.monthlyPresent, color: 'bg-emerald-600' },
                      { label: 'Terlambat (Late)', value: metrics.monthlyLate, color: 'bg-amber-500' },
                      { label: 'Tidak Hadir (Absent)', value: metrics.monthlyAbsent, color: 'bg-rose-500' },
                    ].map((row) => {
                      const total = Math.max(
                        1,
                        metrics.monthlyPresent + metrics.monthlyLate + metrics.monthlyAbsent
                      );
                      const pct = Math.round((row.value / total) * 100);
                      return (
                        <div key={row.label} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-700">{row.label}</span>
                            <span className="font-mono tabular-nums font-semibold text-slate-900">
                              {row.value} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Distribusi Karyawan per Departemen
                    </h2>
                    <p className="text-xs text-slate-500">
                      Total {metrics.totalEmployees} karyawan terdaftar lintas {data.departments.length} departemen
                    </p>
                  </div>
                  <div className="space-y-3">
                    {metrics.deptDistribution.map((dept) => {
                      const pct = Math.round(
                        (dept.count / Math.max(1, metrics.totalEmployees)) * 100
                      );
                      return (
                        <div key={dept.departmentId} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-700 font-medium">
                              {dept.name} · {dept.code}
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-slate-900">
                              {dept.count} orang ({pct}%)
                            </span>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-slate-900" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">Presensi Foto &amp; Kehadiran Terbaru</h2>
                  <button
                    type="button"
                    onClick={() => setActivePage('attendance')}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Lihat semua foto
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500">
                      <tr>
                        <th className="py-2.5 font-medium">Karyawan</th>
                        <th className="py-2.5 font-medium">Foto Selfie</th>
                        <th className="py-2.5 font-medium">Tanggal</th>
                        <th className="py-2.5 font-medium">Jam Masuk</th>
                        <th className="py-2.5 font-medium">Status</th>
                        <th className="py-2.5 font-medium">GPS &amp; Perangkat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.attendance.slice(0, 6).map((a) => {
                        const emp = data.employees.find((e) => e.employeeId === a.employeeId);
                        return (
                          <tr key={a.attendanceId}>
                            <td className="py-3 font-medium text-slate-900">{emp?.fullName || a.employeeId}</td>
                            <td className="py-3">
                              {a.clockInSelfie || a.clockOutSelfie ? (
                                <button
                                  type="button"
                                  onClick={() => setInspectingAttendance(a)}
                                  className="inline-flex items-center gap-1.5 group"
                                >
                                  {a.clockInSelfie && (
                                    <img
                                      src={a.clockInSelfie}
                                      alt="Selfie masuk"
                                      referrerPolicy="no-referrer"
                                      className="h-8 w-8 rounded-lg object-cover border border-slate-200 group-hover:border-emerald-600"
                                    />
                                  )}
                                  {a.clockOutSelfie && (
                                    <img
                                      src={a.clockOutSelfie}
                                      alt="Selfie pulang"
                                      referrerPolicy="no-referrer"
                                      className="h-8 w-8 rounded-lg object-cover border border-slate-200 group-hover:border-emerald-600"
                                    />
                                  )}
                                  <span className="text-xs font-medium text-slate-600 group-hover:text-emerald-700">
                                    Lihat
                                  </span>
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-3 font-mono tabular-nums text-xs text-slate-600">{formatDateDMY(a.workDate)}</td>
                            <td className="py-3 font-mono tabular-nums text-xs text-slate-800">{formatTimeHM(toJsDate(a.clockInAt))}</td>
                            <td className="py-3 text-xs font-medium text-slate-700">
                              {a.status}{a.lateMinutes ? ` (${a.lateMinutes} mnt)` : ''}
                            </td>
                            <td className="py-3 text-xs text-slate-500">
                              {a.gpsVerified ? 'GPS Terverifikasi' : 'Luar Geofence'} · {a.sourceDevice || 'Web'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activePage === 'employees' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="search"
                      value={empSearch}
                      onChange={(e) => {
                        setEmpSearch(e.target.value);
                        setEmpPage(1);
                      }}
                      placeholder="Cari nama, kode, atau email..."
                      className="w-full min-h-[40px] rounded-xl border border-slate-200 pl-9 pr-3 text-sm"
                    />
                  </div>
                  <select
                    value={empDeptFilter}
                    onChange={(e) => {
                      setEmpDeptFilter(e.target.value);
                      setEmpPage(1);
                    }}
                    className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
                  >
                    <option value="ALL">Semua Departemen</option>
                    {data.departments.map((d) => (
                      <option key={d.departmentId} value={d.departmentId}>{d.name}</option>
                    ))}
                  </select>
                  <select
                    value={empStatusFilter}
                    onChange={(e) => {
                      setEmpStatusFilter(e.target.value);
                      setEmpPage(1);
                    }}
                    className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                {hasPermission(currentUser.role, 'employees', 'create') && (
                  <button
                    type="button"
                    onClick={() => setEditingEmployee(null)}
                    className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Tambah Karyawan</span>
                  </button>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                    <tr>
                      <th className="px-5 py-3 font-medium">Karyawan</th>
                      <th className="px-5 py-3 font-medium">Departemen &amp; Jabatan</th>
                      <th className="px-5 py-3 font-medium">Kontrak &amp; Bergabung</th>
                      <th className="px-5 py-3 font-medium text-right">Gaji Pokok</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedEmployees.map((emp) => {
                      const dept = data.departments.find((d) => d.departmentId === emp.departmentId);
                      const pos = data.positions.find((p) => p.positionId === emp.positionId);
                      return (
                        <tr key={emp.employeeId} className="hover:bg-slate-50/60">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <img
                                src={emp.photoUrl || '/src/assets/images/avatar_emp_1_1795590992124.jpg'}
                                alt={emp.fullName}
                                referrerPolicy="no-referrer"
                                className="h-9 w-9 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                              <div>
                                <p className="font-semibold text-slate-900">{emp.fullName}</p>
                                <p className="text-xs text-slate-500 font-mono">
                                  {emp.employeeCode} · {emp.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-xs">
                            <p className="font-medium text-slate-800">{dept?.name || emp.departmentId}</p>
                            <p className="text-slate-500">{pos?.title || emp.positionId}</p>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-600">
                            <p>{emp.employmentType}</p>
                            <p className="font-mono tabular-nums text-slate-500">{formatDateDMY(emp.joinDate)}</p>
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatIDR(emp.baseSalary ?? 0)}
                          </td>
                          <td className="px-5 py-3.5 text-xs font-medium">
                            <span className={emp.employmentStatus === 'Active' ? 'text-emerald-700' : 'text-rose-700'}>
                              {emp.employmentStatus}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                            {hasPermission(currentUser.role, 'employees', 'edit') && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditingEmployee(emp)}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleEmployeeStatus(emp)}
                                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                                >
                                  {emp.employmentStatus === 'Active' ? 'Nonaktifkan' : 'Aktifkan'}
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span>
                  Menampilkan {pagedEmployees.length} dari {filteredEmployees.length} karyawan
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={empPage <= 1}
                    onClick={() => setEmpPage((p) => p - 1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-50"
                  >
                    Sebelumnya
                  </button>
                  <span className="font-mono tabular-nums">
                    {empPage} / {totalEmpPages}
                  </span>
                  <button
                    type="button"
                    disabled={empPage >= totalEmpPages}
                    onClick={() => setEmpPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-50"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            </div>
          )}

          {activePage === 'departments' && (
            <DepartmentsPanel departments={data.departments} employees={data.employees} role={currentUser.role} />
          )}

          {activePage === 'positions' && (
            <PositionsPanel positions={data.positions} departments={data.departments} role={currentUser.role} />
          )}

          {activePage === 'attendance' && (
            <div className="space-y-5">
              {data.attendance.some((a) => a.clockInSelfie || a.clockOutSelfie) && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Galeri Absensi Foto Terbaru</h2>
                    <p className="text-xs text-slate-500">
                      Klik foto untuk memeriksa timestamp, lokasi GPS, dan foto masuk/pulang.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {data.attendance
                      .filter((a) => a.clockInSelfie || a.clockOutSelfie)
                      .slice(0, 5)
                      .map((a) => {
                        const emp = data.employees.find((e) => e.employeeId === a.employeeId);
                        return (
                          <button
                            key={a.attendanceId}
                            type="button"
                            onClick={() => setInspectingAttendance(a)}
                            className="text-left rounded-xl border border-slate-200 overflow-hidden bg-slate-50 hover:border-emerald-600 transition-colors"
                          >
                            <div className="aspect-[4/3] w-full bg-slate-200 overflow-hidden">
                              <img
                                src={a.clockInSelfie || a.clockOutSelfie}
                                alt={`Foto presensi ${emp?.fullName || a.employeeId}`}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="p-2.5">
                              <p className="text-xs font-semibold text-slate-900 truncate">
                                {emp?.fullName || a.employeeId}
                              </p>
                              <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                                {formatDateDMY(a.workDate)} · {formatTimeHM(toJsDate(a.clockInAt))}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                    <tr>
                      <th className="px-5 py-3 font-medium">Karyawan</th>
                      <th className="px-5 py-3 font-medium">Tanggal</th>
                      <th className="px-5 py-3 font-medium">Masuk / Pulang</th>
                      <th className="px-5 py-3 font-medium">Status &amp; Terlambat</th>
                      <th className="px-5 py-3 font-medium">GPS &amp; Foto Selfie</th>
                      <th className="px-5 py-3 font-medium text-right">Koreksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.attendance.map((a) => {
                      const emp = data.employees.find((e) => e.employeeId === a.employeeId);
                      return (
                        <tr key={a.attendanceId} className="hover:bg-slate-50/60">
                          <td className="px-5 py-3.5 font-medium text-slate-900">{emp?.fullName || a.employeeId}</td>
                          <td className="px-5 py-3.5 font-mono tabular-nums text-xs text-slate-600">{formatDateDMY(a.workDate)}</td>
                          <td className="px-5 py-3.5 font-mono tabular-nums text-xs text-slate-800">
                            {formatTimeHM(toJsDate(a.clockInAt))} – {formatTimeHM(toJsDate(a.clockOutAt))}
                          </td>
                          <td className="px-5 py-3.5 text-xs">
                            <span className="font-semibold text-slate-800">{a.status}</span>
                            {a.lateMinutes ? ` · ${a.lateMinutes} mnt` : ''}
                            {a.workMinutes ? ` · ${Math.round(a.workMinutes / 60)}j ${a.workMinutes % 60}m` : ''}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-600">
                            <div className="flex items-center gap-2">
                              <span>{a.gpsVerified ? 'GPS Valid' : 'Luar Area'}</span>
                              {(a.clockInSelfie || a.clockOutSelfie) && (
                                <button
                                  type="button"
                                  onClick={() => setInspectingAttendance(a)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 hover:border-emerald-600"
                                >
                                  {a.clockInSelfie && (
                                    <img
                                      src={a.clockInSelfie}
                                      alt="Selfie masuk"
                                      referrerPolicy="no-referrer"
                                      className="h-6 w-6 rounded object-cover"
                                    />
                                  )}
                                  {a.clockOutSelfie && (
                                    <img
                                      src={a.clockOutSelfie}
                                      alt="Selfie pulang"
                                      referrerPolicy="no-referrer"
                                      className="h-6 w-6 rounded object-cover"
                                    />
                                  )}
                                  <span className="font-medium text-slate-800">Detail Foto</span>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right text-xs">
                            {a.correctionStatus === 'Pending' && hasPermission(currentUser.role, 'attendance', 'approve') ? (
                              <div className="inline-flex items-center gap-2">
                                <span className="text-amber-700">{a.correctionReason}</span>
                                <button
                                  type="button"
                                  onClick={() => resolveAttendanceCorrection(a.attendanceId, 'Approved', 'Present', currentUser.role)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-medium"
                                >
                                  Setujui
                                </button>
                                <button
                                  type="button"
                                  onClick={() => resolveAttendanceCorrection(a.attendanceId, 'Rejected', a.status, currentUser.role)}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700"
                                >
                                  Tolak
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-500">{a.correctionStatus || 'None'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activePage === 'leave' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                  <tr>
                    <th className="px-5 py-3 font-medium">Karyawan</th>
                    <th className="px-5 py-3 font-medium">Jenis &amp; Durasi</th>
                    <th className="px-5 py-3 font-medium">Tanggal</th>
                    <th className="px-5 py-3 font-medium">Alasan</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.leaves.map((lv) => {
                    const emp = data.employees.find((e) => e.employeeId === lv.employeeId);
                    const bal = data.leaveBalances.find((b) => b.employeeId === lv.employeeId);
                    return (
                      <tr key={lv.leaveRequestId} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-900">{emp?.fullName || lv.employeeId}</p>
                          <p className="text-xs text-slate-500">Sisa cuti tahunan: {bal?.annualRemaining ?? '-'} hari</p>
                        </td>
                        <td className="px-5 py-3.5 text-xs">
                          <p className="font-semibold text-slate-800">{lv.leaveType}</p>
                          <p className="font-mono tabular-nums text-slate-500">{lv.totalDays} hari</p>
                        </td>
                        <td className="px-5 py-3.5 text-xs font-mono tabular-nums text-slate-700">
                          {formatDateDMY(lv.startDate)} – {formatDateDMY(lv.endDate)}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-600 max-w-xs">
                          {lv.reason}
                          {lv.rejectionReason ? ` (Ditolak: ${lv.rejectionReason})` : ''}
                        </td>
                        <td className="px-5 py-3.5 text-xs font-semibold text-slate-800">{lv.status}</td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap space-x-2">
                          {lv.status === 'Pending' && hasPermission(currentUser.role, 'leave', 'approve') && (
                            <>
                              <button
                                type="button"
                                disabled={actionBusy === lv.leaveRequestId}
                                onClick={() => handleApproveLeave(lv)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800"
                              >
                                Setujui
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectModal({ type: 'leave', item: lv });
                                  setRejectReason('');
                                }}
                                className="px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50"
                              >
                                Tolak
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activePage === 'shifts' && <ShiftsPanel shifts={data.shifts} role={currentUser.role} />}

          {activePage === 'overtime' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                  <tr>
                    <th className="px-5 py-3 font-medium">Karyawan</th>
                    <th className="px-5 py-3 font-medium">Tanggal</th>
                    <th className="px-5 py-3 font-medium">Jam &amp; Durasi</th>
                    <th className="px-5 py-3 font-medium">Alasan</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.overtime.map((ot) => {
                    const emp = data.employees.find((e) => e.employeeId === ot.employeeId);
                    return (
                      <tr key={ot.overtimeId} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3.5 font-medium text-slate-900">{emp?.fullName || ot.employeeId}</td>
                        <td className="px-5 py-3.5 font-mono tabular-nums text-xs text-slate-700">{formatDateDMY(ot.overtimeDate)}</td>
                        <td className="px-5 py-3.5 font-mono tabular-nums text-xs text-slate-700">
                          {ot.startTime}–{ot.endTime} ({ot.durationHours} jam)
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-600 max-w-xs">{ot.reason}</td>
                        <td className="px-5 py-3.5 text-xs font-semibold text-slate-800">{ot.status}</td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap space-x-2">
                          {ot.status === 'Pending' && hasPermission(currentUser.role, 'overtime', 'approve') && (
                            <>
                              <button
                                type="button"
                                disabled={actionBusy === ot.overtimeId}
                                onClick={() => handleApproveOvertime(ot)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800"
                              >
                                Setujui
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectModal({ type: 'overtime', item: ot });
                                  setRejectReason('');
                                }}
                                className="px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50"
                              >
                                Tolak
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activePage === 'payroll' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Periode Payroll</label>
                    <input
                      type="month"
                      value={selectedPeriodMonth}
                      onChange={(e) => setSelectedPeriodMonth(e.target.value)}
                      className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
                    />
                  </div>
                  <div className="text-xs text-slate-600 pt-4">
                    Status: <span className="font-semibold text-slate-900">{currentRun?.status || 'Belum dihitung'}</span>
                    {currentRun?.isProvisional ? ' · Provisional' : ''}
                    {currentRun?.status === 'Paid' ? ' · Terkunci Permanen' : ''}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {hasPermission(currentUser.role, 'payroll', 'create') && currentRun?.status !== 'Paid' && (
                    <button
                      type="button"
                      disabled={payrollBusy}
                      onClick={handleCalculatePayroll}
                      className="min-h-[40px] px-4 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {payrollBusy ? 'Menghitung...' : currentRun ? 'Hitung Ulang Payroll' : 'Generate Payroll Bulan Ini'}
                    </button>
                  )}

                  {currentRun &&
                    NEXT_WORKFLOW_MAP[currentRun.status] &&
                    (hasPermission(currentUser.role, 'payroll', 'approve') ||
                      (currentRun.status === 'Calculation' && hasPermission(currentUser.role, 'payroll', 'edit'))) && (
                      <button
                        type="button"
                        disabled={payrollBusy}
                        onClick={() => handleAdvancePayroll(NEXT_WORKFLOW_MAP[currentRun.status]!)}
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" />
                        <span>Lanjut ke {NEXT_WORKFLOW_MAP[currentRun.status]}</span>
                      </button>
                    )}
                </div>
              </div>

              {payrollError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800">
                  {payrollError}
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Total Karyawan</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {currentRun?.employeeCount ?? currentRunSlips.length}
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Total Penghasilan Bruto</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {formatIDR(currentRun?.totalGross ?? 0)}
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Total Potongan (BPJS &amp; PPh 21)</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-rose-700 mt-1">
                    {formatIDR(currentRun?.totalDeductions ?? 0)}
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Total Gaji Bersih (Net Pay)</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                    {formatIDR(currentRun?.totalNetPay ?? 0)}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                    <tr>
                      <th className="px-5 py-3 font-medium">Karyawan</th>
                      <th className="px-5 py-3 font-medium text-right">Gaji Pokok</th>
                      <th className="px-5 py-3 font-medium text-right">Tunjangan &amp; Lembur</th>
                      <th className="px-5 py-3 font-medium text-right">BPJS + PPh 21</th>
                      <th className="px-5 py-3 font-medium text-right">Gaji Bersih</th>
                      <th className="px-5 py-3 font-medium text-right">Slip Gaji</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentRunSlips.map((slip) => {
                      const allowances =
                        (slip.positionAllowance ?? 0) +
                        (slip.transportAllowance ?? 0) +
                        (slip.mealAllowance ?? 0) +
                        (slip.overtimePayment ?? 0) +
                        (slip.otherAllowances ?? 0);
                      const statutory = (slip.bpjsHealth ?? 0) + (slip.bpjsEmployment ?? 0) + (slip.pph21 ?? 0);
                      return (
                        <tr key={slip.payslipId} className="hover:bg-slate-50/60">
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-slate-900">{slip.employeeName || slip.employeeId}</p>
                            <p className="text-xs text-slate-500">{slip.workflowStatus}</p>
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-700">
                            {formatIDR(slip.basicSalary)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-700">
                            {formatIDR(allowances)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono tabular-nums text-rose-700">
                            {formatIDR(statutory)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                            {formatIDR(slip.netPay)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => setViewingPayslip(slip)}
                              className="text-xs font-semibold text-slate-900 hover:underline"
                            >
                              Lihat &amp; Cetak
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {currentRunSlips.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-xs text-slate-500">
                          Belum ada data slip gaji untuk periode {formatMonthLabel(selectedPeriodMonth)}. Klik &quot;Generate Payroll Bulan Ini&quot; untuk menghitung.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activePage === 'performance' && (
            <PerformancePanel reviews={data.performance} employees={data.employees} role={currentUser.role} />
          )}

          {activePage === 'announcements' && (
            <AnnouncementsPanel announcements={data.announcements} role={currentUser.role} />
          )}

          {activePage === 'reports' && (
            <ReportsPanel
              employees={data.employees}
              departments={data.departments}
              attendance={data.attendance}
              leaves={data.leaves}
              payslips={data.payslips}
            />
          )}

          {activePage === 'audit' && <AuditLogsPanel logs={data.auditLogs} />}

          {activePage === 'settings' && (
            <SettingsAndRbacPanel
              settings={data.settings}
              users={data.users}
              employees={data.employees}
              role={currentUser.role}
            />
          )}
        </main>
      </div>

      {editingEmployee !== undefined && (
        <EmployeeFormModal
          employee={editingEmployee}
          departments={data.departments}
          positions={data.positions}
          shifts={data.shifts}
          employees={data.employees}
          actorRole={currentUser.role}
          onClose={() => setEditingEmployee(undefined)}
        />
      )}

      {viewingPayslip && (
        <PayslipPrintableModal
          payslip={viewingPayslip}
          company={data.company}
          employee={data.employees.find((e) => e.employeeId === viewingPayslip.employeeId)}
          departmentName={
            data.departments.find(
              (d) =>
                d.departmentId ===
                data.employees.find((e) => e.employeeId === viewingPayslip.employeeId)?.departmentId
            )?.name
          }
          positionTitle={
            data.positions.find(
              (p) =>
                p.positionId ===
                data.employees.find((e) => e.employeeId === viewingPayslip.employeeId)?.positionId
            )?.title
          }
          onClose={() => setViewingPayslip(null)}
        />
      )}

      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form onSubmit={handleConfirmReject} className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">
              Alasan Penolakan {rejectModal.type === 'leave' ? 'Cuti' : 'Lembur'}
            </h3>
            <textarea
              required
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Tuliskan alasan penolakan yang jelas untuk karyawan..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionBusy === 'reject'}
                className="px-4 py-2 rounded-xl bg-rose-700 text-xs font-semibold text-white"
              >
                Konfirmasi Tolak
              </button>
            </div>
          </form>
        </div>
      )}
      {inspectingAttendance && (
        <AttendancePhotoModal
          record={inspectingAttendance}
          employee={data.employees.find((e) => e.employeeId === inspectingAttendance.employeeId)}
          onClose={() => setInspectingAttendance(null)}
        />
      )}
    </div>
  );
};

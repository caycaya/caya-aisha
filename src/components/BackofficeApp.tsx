import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { adminApi, type AdminOverviewResponse } from '../services/api';
import type {
  AdminUser,
  AttendanceRecord,
  EmployeeProfile,
  Holiday,
  LeaveRequest,
  PayrollItem,
  PayrollRun,
  Position,
  WorkSchedule,
} from '../types/hrm';
import { formatDateDMY, formatMonthLabel, formatTimeHM, getMonthPrefix, getTodayISO } from '../utils/dateFormat';
import { formatIDR } from '../utils/currency';

type AdminSection = 'overview' | 'employees' | 'schedules' | 'attendance' | 'payroll';

interface BackofficeAppProps {
  admin: AdminUser;
  onLogout: () => void;
}

export const BackofficeApp: React.FC<BackofficeAppProps> = ({ admin, onLogout }) => {
  const [section, setSection] = useState<AdminSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sub-tabs
  const [empSubTab, setEmpSubTab] = useState<'employees' | 'positions'>('employees');
  const [attSubTab, setAttSubTab] = useState<'attendances' | 'leaves'>('attendances');

  // Filters
  const [empSearch, setEmpSearch] = useState('');
  const [attMonth, setAttMonth] = useState(getMonthPrefix());
  const [attSearch, setAttSearch] = useState('');

  // Modals: Employee Create/Edit
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<EmployeeProfile | null>(null);
  const [empForm, setEmpForm] = useState({
    nik: '',
    full_name: '',
    email: '',
    phone: '',
    position_id: 1,
    daily_rate: 250000,
    join_date: getTodayISO(),
    bank_name: 'BCA',
    bank_account: '',
    leave_quota: 12,
    status: 'Aktif' as 'Aktif' | 'Nonaktif',
    ess_enabled: true,
    ess_password: '',
  });

  // Modal: ESS Login Credentials Setup
  const [credEmp, setCredEmp] = useState<EmployeeProfile | null>(null);
  const [credForm, setCredForm] = useState({ email: '', password: '', ess_enabled: true });
  const [showCredPass, setShowCredPass] = useState(false);

  // Modal: Position Create/Edit
  const [posModalOpen, setPosModalOpen] = useState(false);
  const [editingPos, setEditingPos] = useState<Position | null>(null);
  const [posForm, setPosForm] = useState({
    title: '',
    department: '',
    default_daily_rate: 250000,
    description: '',
  });

  // Holiday form
  const [newHoliday, setNewHoliday] = useState({ holiday_date: getTodayISO(), name: '' });

  // Selfie Inspector
  const [inspectAtt, setInspectAtt] = useState<AttendanceRecord | null>(null);

  // Leave Review Modal
  const [reviewingLeave, setReviewingLeave] = useState<{
    leave: LeaveRequest;
    decision: 'Disetujui' | 'Ditolak';
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  // Payroll Generate & Item Edit
  const [payrollForm, setPayrollForm] = useState(() => {
    const now = new Date();
    const ym = getMonthPrefix(now);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return {
      period_label: `Payroll ${formatMonthLabel(ym)}`,
      start_date: `${ym}-01`,
      end_date: `${ym}-${String(lastDay).padStart(2, '0')}`,
    };
  });
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [editingPayrollItem, setEditingPayrollItem] = useState<PayrollItem | null>(null);
  const [itemAdj, setItemAdj] = useState({ allowance: 0, deduction: 0 });

  const showSuccess = (text: string) => setToast({ type: 'success', text });
  const showError = (err: unknown, fallback = 'Terjadi kesalahan.') =>
    setToast({ type: 'error', text: err instanceof Error ? err.message : fallback });

  const loadAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [ov, pos, emp, sched, att, lv, pay] = await Promise.all([
        adminApi.getOverview(),
        adminApi.getPositions(),
        adminApi.getEmployees(),
        adminApi.getSchedules(),
        adminApi.getAttendances({ month: attMonth }),
        adminApi.getLeaves(),
        adminApi.getPayrollRuns(),
      ]);
      setOverview(ov);
      setPositions(pos);
      setEmployees(emp);
      setSchedules(sched.schedules);
      setHolidays(sched.holidays);
      setAttendances(att);
      setLeaves(lv);
      setPayrollRuns(pay);
      if (pay.length > 0 && selectedRunId === null) {
        setSelectedRunId(pay[0].id);
      }
    } catch (err) {
      showError(err, 'Gagal memuat data Backoffice.');
    } finally {
      setIsRefreshing(false);
    }
  }, [attMonth, selectedRunId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const poller = setInterval(() => {
      loadAll();
    }, 20000);
    return () => clearInterval(poller);
  }, [loadAll]);

  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      opts.push(getMonthPrefix(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    }
    return opts;
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.nik.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.position_title || '').toLowerCase().includes(q)
    );
  }, [employees, empSearch]);

  const filteredAttendances = useMemo(() => {
    const q = attSearch.trim().toLowerCase();
    if (!q) return attendances;
    return attendances.filter(
      (a) =>
        (a.employee_name || '').toLowerCase().includes(q) ||
        (a.employee_nik || '').toLowerCase().includes(q)
    );
  }, [attendances, attSearch]);

  const activeRun = useMemo(
    () => payrollRuns.find((r) => r.id === selectedRunId) ?? payrollRuns[0] ?? null,
    [payrollRuns, selectedRunId]
  );

  // Handlers: Employees
  const openCreateEmployee = () => {
    const defaultPos = positions[0];
    setEditingEmp(null);
    setEmpForm({
      nik: `EMP-${new Date().getFullYear()}-${String(employees.length + 1).padStart(3, '0')}`,
      full_name: '',
      email: '',
      phone: '',
      position_id: defaultPos?.id ?? 1,
      daily_rate: defaultPos?.default_daily_rate ?? 250000,
      join_date: getTodayISO(),
      bank_name: 'BCA',
      bank_account: '',
      leave_quota: 12,
      status: 'Aktif',
      ess_enabled: true,
      ess_password: '',
    });
    setEmpModalOpen(true);
  };

  const openEditEmployee = (emp: EmployeeProfile) => {
    setEditingEmp(emp);
    setEmpForm({
      nik: emp.nik,
      full_name: emp.full_name,
      email: emp.email,
      phone: emp.phone,
      position_id: emp.position_id,
      daily_rate: emp.daily_rate,
      join_date: emp.join_date,
      bank_name: emp.bank_name,
      bank_account: emp.bank_account,
      leave_quota: emp.leave_quota,
      status: emp.status,
      ess_enabled: Boolean(emp.ess_enabled),
      ess_password: '',
    });
    setEmpModalOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEmp) {
        await adminApi.updateEmployee(editingEmp.id, empForm);
        showSuccess(`Data karyawan ${empForm.full_name} berhasil diperbarui.`);
      } else {
        await adminApi.createEmployee(empForm);
        showSuccess(`Karyawan ${empForm.full_name} berhasil ditambahkan.`);
      }
      setEmpModalOpen(false);
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credEmp) return;
    try {
      await adminApi.updateEmployeeCredentials(credEmp.id, {
        email: credForm.email,
        password: credForm.password || undefined,
        ess_enabled: credForm.ess_enabled,
      });
      showSuccess(`Kredensial login ESS untuk ${credEmp.full_name} berhasil disimpan.`);
      setCredEmp(null);
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  const handleDeleteEmployee = async (emp: EmployeeProfile) => {
    try {
      await adminApi.deleteEmployee(emp.id);
      showSuccess(`Karyawan ${emp.full_name} telah dihapus.`);
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  // Handlers: Positions
  const openCreatePosition = () => {
    setEditingPos(null);
    setPosForm({ title: '', department: '', default_daily_rate: 250000, description: '' });
    setPosModalOpen(true);
  };

  const openEditPosition = (pos: Position) => {
    setEditingPos(pos);
    setPosForm({
      title: pos.title,
      department: pos.department,
      default_daily_rate: pos.default_daily_rate,
      description: pos.description,
    });
    setPosModalOpen(true);
  };

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPos) {
        await adminApi.updatePosition(editingPos.id, posForm);
        showSuccess('Data jabatan berhasil diperbarui.');
      } else {
        await adminApi.createPosition(posForm);
        showSuccess('Jabatan baru berhasil ditambahkan.');
      }
      setPosModalOpen(false);
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  const handleDeletePosition = async (pos: Position) => {
    try {
      await adminApi.deletePosition(pos.id);
      showSuccess(`Jabatan ${pos.title} dihapus.`);
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  // Handlers: Schedules & Holidays
  const handleSaveSchedules = async () => {
    try {
      await adminApi.updateSchedules(schedules);
      showSuccess('Jadwal hari dan jam kerja berhasil disimpan.');
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.addHoliday(newHoliday);
      setNewHoliday({ holiday_date: getTodayISO(), name: '' });
      showSuccess('Hari libur khusus ditambahkan.');
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  // Handlers: Attendance & Leaves
  const handleStatusChange = async (attId: number, status: AttendanceRecord['status']) => {
    try {
      await adminApi.updateAttendanceStatus(attId, status);
      showSuccess('Status kehadiran diperbarui.');
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  const handleLeaveDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingLeave) return;
    try {
      await adminApi.reviewLeave(reviewingLeave.leave.id, {
        status: reviewingLeave.decision,
        admin_note: reviewNote,
      });
      showSuccess(`Pengajuan cuti ${reviewingLeave.leave.employee_name} ${reviewingLeave.decision.toLowerCase()}.`);
      setReviewingLeave(null);
      setReviewNote('');
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  // Handlers: Payroll
  const handleGeneratePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await adminApi.generatePayroll(payrollForm);
      setSelectedRunId(created.id);
      showSuccess(`Payroll "${created.period_label}" berhasil dihitung otomatis.`);
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  const handleSavePayrollItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayrollItem) return;
    try {
      await adminApi.updatePayrollItem(editingPayrollItem.id, itemAdj);
      setEditingPayrollItem(null);
      showSuccess('Penyesuaian slip gaji disimpan.');
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  const handleFinalizeRun = async (runId: number) => {
    try {
      await adminApi.finalizePayrollRun(runId);
      showSuccess('Periode payroll telah dibayar dan slip diterbitkan ke ESS karyawan.');
      await loadAll();
    } catch (err) {
      showError(err);
    }
  };

  const navItems: Array<{ id: AdminSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
    { id: 'employees', label: 'Karyawan & Jabatan', icon: Users },
    { id: 'schedules', label: 'Hari & Jam Kerja', icon: CalendarClock },
    { id: 'attendance', label: 'Kehadiran & Cuti', icon: ClipboardCheck },
    { id: 'payroll', label: 'Payroll Harian', icon: Wallet },
  ];

  const sectionTitle = navItems.find((n) => n.id === section)?.label || 'Ringkasan';

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0B131E] text-white border-r border-slate-800">
        <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800">
          <img
            src="/src/assets/images/brand_emblem_1795590990670.jpg"
            alt="KerjaPay HRM"
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-lg object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="font-display text-base font-bold tracking-tight whitespace-nowrap">KerjaPay Backoffice</span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full min-h-[44px] flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={admin.avatar_url || '/src/assets/images/avatar_admin_1795590992322.jpg'}
              alt={admin.name}
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-full object-cover border border-slate-700 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{admin.name}</p>
              <p className="text-[11px] text-slate-400 truncate">{admin.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[40px] flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Keluar Backoffice</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-[#0B131E] text-white flex flex-col h-full z-10">
            <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800">
              <span className="font-display text-base font-bold">KerjaPay Backoffice</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full min-h-[44px] flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                      active ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-800">
              <button
                type="button"
                onClick={onLogout}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300"
              >
                <LogOut className="h-4 w-4" />
                <span>Keluar Backoffice</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-700"
              aria-label="Buka menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 whitespace-nowrap">
                Backoffice Management · <span className="font-mono tabular-nums">{formatDateDMY(new Date())}</span>
              </p>
              <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">{sectionTitle}</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={loadAll}
            disabled={isRefreshing}
            className="min-h-[40px] inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Segarkan Data</span>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
          {toast && (
            <div
              className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm border ${
                toast.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              <span>{toast.text}</span>
              <button type="button" onClick={() => setToast(null)} className="p-1 opacity-70 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* SECTION 1: RINGKASAN */}
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-2xl bg-white border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Karyawan Aktif</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    {overview?.totalEmployees ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {overview?.essActiveCount ?? 0} akun login ESS aktif
                  </p>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Hadir Hari Ini</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                    {overview?.presentToday ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {overview?.lateToday ?? 0} terlambat · {formatDateDMY(overview?.today)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Pengajuan Cuti Menunggu</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-amber-700 tabular-nums">
                    {overview?.pendingLeaves ?? 0}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSection('attendance');
                      setAttSubTab('leaves');
                    }}
                    className="mt-1 text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Tinjau Pengajuan Cuti
                  </button>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Akumulasi Payroll Bulan Ini</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    {formatIDR(overview?.estPayrollMonth ?? 0)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSection('payroll')}
                    className="mt-1 text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Kelola Payroll Harian
                  </button>
                </div>
              </div>

              <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">Aktivitas Presensi Terbaru</h2>
                    <p className="text-xs text-slate-500">Tersinkron langsung dengan Clock-In / Clock-Out Mobile PWA.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSection('attendance')}
                    className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap"
                  >
                    Semua Presensi
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                        <th className="py-3 px-5">Karyawan</th>
                        <th className="py-3 px-4">Tanggal</th>
                        <th className="py-3 px-4">Clock-In</th>
                        <th className="py-3 px-4">Clock-Out</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-5 text-right">Bukti Selfie</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {(overview?.recentAttendances ?? []).map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-5">
                            <p className="font-medium text-slate-900">{a.employee_name}</p>
                            <p className="text-xs text-slate-500 font-mono">
                              {a.employee_nik} · {a.position_title}
                            </p>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                            {formatDateDMY(a.work_date)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                            {formatTimeHM(a.clock_in_at)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                            {a.clock_out_at ? formatTimeHM(a.clock_out_at) : '--:--'}
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold">
                            <span
                              className={
                                a.status === 'Hadir'
                                  ? 'text-emerald-700'
                                  : a.status === 'Terlambat'
                                  ? 'text-amber-700'
                                  : 'text-red-600'
                              }
                            >
                              {a.status}
                            </span>
                          </td>
                          <td className="py-3 px-5 text-right">
                            {a.clock_in_photo ? (
                              <button
                                type="button"
                                onClick={() => setInspectAtt(a)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                              >
                                <Camera className="h-3.5 w-3.5" />
                                <span>Lihat Selfie</span>
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">Tanpa foto</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* SECTION 2: KARYAWAN & JABATAN */}
          {section === 'employees' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="inline-flex rounded-xl bg-slate-200/70 p-1">
                  <button
                    type="button"
                    onClick={() => setEmpSubTab('employees')}
                    className={`min-h-[40px] rounded-lg px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                      empSubTab === 'employees' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Data Karyawan &amp; Login ESS ({employees.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmpSubTab('positions')}
                    className={`min-h-[40px] rounded-lg px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                      empSubTab === 'positions' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Data Jabatan ({positions.length})
                  </button>
                </div>

                {empSubTab === 'employees' ? (
                  <button
                    type="button"
                    onClick={openCreateEmployee}
                    className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Tambah Karyawan</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openCreatePosition}
                    className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Tambah Jabatan</span>
                  </button>
                )}
              </div>

              {empSubTab === 'employees' ? (
                <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full sm:w-80">
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                        placeholder="Cari nama, NIK, atau email..."
                        className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-sm focus:border-emerald-600 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Klik <strong>Atur Login ESS</strong> untuk mengatur email &amp; password PWA karyawan.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                          <th className="py-3 px-5">Karyawan</th>
                          <th className="py-3 px-4">Jabatan &amp; Dept</th>
                          <th className="py-3 px-4">Bergabung</th>
                          <th className="py-3 px-4 text-right">Gaji Harian</th>
                          <th className="py-3 px-4">Akses Login ESS</th>
                          <th className="py-3 px-5 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredEmployees.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50/60">
                            <td className="py-3.5 px-5">
                              <div className="flex items-center gap-3">
                                <img
                                  src={emp.avatar_url || '/src/assets/images/avatar_emp_1_1795590992124.jpg'}
                                  alt={emp.full_name}
                                  referrerPolicy="no-referrer"
                                  className="h-9 w-9 rounded-full object-cover border border-slate-200 shrink-0"
                                />
                                <div>
                                  <p className="font-semibold text-slate-900">{emp.full_name}</p>
                                  <p className="text-xs text-slate-500 font-mono">
                                    {emp.nik} · {emp.email}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <p className="text-slate-900 font-medium">{emp.position_title}</p>
                              <p className="text-xs text-slate-500">{emp.department}</p>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                              {formatDateDMY(emp.join_date)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-xs sm:text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                              {formatIDR(emp.daily_rate)}
                            </td>
                            <td className="py-3.5 px-4">
                              {emp.ess_enabled && emp.has_password ? (
                                <span className="text-xs font-semibold text-emerald-700">ESS Aktif</span>
                              ) : (
                                <span className="text-xs font-semibold text-amber-700">Belum Diatur</span>
                              )}
                            </td>
                            <td className="py-3.5 px-5 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCredEmp(emp);
                                    setCredForm({
                                      email: emp.email,
                                      password: '',
                                      ess_enabled: Boolean(emp.ess_enabled),
                                    });
                                    setShowCredPass(false);
                                  }}
                                  className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
                                >
                                  <KeyRound className="h-3.5 w-3.5" />
                                  <span>Atur Login ESS</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditEmployee(emp)}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                                  title="Edit biodata karyawan"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEmployee(emp)}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                                  title="Hapus karyawan"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                          <th className="py-3 px-5">Nama Jabatan</th>
                          <th className="py-3 px-4">Departemen</th>
                          <th className="py-3 px-4 text-right">Tarif Harian Default</th>
                          <th className="py-3 px-4 text-right">Karyawan</th>
                          <th className="py-3 px-5 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {positions.map((pos) => (
                          <tr key={pos.id} className="hover:bg-slate-50/60">
                            <td className="py-3.5 px-5">
                              <div className="flex items-center gap-2.5">
                                <Briefcase className="h-4 w-4 text-slate-400 shrink-0" />
                                <div>
                                  <p className="font-semibold text-slate-900">{pos.title}</p>
                                  <p className="text-xs text-slate-500">{pos.description || '-'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-700">{pos.department}</td>
                            <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                              {formatIDR(pos.default_daily_rate)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-slate-700 tabular-nums">
                              {pos.employee_count ?? 0}
                            </td>
                            <td className="py-3.5 px-5 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditPosition(pos)}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePosition(pos)}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* SECTION 3: HARI & JAM KERJA */}
          {section === 'schedules' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <section className="lg:col-span-8 rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">Pengaturan Hari &amp; Jam Kerja</h2>
                    <p className="text-xs text-slate-500">Digunakan untuk menentukan status Hadir / Terlambat saat Clock-In.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSchedules}
                    className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Check className="h-4 w-4" />
                    <span>Simpan Jadwal</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                        <th className="py-2.5 pr-4">Hari</th>
                        <th className="py-2.5 px-3">Status Hari</th>
                        <th className="py-2.5 px-3">Jam Masuk</th>
                        <th className="py-2.5 px-3">Jam Pulang</th>
                        <th className="py-2.5 pl-3">Toleransi (mnt)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {schedules.map((s, idx) => (
                        <tr key={s.day_of_week}>
                          <td className="py-3 pr-4 font-semibold text-slate-900">{s.day_name}</td>
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...schedules];
                                next[idx] = { ...s, is_work_day: s.is_work_day ? 0 : 1 };
                                setSchedules(next);
                              }}
                              className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-semibold border ${
                                s.is_work_day
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-slate-100 text-slate-500'
                              }`}
                            >
                              {s.is_work_day ? 'Hari Kerja' : 'Libur'}
                            </button>
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="time"
                              disabled={!s.is_work_day}
                              value={s.clock_in_time}
                              onChange={(e) => {
                                const next = [...schedules];
                                next[idx] = { ...s, clock_in_time: e.target.value };
                                setSchedules(next);
                              }}
                              className="min-h-[36px] rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-mono disabled:opacity-40"
                            />
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="time"
                              disabled={!s.is_work_day}
                              value={s.clock_out_time}
                              onChange={(e) => {
                                const next = [...schedules];
                                next[idx] = { ...s, clock_out_time: e.target.value };
                                setSchedules(next);
                              }}
                              className="min-h-[36px] rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-mono disabled:opacity-40"
                            />
                          </td>
                          <td className="py-3 pl-3">
                            <input
                              type="number"
                              min={0}
                              max={180}
                              disabled={!s.is_work_day}
                              value={s.late_tolerance_min}
                              onChange={(e) => {
                                const next = [...schedules];
                                next[idx] = { ...s, late_tolerance_min: Number(e.target.value) };
                                setSchedules(next);
                              }}
                              className="w-20 min-h-[36px] rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-mono tabular-nums disabled:opacity-40"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="lg:col-span-4 rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">Hari Libur Perusahaan</h2>
                  <p className="text-xs text-slate-500">Daftar tanggal merah atau cuti bersama.</p>
                </div>

                <form onSubmit={handleAddHoliday} className="space-y-3">
                  <input
                    type="date"
                    required
                    value={newHoliday.holiday_date}
                    onChange={(e) => setNewHoliday({ ...newHoliday, holiday_date: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Keterangan hari libur..."
                    value={newHoliday.name}
                    onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="w-full min-h-[40px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Tambah Hari Libur
                  </button>
                </form>

                <div className="divide-y divide-slate-100">
                  {holidays.map((h) => (
                    <div key={h.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{h.name}</p>
                        <p className="text-xs font-mono text-slate-500 tabular-nums">
                          {formatDateDMY(h.holiday_date)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await adminApi.deleteHoliday(h.id);
                          await loadAll();
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {holidays.length === 0 && (
                    <p className="py-4 text-center text-xs text-slate-400">Belum ada hari libur tambahan.</p>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* SECTION 4: KEHADIRAN & CUTI APPROVAL */}
          {section === 'attendance' && (
            <div className="space-y-5">
              <div className="inline-flex rounded-xl bg-slate-200/70 p-1">
                <button
                  type="button"
                  onClick={() => setAttSubTab('attendances')}
                  className={`min-h-[40px] rounded-lg px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                    attSubTab === 'attendances' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Data Kehadiran ({attendances.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAttSubTab('leaves')}
                  className={`min-h-[40px] rounded-lg px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                    attSubTab === 'leaves' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Approval Cuti ({leaves.filter((l) => l.status === 'Menunggu').length} Menunggu)
                </button>
              </div>

              {attSubTab === 'attendances' ? (
                <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full sm:w-72">
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={attSearch}
                        onChange={(e) => setAttSearch(e.target.value)}
                        placeholder="Filter nama atau NIK..."
                        className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-sm"
                      />
                    </div>
                    <select
                      value={attMonth}
                      onChange={(e) => setAttMonth(e.target.value)}
                      className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      {monthOptions.map((m) => (
                        <option key={m} value={m}>
                          {formatMonthLabel(m)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                          <th className="py-3 px-5">Tanggal</th>
                          <th className="py-3 px-4">Karyawan</th>
                          <th className="py-3 px-4">Clock-In</th>
                          <th className="py-3 px-4">Clock-Out</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-5 text-right">Selfie</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredAttendances.map((a) => (
                          <tr key={a.id} className="hover:bg-slate-50/60">
                            <td className="py-3 px-5 font-mono text-xs text-slate-900 tabular-nums whitespace-nowrap">
                              {formatDateDMY(a.work_date)}
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-medium text-slate-900">{a.employee_name}</p>
                              <p className="text-xs font-mono text-slate-500">{a.employee_nik}</p>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                              {formatTimeHM(a.clock_in_at)}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                              {a.clock_out_at ? formatTimeHM(a.clock_out_at) : '--:--'}
                            </td>
                            <td className="py-3 px-4">
                              <select
                                value={a.status}
                                onChange={(e) => handleStatusChange(a.id, e.target.value as AttendanceRecord['status'])}
                                className="min-h-[34px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                              >
                                <option value="Hadir">Hadir</option>
                                <option value="Terlambat">Terlambat</option>
                                <option value="Pulang Awal">Pulang Awal</option>
                                <option value="Alpa">Alpa</option>
                              </select>
                            </td>
                            <td className="py-3 px-5 text-right">
                              {a.clock_in_photo || a.clock_out_photo ? (
                                <button
                                  type="button"
                                  onClick={() => setInspectAtt(a)}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
                                >
                                  <Camera className="h-3.5 w-3.5" />
                                  <span>Lihat Bukti</span>
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                          <th className="py-3 px-5">Karyawan</th>
                          <th className="py-3 px-4">Jenis &amp; Alasan</th>
                          <th className="py-3 px-4">Periode</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-5 text-right">Keputusan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {leaves.map((lv) => (
                          <tr key={lv.id} className="hover:bg-slate-50/60">
                            <td className="py-3.5 px-5">
                              <p className="font-semibold text-slate-900">{lv.employee_name}</p>
                              <p className="text-xs font-mono text-slate-500">
                                {lv.employee_nik} · {lv.position_title}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 max-w-xs">
                              <p className="font-medium text-slate-900">{lv.leave_type}</p>
                              <p className="text-xs text-slate-500">{lv.reason}</p>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                              {formatDateDMY(lv.start_date)} – {formatDateDMY(lv.end_date)}
                              <span className="block text-slate-400">{lv.total_days} Hari</span>
                            </td>
                            <td className="py-3.5 px-4 text-xs font-semibold">
                              <span
                                className={
                                  lv.status === 'Disetujui'
                                    ? 'text-emerald-700'
                                    : lv.status === 'Ditolak'
                                    ? 'text-red-600'
                                    : 'text-amber-700'
                                }
                              >
                                {lv.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-5 text-right">
                              {lv.status === 'Menunggu' ? (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReviewNote('');
                                      setReviewingLeave({ leave: lv, decision: 'Disetujui' });
                                    }}
                                    className="min-h-[34px] inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    <span>Setujui</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReviewNote('');
                                      setReviewingLeave({ leave: lv, decision: 'Ditolak' });
                                    }}
                                    className="min-h-[34px] inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    <span>Tolak</span>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  {lv.reviewed_at ? formatDateDMY(lv.reviewed_at) : 'Selesai'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {leaves.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                              Belum ada pengajuan cuti dari karyawan.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* SECTION 5: PAYROLL HARIAN */}
          {section === 'payroll' && (
            <div className="space-y-6">
              {/* Generator Card */}
              <section className="rounded-2xl bg-white border border-slate-200 p-5">
                <h2 className="font-display text-base font-bold text-slate-900">Hitung Payroll Model Gajian Harian</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Setiap kehadiran tercatat otomatis dikalikan dengan tarif harian masing-masing karyawan (Rp xxxx/hari).
                </p>

                <form onSubmit={handleGeneratePayroll} className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nama Periode</label>
                    <input
                      type="text"
                      required
                      value={payrollForm.period_label}
                      onChange={(e) => setPayrollForm({ ...payrollForm, period_label: e.target.value })}
                      className="w-full min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Dari Tanggal</label>
                    <input
                      type="date"
                      required
                      value={payrollForm.start_date}
                      onChange={(e) => setPayrollForm({ ...payrollForm, start_date: e.target.value })}
                      className="w-full min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Sampai Tanggal</label>
                    <input
                      type="date"
                      required
                      value={payrollForm.end_date}
                      onChange={(e) => setPayrollForm({ ...payrollForm, end_date: e.target.value })}
                      className="w-full min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="min-h-[42px] rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                  >
                    Hitung &amp; Buat Payroll
                  </button>
                </form>
              </section>

              {/* Runs & Slip Details */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <section className="lg:col-span-4 rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
                  <h3 className="font-display text-sm font-bold text-slate-900 px-1">Daftar Periode Payroll</h3>
                  {payrollRuns.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500">Belum ada periode payroll dibuat.</p>
                  ) : (
                    <div className="space-y-2">
                      {payrollRuns.map((run) => {
                        const selected = activeRun?.id === run.id;
                        return (
                          <button
                            key={run.id}
                            type="button"
                            onClick={() => setSelectedRunId(run.id)}
                            className={`w-full text-left rounded-xl border p-3.5 transition-colors ${
                              selected
                                ? 'border-emerald-600 bg-emerald-50/60'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-900 truncate">{run.period_label}</span>
                              <span
                                className={`text-xs font-semibold shrink-0 ${
                                  run.status === 'Dibayar' ? 'text-emerald-700' : 'text-amber-700'
                                }`}
                              >
                                {run.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
                              {formatDateDMY(run.start_date)} – {formatDateDMY(run.end_date)}
                            </p>
                            <p className="mt-1.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                              {formatIDR(run.total_amount)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="lg:col-span-8 rounded-2xl bg-white border border-slate-200 overflow-hidden">
                  {activeRun ? (
                    <>
                      <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <h3 className="font-display text-base font-bold text-slate-900">{activeRun.period_label}</h3>
                          <p className="text-xs font-mono text-slate-500 tabular-nums">
                            {formatDateDMY(activeRun.start_date)} – {formatDateDMY(activeRun.end_date)} · Total{' '}
                            {formatIDR(activeRun.total_amount)}
                          </p>
                        </div>
                        {activeRun.status === 'Draft' ? (
                          <button
                            type="button"
                            onClick={() => handleFinalizeRun(activeRun.id)}
                            className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            <span>Finalisasi &amp; Tandai Dibayar</span>
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-700 font-mono tabular-nums">
                            Dibayar pada {formatDateDMY(activeRun.paid_at)}
                          </span>
                        )}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                              <th className="py-3 px-4">Karyawan</th>
                              <th className="py-3 px-3 text-right">Masuk</th>
                              <th className="py-3 px-3 text-right">Tarif/Hari</th>
                              <th className="py-3 px-3 text-right">Tunjangan / Pot.</th>
                              <th className="py-3 px-3 text-right">Total Bersih</th>
                              <th className="py-3 px-4 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm">
                            {(activeRun.items ?? []).map((item) => (
                              <tr key={item.id} className="hover:bg-slate-50/60">
                                <td className="py-3 px-4">
                                  <p className="font-medium text-slate-900">{item.employee_name}</p>
                                  <p className="text-xs font-mono text-slate-500">
                                    {item.employee_nik} · {item.bank_name} {item.bank_account}
                                  </p>
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-xs text-slate-800 tabular-nums">
                                  {item.days_worked} hari
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                                  {formatIDR(item.daily_rate)}
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-xs text-slate-600 tabular-nums">
                                  +{formatIDR(item.allowance)} / -{formatIDR(item.deduction)}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                                  {formatIDR(item.net_pay)}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {item.status === 'Draft' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingPayrollItem(item);
                                        setItemAdj({ allowance: item.allowance, deduction: item.deduction });
                                      }}
                                      className="text-xs font-semibold text-slate-700 hover:text-emerald-700"
                                    >
                                      Ubah
                                    </button>
                                  ) : (
                                    <span className="text-xs text-slate-400">Final</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="p-10 text-center text-xs text-slate-500">
                      Pilih atau buat periode payroll baru di atas untuk melihat rincian gaji harian karyawan.
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: Create / Edit Employee */}
      {empModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                {editingEmp ? 'Edit Data Karyawan' : 'Tambah Karyawan Baru'}
              </h3>
              <button type="button" onClick={() => setEmpModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEmployee} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">NIK Karyawan</label>
                  <input
                    type="text"
                    required
                    value={empForm.nik}
                    onChange={(e) => setEmpForm({ ...empForm, nik: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={empForm.full_name}
                    onChange={(e) => setEmpForm({ ...empForm, full_name: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email Karyawan (ESS)</label>
                  <input
                    type="email"
                    required
                    value={empForm.email}
                    onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">No. Telepon</label>
                  <input
                    type="text"
                    value={empForm.phone}
                    onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jabatan</label>
                  <select
                    value={empForm.position_id}
                    onChange={(e) => {
                      const posId = Number(e.target.value);
                      const pos = positions.find((p) => p.id === posId);
                      setEmpForm({
                        ...empForm,
                        position_id: posId,
                        daily_rate: pos ? pos.default_daily_rate : empForm.daily_rate,
                      });
                    }}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.department})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tarif Gaji Harian (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={empForm.daily_rate}
                    onChange={(e) => setEmpForm({ ...empForm, daily_rate: Number(e.target.value) })}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Bergabung</label>
                  <input
                    type="date"
                    required
                    value={empForm.join_date}
                    onChange={(e) => setEmpForm({ ...empForm, join_date: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kuota Cuti Tahunan (Hari)</label>
                  <input
                    type="number"
                    min={0}
                    value={empForm.leave_quota}
                    onChange={(e) => setEmpForm({ ...empForm, leave_quota: Number(e.target.value) })}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nama Bank</label>
                  <input
                    type="text"
                    value={empForm.bank_name}
                    onChange={(e) => setEmpForm({ ...empForm, bank_name: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">No. Rekening</label>
                  <input
                    type="text"
                    value={empForm.bank_account}
                    onChange={(e) => setEmpForm({ ...empForm, bank_account: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              {!editingEmp && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Pengaturan Login Mobile PWA (ESS)</p>
                      <p className="text-[11px] text-slate-500">Tetapkan password awal agar karyawan bisa langsung login ESS.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={empForm.ess_enabled}
                      onChange={(e) => setEmpForm({ ...empForm, ess_enabled: e.target.checked })}
                      className="h-4 w-4 accent-emerald-600"
                    />
                  </div>
                  {empForm.ess_enabled && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Password Login ESS (Min. 6 karakter)</label>
                      <input
                        type="text"
                        required
                        minLength={6}
                        value={empForm.ess_password}
                        onChange={(e) => setEmpForm({ ...empForm, ess_password: e.target.value })}
                        placeholder="Masukkan password awal karyawan"
                        className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEmpModalOpen(false)}
                  className="min-h-[42px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Simpan Karyawan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Atur Login ESS Karyawan (Email & Password) */}
      {credEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">Pengaturan Login ESS Karyawan</h3>
                <p className="text-xs text-slate-500">
                  {credEmp.full_name} · {credEmp.nik}
                </p>
              </div>
              <button type="button" onClick={() => setCredEmp(null)} className="p-1.5 text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCredentials} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Email Login Karyawan (ESS)</label>
                <input
                  type="email"
                  required
                  value={credForm.email}
                  onChange={(e) => setCredForm({ ...credForm, email: e.target.value })}
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm focus:border-emerald-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {credEmp.has_password ? 'Password Baru (Kosongkan jika tidak diubah)' : 'Buat Password Awal ESS (Min. 6 karakter)'}
                </label>
                <div className="relative">
                  <input
                    type={showCredPass ? 'text' : 'password'}
                    required={!credEmp.has_password && credForm.ess_enabled}
                    minLength={credForm.password ? 6 : undefined}
                    value={credForm.password}
                    onChange={(e) => setCredForm({ ...credForm, password: e.target.value })}
                    placeholder="Minimal 6 karakter"
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-11 py-2 text-sm focus:border-emerald-600 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredPass((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700"
                  >
                    {showCredPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 cursor-pointer">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Aktifkan Akses Login PWA</p>
                  <p className="text-xs text-slate-500">Izinkan karyawan masuk ke Mobile App ESS.</p>
                </div>
                <input
                  type="checkbox"
                  checked={credForm.ess_enabled}
                  onChange={(e) => setCredForm({ ...credForm, ess_enabled: e.target.checked })}
                  className="h-4 w-4 accent-emerald-600"
                />
              </label>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCredEmp(null)}
                  className="min-h-[42px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Simpan Kredensial ESS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create / Edit Position */}
      {posModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                {editingPos ? 'Edit Jabatan' : 'Tambah Jabatan Baru'}
              </h3>
              <button type="button" onClick={() => setPosModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSavePosition} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Jabatan</label>
                <input
                  type="text"
                  required
                  value={posForm.title}
                  onChange={(e) => setPosForm({ ...posForm, title: e.target.value })}
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Departemen</label>
                <input
                  type="text"
                  required
                  value={posForm.department}
                  onChange={(e) => setPosForm({ ...posForm, department: e.target.value })}
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tarif Gaji Harian Default (Rp)</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={posForm.default_daily_rate}
                  onChange={(e) => setPosForm({ ...posForm, default_daily_rate: Number(e.target.value) })}
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Deskripsi</label>
                <textarea
                  rows={2}
                  value={posForm.description}
                  onChange={(e) => setPosForm({ ...posForm, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPosModalOpen(false)}
                  className="min-h-[42px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Simpan Jabatan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Selfie Evidence Inspector */}
      {inspectAtt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Bukti Selfie Presensi — {inspectAtt.employee_name}
                </h3>
                <p className="text-xs font-mono text-slate-500 tabular-nums">
                  {formatDateDMY(inspectAtt.work_date)} · {inspectAtt.employee_nik}
                </p>
              </div>
              <button type="button" onClick={() => setInspectAtt(null)} className="p-1.5 text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                <div className="px-3.5 py-2 border-b border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Selfie Clock-In</span>
                  <span className="font-mono text-slate-500 tabular-nums">{formatTimeHM(inspectAtt.clock_in_at)}</span>
                </div>
                {inspectAtt.clock_in_photo ? (
                  <img src={inspectAtt.clock_in_photo} alt="Selfie Clock-In" className="w-full aspect-[4/3] object-cover" />
                ) : (
                  <div className="aspect-[4/3] flex items-center justify-center text-xs text-slate-400">Tidak ada foto</div>
                )}
                {inspectAtt.clock_in_note && (
                  <p className="p-2.5 text-xs text-slate-600 border-t border-slate-200">{inspectAtt.clock_in_note}</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                <div className="px-3.5 py-2 border-b border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Selfie Clock-Out</span>
                  <span className="font-mono text-slate-500 tabular-nums">
                    {inspectAtt.clock_out_at ? formatTimeHM(inspectAtt.clock_out_at) : '--:--'}
                  </span>
                </div>
                {inspectAtt.clock_out_photo ? (
                  <img src={inspectAtt.clock_out_photo} alt="Selfie Clock-Out" className="w-full aspect-[4/3] object-cover" />
                ) : (
                  <div className="aspect-[4/3] flex items-center justify-center text-xs text-slate-400">Belum Clock-Out</div>
                )}
                {inspectAtt.clock_out_note && (
                  <p className="p-2.5 text-xs text-slate-600 border-t border-slate-200">{inspectAtt.clock_out_note}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Leave Review Confirmation */}
      {reviewingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                {reviewingLeave.decision === 'Disetujui' ? 'Setujui Pengajuan Cuti' : 'Tolak Pengajuan Cuti'}
              </h3>
              <button type="button" onClick={() => setReviewingLeave(null)} className="p-1.5 text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleLeaveDecision} className="p-6 space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1">
                <p className="font-semibold text-slate-900">{reviewingLeave.leave.employee_name}</p>
                <p className="font-mono text-slate-600 tabular-nums">
                  {reviewingLeave.leave.leave_type} · {formatDateDMY(reviewingLeave.leave.start_date)} –{' '}
                  {formatDateDMY(reviewingLeave.leave.end_date)} ({reviewingLeave.leave.total_days} hari)
                </p>
                <p className="text-slate-600">{reviewingLeave.leave.reason}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan HR (Opsional)</label>
                <textarea
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Tambahkan catatan keputusan..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewingLeave(null)}
                  className="min-h-[40px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={`min-h-[40px] rounded-xl px-5 py-2 text-sm font-semibold text-white ${
                    reviewingLeave.decision === 'Disetujui'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  Konfirmasi {reviewingLeave.decision}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Payroll Item Allowance / Deduction */}
      {editingPayrollItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">Sesuaikan Slip Gaji</h3>
                <p className="text-xs text-slate-500">{editingPayrollItem.employee_name}</p>
              </div>
              <button type="button" onClick={() => setEditingPayrollItem(null)} className="p-1 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSavePayrollItem} className="p-5 space-y-4">
              <div className="text-xs text-slate-600 flex justify-between">
                <span>Gaji Pokok ({editingPayrollItem.days_worked} hari)</span>
                <span className="font-mono font-semibold tabular-nums">{formatIDR(editingPayrollItem.base_pay)}</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tunjangan / Bonus (Rp)</label>
                <input
                  type="number"
                  min={0}
                  value={itemAdj.allowance}
                  onChange={(e) => setItemAdj({ ...itemAdj, allowance: Number(e.target.value) })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Potongan (Rp)</label>
                <input
                  type="number"
                  min={0}
                  value={itemAdj.deduction}
                  onChange={(e) => setItemAdj({ ...itemAdj, deduction: Number(e.target.value) })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPayrollItem(null)}
                  className="min-h-[40px] rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Simpan Slip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

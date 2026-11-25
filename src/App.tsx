/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, sendEmailVerification, signOut, type User } from 'firebase/auth';
import { MailCheck, RefreshCw, RotateCcw } from 'lucide-react';
import { auth } from './firebase';
import { AuthGate, type PortalPreference } from './components/AuthGate';
import {
  BackofficeEnterprise,
  type HrmsWorkspaceData,
} from './components/backoffice/BackofficeEnterprise';
import { EmployeeFirebasePortal } from './components/EmployeeFirebasePortal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { demoStore, type DemoPersona } from './services/demoSessionStore';
import {
  subscribeHrmsWorkspace,
  syncAuthenticatedUserProfile,
} from './services/hrmsFirestore';
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
  PayslipRecord,
  PerformanceReviewRecord,
  PositionRecord,
  ShiftRecord,
  SystemSettingsRecord,
  UserAccountRecord,
} from './types/hrms';

const INITIAL_WORKSPACE: HrmsWorkspaceData = {
  users: [],
  employees: [],
  departments: [],
  positions: [],
  shifts: [],
  attendance: [],
  leaves: [],
  leaveBalances: [],
  overtime: [],
  payrollRuns: [],
  payslips: [],
  performance: [],
  announcements: [],
  auditLogs: [],
  hasPendingWrites: false,
};

function AppContent() {
  const [authReady, setAuthReady] = useState(false);
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccountRecord | null>(null);
  const [linkedEmployee, setLinkedEmployee] = useState<EmployeeRecord | null>(null);
  const [demoPersona, setDemoPersona] = useState<DemoPersona | null>(() => {
    const active = demoStore.getActivePersona();
    return active;
  });
  const [portalPreference, setPortalPreference] = useState<PortalPreference>(() => {
    const active = demoStore.getActivePersona();
    return active && active.portal === 'backoffice' ? 'employee' : active ? active.portal : 'employee';
  });
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<HrmsWorkspaceData>(INITIAL_WORKSPACE);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      setAuthError(null);

      if (!user) {
        setUserAccount(null);
        setLinkedEmployee(null);
        if (!demoStore.getActivePersona()) {
          setWorkspace(INITIAL_WORKSPACE);
          setNotifications([]);
        }
        setAuthReady(true);
        return;
      }

      demoStore.logoutDemo();
      setDemoPersona(null);

      if (!user.emailVerified) {
        setUserAccount(null);
        setAuthReady(true);
        return;
      }

      setLoadingProfile(true);
      try {
        const res = await syncAuthenticatedUserProfile();
        setUserAccount(res.userAccount);
        setLinkedEmployee(res.employee);
        if (res.userAccount.role === 'Employee') {
          setPortalPreference('employee');
        }
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : 'Gagal memuat profil pengguna dari Firestore.'
        );
      } finally {
        setLoadingProfile(false);
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const isLiveAuth = Boolean(authReady && fbUser && fbUser.emailVerified && userAccount);
    const isDemoAuth = Boolean(!fbUser && demoPersona);
    if (!isLiveAuth && !isDemoAuth) {
      return;
    }

    const activeRole = (isLiveAuth ? userAccount!.role : demoPersona!.userAccount.role);
    const activeUid = (isLiveAuth ? fbUser!.uid : demoPersona!.userAccount.uid);

    const unsubWorkspace = subscribeHrmsWorkspace(activeRole, activeUid, {
      onCompanies: (items: CompanyRecord[], pending: boolean) =>
        setWorkspace((prev) => ({ ...prev, company: items[0], hasPendingWrites: pending })),
      onSettings: (items: SystemSettingsRecord[]) =>
        setWorkspace((prev) => ({ ...prev, settings: items[0] })),
      onUsers: (items: UserAccountRecord[]) =>
        setWorkspace((prev) => ({ ...prev, users: items })),
      onEmployees: (items: EmployeeRecord[], pending: boolean) =>
        setWorkspace((prev) => ({ ...prev, employees: items, hasPendingWrites: pending })),
      onDepartments: (items: DepartmentRecord[]) =>
        setWorkspace((prev) => ({ ...prev, departments: items })),
      onPositions: (items: PositionRecord[]) =>
        setWorkspace((prev) => ({ ...prev, positions: items })),
      onShifts: (items: ShiftRecord[]) =>
        setWorkspace((prev) => ({ ...prev, shifts: items })),
      onAttendance: (items: AttendanceRecord[], pending: boolean) =>
        setWorkspace((prev) => ({ ...prev, attendance: items, hasPendingWrites: pending })),
      onLeaves: (items: LeaveRequestRecord[]) =>
        setWorkspace((prev) => ({ ...prev, leaves: items })),
      onLeaveBalances: (items: LeaveBalanceRecord[]) =>
        setWorkspace((prev) => ({ ...prev, leaveBalances: items })),
      onOvertime: (items: OvertimeRequestRecord[]) =>
        setWorkspace((prev) => ({ ...prev, overtime: items })),
      onPayrollRuns: (items: PayrollRunRecord[]) =>
        setWorkspace((prev) => ({ ...prev, payrollRuns: items })),
      onPayslips: (items: PayslipRecord[]) =>
        setWorkspace((prev) => ({ ...prev, payslips: items })),
      onPerformance: (items: PerformanceReviewRecord[]) =>
        setWorkspace((prev) => ({ ...prev, performance: items })),
      onAnnouncements: (items: AnnouncementRecord[]) =>
        setWorkspace((prev) => ({ ...prev, announcements: items })),
      onNotifications: (items: NotificationRecord[]) => setNotifications(items),
      onAuditLogs: (items: AuditLogRecord[]) =>
        setWorkspace((prev) => ({ ...prev, auditLogs: items })),
      onSyncState: (meta) =>
        setWorkspace((prev) => ({
          ...prev,
          hasPendingWrites: meta.hasPendingWrites,
          lastSyncedAt: meta.lastSyncedAt,
        })),
    });

    return () => {
      unsubWorkspace();
    };
  }, [authReady, fbUser, userAccount, demoPersona]);

  const handleDemoLogin = (persona: DemoPersona) => {
    const active = demoStore.loginDemo(persona.id);
    setDemoPersona(active);
    setPortalPreference(
      portalPreference === 'backoffice' && active.portal === 'backoffice' ? 'backoffice' : 'employee'
    );
    setAuthError(null);
  };

  const handleLogout = async () => {
    demoStore.logoutDemo();
    setDemoPersona(null);
    setWorkspace(INITIAL_WORKSPACE);
    setNotifications([]);
    if (auth.currentUser) {
      await signOut(auth);
    }
  };

  if (!authReady || loadingProfile) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 px-6 py-5 text-sm text-slate-700 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin text-emerald-700" />
          <span>Menghubungkan ke database terpusat KerjaPay HRM...</span>
        </div>
      </div>
    );
  }

  if (fbUser && !fbUser.emailVerified) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <MailCheck className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Verifikasi Alamat Email Diperlukan</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Sesuai kebijakan keamanan Firestore, klik tautan verifikasi yang dikirim ke{' '}
            <strong>{fbUser.email}</strong> sebelum mengakses data perusahaan.
          </p>
          {verifyNotice && <p className="text-xs text-emerald-700">{verifyNotice}</p>}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={async () => {
                await fbUser.reload();
                if (auth.currentUser?.emailVerified) {
                  window.location.reload();
                } else {
                  setVerifyNotice('Email belum terverifikasi. Periksa kotak masuk atau folder spam Anda.');
                }
              }}
              className="w-full min-h-[42px] rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Saya Sudah Verifikasi (Lanjutkan)
            </button>
            <button
              type="button"
              onClick={async () => {
                await sendEmailVerification(fbUser);
                setVerifyNotice('Email verifikasi baru telah dikirim.');
              }}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 text-xs font-medium text-slate-700"
            >
              Kirim Ulang Tautan Verifikasi
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full min-h-[38px] text-xs font-medium text-rose-700"
            >
              Keluar &amp; Gunakan Akun Lain
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeAccount = userAccount || (!fbUser ? demoPersona?.userAccount || null : null);
  const activeUid = fbUser?.uid || demoPersona?.userAccount.uid || '';
  const isDemoMode = !fbUser && Boolean(demoPersona);

  if (!activeAccount || !activeUid) {
    return (
      <AuthGate
        portalPreference={portalPreference}
        onPortalPreferenceChange={setPortalPreference}
        onDemoLogin={handleDemoLogin}
        authError={authError}
      />
    );
  }

  if (activeAccount.status !== 'active') {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h1 className="text-lg font-bold text-slate-900">Akun Dinonaktifkan</h1>
          <p className="text-sm text-slate-600">
            Akun Anda ({activeAccount.email}) sedang berstatus tidak aktif. Hubungi Super Admin untuk
            mengaktifkan akses kembali.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-[42px] rounded-xl bg-slate-900 text-xs font-semibold text-white"
          >
            Keluar
          </button>
        </div>
      </div>
    );
  }

  const canOpenBackoffice =
    activeAccount.role === 'Super Admin' ||
    activeAccount.role === 'HR Admin' ||
    activeAccount.role === 'Management' ||
    activeAccount.role === 'Supervisor';

  const resolvedEmployee =
    workspace.employees.find(
      (e) => e.uid === activeUid || e.employeeId === activeAccount.employeeId
    ) || linkedEmployee;

  const demoBanner = isDemoMode ? (
    <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2 text-xs text-amber-950">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <span className="font-medium">
          Mode Demo Pratinjau · {activeAccount.displayName} ({activeAccount.role}) · Data tersimpan lokal di browser
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => demoStore.resetDemoData()}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Data Demo</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
          >
            Keluar ke Login Live
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (canOpenBackoffice && portalPreference === 'backoffice') {
    return (
      <>
        {demoBanner}
        <BackofficeEnterprise
          currentUser={activeAccount}
          data={workspace}
          onSwitchToEmployeePortal={() => setPortalPreference('employee')}
          onLogout={handleLogout}
        />
      </>
    );
  }

  const effectiveEmpId =
    resolvedEmployee?.employeeId ||
    activeAccount.employeeId ||
    `emp_${activeUid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 16)}`;

  return (
    <>
      {demoBanner}
      <EmployeeFirebasePortal
        currentUser={activeAccount}
        employee={resolvedEmployee}
        company={workspace.company}
        settings={workspace.settings}
        departments={workspace.departments}
        positions={workspace.positions}
        shifts={workspace.shifts}
        attendance={workspace.attendance.filter((a) => a.uid === activeUid || a.employeeId === effectiveEmpId)}
        leaves={workspace.leaves.filter((l) => l.uid === activeUid || l.employeeId === effectiveEmpId)}
        leaveBalances={workspace.leaveBalances.filter((b) => b.uid === activeUid || b.employeeId === effectiveEmpId)}
        overtime={workspace.overtime.filter((o) => o.uid === activeUid || o.employeeId === effectiveEmpId)}
        payslips={workspace.payslips.filter((p) => p.uid === activeUid || p.employeeId === effectiveEmpId)}
        performance={workspace.performance.filter((r) => r.uid === activeUid || r.employeeId === effectiveEmpId)}
        announcements={workspace.announcements}
        notifications={notifications.filter((n) => n.recipientUid === activeUid)}
        hasPendingWrites={workspace.hasPendingWrites}
        lastSyncedAt={workspace.lastSyncedAt}
        isDemoMode={isDemoMode}
        canOpenBackoffice={canOpenBackoffice}
        onSwitchToBackoffice={() => setPortalPreference('backoffice')}
        onLogout={handleLogout}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <OfflineIndicator />
      <AppContent />
    </ErrorBoundary>
  );
}

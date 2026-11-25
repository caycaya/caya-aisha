import React, { useEffect, useMemo, useState } from 'react';
import { sendPasswordResetEmail, updatePassword } from 'firebase/auth';
import {
  Bell,
  Building2,
  CalendarClock,
  Camera,
  Clock,
  ExternalLink,
  FileText,
  Home,
  LogOut,
  MapPin,
  Maximize2,
  Receipt,
  Smartphone,
  User,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  acknowledgePerformanceReview,
  markNotificationRead,
  requestAttendanceCorrection,
  submitClockIn,
  submitClockOut,
  submitLeaveRequest,
  submitOvertimeRequest,
  toJsDate,
} from '../services/hrmsFirestore';
import type {
  AnnouncementRecord,
  AttendanceRecord,
  CompanyRecord,
  DepartmentRecord,
  EmployeeRecord,
  LeaveBalanceRecord,
  LeaveRequestRecord,
  NotificationRecord,
  OvertimeRequestRecord,
  PayslipRecord,
  PerformanceReviewRecord,
  PositionRecord,
  ShiftRecord,
  SystemSettingsRecord,
  UserAccountRecord,
} from '../types/hrms';
import { formatIDR } from '../utils/currency';
import { diffDaysInclusive, formatDateDMY, formatTimeHM, getTodayISO } from '../utils/dateFormat';
import { AttendancePhotoModal } from './AttendancePhotoModal';
import { PayslipPrintableModal } from './PayslipPrintableModal';
import { PhoneFrameShell } from './PhoneFrameShell';
import { SelfieCameraModal } from './SelfieCameraModal';

type EssTab = 'beranda' | 'presensi' | 'cuti' | 'laporan' | 'profil';

interface EmployeeFirebasePortalProps {
  currentUser: UserAccountRecord;
  employee: EmployeeRecord | null;
  company?: CompanyRecord;
  settings?: SystemSettingsRecord;
  departments: DepartmentRecord[];
  positions: PositionRecord[];
  shifts: ShiftRecord[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequestRecord[];
  leaveBalances: LeaveBalanceRecord[];
  overtime: OvertimeRequestRecord[];
  payslips: PayslipRecord[];
  performance: PerformanceReviewRecord[];
  announcements: AnnouncementRecord[];
  notifications: NotificationRecord[];
  hasPendingWrites: boolean;
  lastSyncedAt?: number;
  isDemoMode?: boolean;
  canOpenBackoffice: boolean;
  onSwitchToBackoffice: () => void;
  onLogout: () => void;
}

function formatElapsedHms(startDate: Date | null, nowMs: number): string {
  if (!startDate) return '00:00:00';
  const diffSec = Math.max(0, Math.floor((nowMs - startDate.getTime()) / 1000));
  const hrs = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const EmployeeFirebasePortal: React.FC<EmployeeFirebasePortalProps> = ({
  currentUser,
  employee,
  company,
  settings,
  departments,
  positions,
  shifts,
  attendance,
  leaves,
  leaveBalances,
  overtime,
  payslips,
  performance,
  announcements,
  notifications,
  hasPendingWrites,
  lastSyncedAt,
  isDemoMode = false,
  canOpenBackoffice,
  onSwitchToBackoffice,
  onLogout,
}) => {
  const [tab, setTab] = useState<EssTab>('beranda');
  const [frameMode, setFrameMode] = useState<'phone' | 'desktop'>('phone');
  const [cameraMode, setCameraMode] = useState<'clock-in' | 'clock-out' | null>(null);
  const [submittingClock, setSubmittingClock] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string>('');
  const [cachedCoords, setCachedCoords] = useState<{ lat?: number; lng?: number } | null>(null);
  const [justRecordedId, setJustRecordedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [viewingPayslip, setViewingPayslip] = useState<PayslipRecord | null>(null);
  const [inspectingAttendance, setInspectingAttendance] = useState<AttendanceRecord | null>(null);

  // Real-time 1-second clock & active work timer
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const liveTimeLabel = useMemo(
    () => new Date(nowMs).toLocaleTimeString('id-ID', { hour12: false }),
    [nowMs]
  );

  // Leave form
  const [leaveType, setLeaveType] = useState<LeaveRequestRecord['leaveType']>('Annual');
  const [leaveStart, setLeaveStart] = useState(getTodayISO());
  const [leaveEnd, setLeaveEnd] = useState(getTodayISO());
  const [leaveReason, setLeaveReason] = useState('');

  // Overtime form
  const [otDate, setOtDate] = useState(getTodayISO());
  const [otStart, setOtStart] = useState('18:00');
  const [otEnd, setOtEnd] = useState('20:00');
  const [otHours, setOtHours] = useState('2');
  const [otReason, setOtReason] = useState('');

  // Change password state
  const [newPassword, setNewPassword] = useState('');

  const today = getTodayISO();
  const activeEmp: EmployeeRecord = useMemo(
    () =>
      employee || {
        employeeId:
          currentUser.employeeId ||
          `emp_${currentUser.uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 16)}`,
        companyId: currentUser.companyId || company?.companyId || 'comp_nusantara_01',
        uid: currentUser.uid,
        employeeCode: `ESS-${currentUser.uid.slice(0, 6).toUpperCase()}`,
        fullName: currentUser.displayName,
        email: currentUser.email,
        departmentId: currentUser.departmentId || 'dept_ops',
        positionId: 'pos_ops_sup',
        employmentType: 'Full-Time',
        joinDate: today,
        employmentStatus: 'Active',
        baseSalary: 0,
        recordStatus: 'active',
        createdBy: currentUser.uid,
      },
    [employee, currentUser, company, today]
  );

  const myShift = useMemo(
    () => shifts.find((s) => s.shiftId === activeEmp.shiftId) || shifts[0],
    [shifts, activeEmp]
  );

  const todayAttendance = useMemo(
    () =>
      attendance.find((a) => a.employeeId === activeEmp.employeeId && a.workDate === today),
    [attendance, activeEmp, today]
  );

  const myBalance = useMemo(
    () =>
      leaveBalances.find((b) => b.employeeId === activeEmp.employeeId),
    [leaveBalances, activeEmp]
  );

  const unreadNotifs = notifications.filter((n) => !n.isRead);
  const myDept = departments.find((d) => d.departmentId === activeEmp.departmentId);
  const myPos = positions.find((p) => p.positionId === activeEmp.positionId);

  const elapsedActiveWork = useMemo(() => {
    if (!todayAttendance || todayAttendance.clockOutAt) return null;
    return formatElapsedHms(toJsDate(todayAttendance.clockInAt), nowMs);
  }, [todayAttendance, nowMs]);

  const acquireCoordinates = (timeoutMs = 1200): Promise<{ lat?: number; lng?: number }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGpsStatus('GPS browser tidak tersedia');
        resolve({});
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCachedCoords(coords);
          setGpsStatus(`GPS ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
          resolve(coords);
        },
        () => {
          setGpsStatus('Izin lokasi tidak aktif (dicatat tanpa koordinat GPS)');
          resolve({});
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 }
      );
    });

  useEffect(() => {
    if (cameraMode) {
      void acquireCoordinates(1800);
    }
  }, [cameraMode]);

  const handleClockConfirm = async (photoDataUrl: string, note: string) => {
    if (!cameraMode) return;
    setSubmittingClock(true);
    setFeedback(null);
    try {
      const coords = cachedCoords ?? (await acquireCoordinates(1200));
      const targetId = `${activeEmp.employeeId}_${today}`;
      if (cameraMode === 'clock-in') {
        const res = await submitClockIn({
          employee: activeEmp,
          shift: myShift,
          settings,
          lat: coords.lat,
          lng: coords.lng,
          selfieDataUrl: photoDataUrl,
          sourceDevice: note ? `Mobile ESS (${note.slice(0, 24)})` : 'Mobile ESS Foto',
        });
        setJustRecordedId(res.attendanceId);
        setFeedback({
          type: 'ok',
          text: `Clock-In foto tercatat (${res.status}${res.lateMinutes ? `, terlambat ${res.lateMinutes} menit` : ''}) dan langsung tampil di Rekap Absensi.`,
        });
      } else {
        const res = await submitClockOut({
          employee: activeEmp,
          lat: coords.lat,
          lng: coords.lng,
          selfieDataUrl: photoDataUrl,
        });
        setJustRecordedId(targetId);
        setFeedback({
          type: 'ok',
          text: `Clock-Out foto tercatat (durasi ${Math.floor(res.workMinutes / 60)} jam ${
            res.workMinutes % 60
          } mnt) dan langsung diperbarui di Rekap Absensi.`,
        });
      }
      setCameraMode(null);
      setTab('presensi');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan presensi.';
      setFeedback({ type: 'err', text: msg });
      throw err;
    } finally {
      setSubmittingClock(false);
    }
  };

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEmp) return;
    const totalDays = Math.max(1, diffDaysInclusive(leaveStart, leaveEnd));
    await submitLeaveRequest({
      employee: activeEmp,
      leaveType,
      startDate: leaveStart,
      endDate: leaveEnd,
      totalDays,
      reason: leaveReason,
    });
    setLeaveReason('');
    setFeedback({ type: 'ok', text: `Pengajuan cuti (${totalDays} hari) berhasil dikirim.` });
  };

  const handleOvertimeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEmp) return;
    await submitOvertimeRequest({
      employee: activeEmp,
      overtimeDate: otDate,
      startTime: otStart,
      endTime: otEnd,
      durationHours: Number(otHours) || 1,
      reason: otReason,
    });
    setOtReason('');
    setFeedback({ type: 'ok', text: 'Pengajuan lembur berhasil dikirim ke supervisor.' });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      setFeedback({
        type: 'err',
        text: 'Mode Demo: Pengubahan kata sandi hanya tersedia saat masuk dengan akun Firebase Authentication aktif.',
      });
      return;
    }
    try {
      await updatePassword(auth.currentUser, newPassword);
      setNewPassword('');
      setFeedback({ type: 'ok', text: 'Kata sandi berhasil diperbarui.' });
    } catch {
      if (auth.currentUser.email) {
        await sendPasswordResetEmail(auth, auth.currentUser.email);
        setFeedback({
          type: 'ok',
          text: 'Demi keamanan sesi, tautan ganti kata sandi telah dikirim ke email Anda.',
        });
      }
    }
  };

  const isPhoneLayout = frameMode === 'phone';
  const syncLabel = hasPendingWrites
    ? 'Menyinkronkan...'
    : lastSyncedAt
    ? `Live · ${new Date(lastSyncedAt).toLocaleTimeString('id-ID', { hour12: false })}`
    : 'Terhubung Real-Time';

  const appSurface = (
    <div
      className={
        isPhoneLayout
          ? 'flex flex-col flex-1 min-h-0 bg-[#F4F6F9] lg:h-full'
          : 'min-h-screen bg-[#F4F6F9] pb-24 lg:pb-10'
      }
    >
      <header className="shrink-0 sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={activeEmp?.photoUrl || '/src/assets/images/avatar_emp_1_1795590992124.jpg'}
              alt={currentUser.displayName}
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-full object-cover border border-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {activeEmp?.fullName || currentUser.displayName}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {myPos?.title || currentUser.role} · {company?.code || 'KerjaPay ESS'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isPhoneLayout && (
              <button
                type="button"
                onClick={() => setFrameMode('phone')}
                className="hidden lg:inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>Phone Frame</span>
              </button>
            )}
            {canOpenBackoffice && (
              <button
                type="button"
                onClick={onSwitchToBackoffice}
                className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                title="Kembali ke Backoffice"
              >
                <Building2 className="h-3.5 w-3.5" />
                {!isPhoneLayout && <span className="hidden sm:inline">Backoffice</span>}
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              aria-label="Keluar"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main
        className={
          isPhoneLayout
            ? 'flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-6 space-y-4 lg:pb-6 pb-24'
            : 'max-w-5xl mx-auto px-4 sm:px-6 pt-5 space-y-5'
        }
      >
        {feedback && (
          <div
            className={`rounded-2xl border px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 ${
              feedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <span>{feedback.text}</span>
            <button type="button" onClick={() => setFeedback(null)} className="font-semibold shrink-0">
              Tutup
            </button>
          </div>
        )}

        {!employee && (
          <div className="bg-white rounded-2xl border border-amber-200 p-3.5 text-xs text-amber-900">
            Akun ({currentUser.email}) menggunakan profil ESS aktif sementara. Anda tetap dapat langsung melakukan presensi foto Clock-In / Clock-Out.
          </div>
        )}

        {tab === 'beranda' && (
          <div className={isPhoneLayout ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-12 gap-5'}>
            <div className={isPhoneLayout ? 'space-y-4' : 'lg:col-span-7 space-y-5'}>
              <div className="rounded-3xl bg-slate-950 text-white p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-400">
                      {formatDateDMY(today)} · {myShift ? `${myShift.startTime}–${myShift.endTime}` : 'Shift Standar'}
                    </p>
                    <h2 className="text-lg font-bold mt-0.5">Presensi Foto Mobile</h2>
                    <p className="text-2xl font-bold font-mono tabular-nums text-emerald-300 mt-1">
                      {liveTimeLabel} <span className="text-xs font-normal text-slate-400">WIB</span>
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums text-xs text-emerald-300 shrink-0">
                    <p>
                      {todayAttendance
                        ? todayAttendance.clockOutAt
                          ? 'Selesai Kerja'
                          : 'Sedang Bekerja'
                        : 'Belum Presensi'}
                    </p>
                    {elapsedActiveWork && (
                      <p className="text-[11px] text-slate-300 mt-1">{elapsedActiveWork}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-900 rounded-2xl p-3.5">
                  <div>
                    <p className="text-slate-400">Jam Masuk</p>
                    <p className="text-base font-bold font-mono tabular-nums mt-0.5">
                      {formatTimeHM(toJsDate(todayAttendance?.clockInAt))}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Jam Pulang</p>
                    <p className="text-base font-bold font-mono tabular-nums mt-0.5">
                      {formatTimeHM(toJsDate(todayAttendance?.clockOutAt))}
                    </p>
                  </div>
                </div>

                {(todayAttendance?.clockInSelfie || todayAttendance?.clockOutSelfie) && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {todayAttendance.clockInSelfie && (
                      <button
                        type="button"
                        onClick={() => setInspectingAttendance(todayAttendance)}
                        className="flex items-center gap-2 rounded-xl bg-slate-900 p-2 text-left hover:bg-slate-800 transition-colors"
                      >
                        <img
                          src={todayAttendance.clockInSelfie}
                          alt="Foto Clock-In"
                          referrerPolicy="no-referrer"
                          className="h-10 w-10 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-white">Foto Masuk</p>
                          <p className="text-[10px] text-emerald-300">Ketuk perbesar</p>
                        </div>
                      </button>
                    )}
                    {todayAttendance.clockOutSelfie && (
                      <button
                        type="button"
                        onClick={() => setInspectingAttendance(todayAttendance)}
                        className="flex items-center gap-2 rounded-xl bg-slate-900 p-2 text-left hover:bg-slate-800 transition-colors"
                      >
                        <img
                          src={todayAttendance.clockOutSelfie}
                          alt="Foto Clock-Out"
                          referrerPolicy="no-referrer"
                          className="h-10 w-10 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-white">Foto Pulang</p>
                          <p className="text-[10px] text-emerald-300">Ketuk perbesar</p>
                        </div>
                      </button>
                    )}
                  </div>
                )}

                {gpsStatus && (
                  <p className="text-xs text-slate-300 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">{gpsStatus}</span>
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={!activeEmp || Boolean(todayAttendance)}
                    onClick={() => setCameraMode('clock-in')}
                    className="min-h-[46px] inline-flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Camera className="h-4 w-4 shrink-0" />
                    <span>Clock In · Foto</span>
                  </button>
                  <button
                    type="button"
                    disabled={!activeEmp || !todayAttendance || Boolean(todayAttendance?.clockOutAt)}
                    onClick={() => setCameraMode('clock-out')}
                    className="min-h-[46px] inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-3 text-xs font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Camera className="h-4 w-4 shrink-0" />
                    <span>Clock Out · Foto</span>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Rekap Absensi Terbaru</h3>
                  <button
                    type="button"
                    onClick={() => setTab('presensi')}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                  >
                    Lihat Semua ({attendance.length})
                  </button>
                </div>
                {attendance.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Belum ada riwayat absensi. Ambil foto Clock-In untuk mencatat kehadiran hari ini.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {attendance.slice(0, 3).map((a) => (
                      <div key={a.attendanceId} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {(a.clockInSelfie || a.clockOutSelfie) && (
                            <button
                              type="button"
                              onClick={() => setInspectingAttendance(a)}
                              className="shrink-0"
                            >
                              <img
                                src={a.clockOutSelfie || a.clockInSelfie}
                                alt={`Foto ${a.workDate}`}
                                referrerPolicy="no-referrer"
                                className="h-10 w-10 rounded-xl object-cover border border-slate-200"
                              />
                            </button>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 font-mono tabular-nums">
                              {formatDateDMY(a.workDate)}
                            </p>
                            <p className="text-slate-500 truncate">
                              Masuk {formatTimeHM(toJsDate(a.clockInAt))} · Pulang {formatTimeHM(toJsDate(a.clockOutAt))}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 font-semibold text-emerald-700">{a.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Pengumuman Terbaru</h3>
                {announcements.slice(0, 3).map((a) => (
                  <div key={a.announcementId} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                    <p className="text-xs text-slate-500">
                      {a.category} · {formatDateDMY(toJsDate(a.publishedAt) || toJsDate(a.createdAt))}
                    </p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{a.title}</p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{a.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={isPhoneLayout ? 'space-y-4' : 'lg:col-span-5 space-y-5'}>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Sisa Cuti Tahunan</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {myBalance?.annualRemaining ?? 12} hari
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Notifikasi Baru</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                    {unreadNotifs.length}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-slate-700" />
                  <h3 className="text-sm font-semibold text-slate-900">Notifikasi Saya</h3>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500">Belum ada notifikasi baru.</p>
                ) : (
                  <div className="space-y-2">
                    {notifications.slice(0, 5).map((n) => (
                      <button
                        key={n.notificationId}
                        type="button"
                        onClick={() => !n.isRead && markNotificationRead(n.notificationId)}
                        className={`w-full text-left rounded-xl border p-3 text-xs transition-colors ${
                          n.isRead ? 'border-slate-100 bg-slate-50 text-slate-600' : 'border-emerald-200 bg-emerald-50/50 text-slate-900'
                        }`}
                      >
                        <p className="font-semibold">{n.title}</p>
                        <p className="mt-0.5">{n.message}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {performance.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Evaluasi Kinerja</h3>
                  {performance.slice(0, 2).map((r) => (
                    <div key={r.reviewId} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-semibold text-slate-900">{r.cycleLabel}</span>
                        <span className="font-mono font-semibold text-emerald-700">KPI {r.kpiScore} · {r.overallRating}</span>
                      </div>
                      <p className="text-slate-600">{r.strengths}</p>
                      {r.status !== 'Acknowledged' && (
                        <button
                          type="button"
                          onClick={() => acknowledgePerformanceReview(r.reviewId)}
                          className="mt-1 px-3 py-1 rounded-lg bg-slate-900 text-white font-medium"
                        >
                          Konfirmasi Terima Evaluasi
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'presensi' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Absensi Foto Hari Ini</p>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {formatDateDMY(today)} · {liveTimeLabel} WIB
                </p>
              </div>
              {!todayAttendance ? (
                <button
                  type="button"
                  onClick={() => setCameraMode('clock-in')}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Foto Clock-In</span>
                </button>
              ) : !todayAttendance.clockOutAt ? (
                <button
                  type="button"
                  onClick={() => setCameraMode('clock-out')}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Foto Clock-Out</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setInspectingAttendance(todayAttendance)}
                  className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                >
                  Lihat Bukti Foto
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="bg-white rounded-2xl border border-slate-200 p-3">
                <p className="text-slate-500">Total Rekap</p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {attendance.length}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-3">
                <p className="text-slate-500">Tepat Waktu</p>
                <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                  {attendance.filter((a) => a.status === 'Present').length}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-3">
                <p className="text-slate-500">Bukti Foto</p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {attendance.filter((a) => Boolean(a.clockInSelfie || a.clockOutSelfie)).length}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-900">Rekap Absensi &amp; Bukti Foto</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tersinkronisasi real-time · Setiap foto Clock-In/Out langsung masuk ke daftar ini.
              </p>
              {attendance.length === 0 ? (
                <p className="text-xs text-slate-500 mt-3">
                  Belum ada catatan absensi. Ketuk Foto Clock-In untuk mulai merekam.
                </p>
              ) : (
                <div className="mt-3 divide-y divide-slate-100">
                  {attendance.map((a) => {
                    const isHighlighted = justRecordedId === a.attendanceId;
                    return (
                      <div
                        key={a.attendanceId}
                        className={`py-3 px-2 -mx-2 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors ${
                          isHighlighted ? 'bg-emerald-50/70 ring-1 ring-emerald-400' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex items-center gap-1.5 shrink-0">
                            {a.clockInSelfie && (
                              <button
                                type="button"
                                onClick={() => setInspectingAttendance(a)}
                                className="relative group"
                                title="Foto Clock-In"
                                aria-label="Buka foto masuk"
                              >
                                <img
                                  src={a.clockInSelfie}
                                  alt={`Foto masuk ${a.workDate}`}
                                  referrerPolicy="no-referrer"
                                  className="h-11 w-11 rounded-xl object-cover border border-slate-200 group-hover:border-emerald-600"
                                />
                              </button>
                            )}
                            {a.clockOutSelfie && (
                              <button
                                type="button"
                                onClick={() => setInspectingAttendance(a)}
                                className="relative group"
                                title="Foto Clock-Out"
                                aria-label="Buka foto pulang"
                              >
                                <img
                                  src={a.clockOutSelfie}
                                  alt={`Foto pulang ${a.workDate}`}
                                  referrerPolicy="no-referrer"
                                  className="h-11 w-11 rounded-xl object-cover border border-emerald-300 group-hover:border-emerald-600"
                                />
                              </button>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 font-mono tabular-nums">
                              {formatDateDMY(a.workDate)}
                              {isHighlighted && (
                                <span className="ml-2 font-sans text-[11px] font-semibold text-emerald-700">
                                  · Baru tercatat
                                </span>
                              )}
                            </p>
                            <p className="text-slate-500 mt-0.5 truncate">
                              Masuk {formatTimeHM(toJsDate(a.clockInAt))} · Pulang {formatTimeHM(toJsDate(a.clockOutAt))} · {a.status}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-slate-500">{a.gpsVerified ? 'GPS Valid' : 'Luar Area'}</span>
                          {a.correctionStatus === 'None' ? (
                            <button
                              type="button"
                              onClick={() =>
                                requestAttendanceCorrection(
                                  a.attendanceId,
                                  'Permohonan koreksi jam presensi oleh karyawan'
                                )
                              }
                              className="px-2 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                            >
                              Ajukan Koreksi
                            </button>
                          ) : (
                            <span className="font-medium text-amber-700">Koreksi: {a.correctionStatus}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'cuti' && (
          <div className={isPhoneLayout ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-5'}>
            <form onSubmit={handleLeaveSubmit} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3.5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Pengajuan Cuti Baru</h2>
                <p className="text-xs text-slate-500">
                  Sisa kuota cuti tahunan: <strong className="font-mono">{myBalance?.annualRemaining ?? 12} hari</strong>
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveRequestRecord['leaveType'])}
                  className="min-h-[42px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
                >
                  <option value="Annual">Annual</option>
                  <option value="Sick">Sick</option>
                  <option value="Personal">Personal</option>
                  <option value="Maternity">Maternity</option>
                  <option value="Unpaid">Unpaid</option>
                </select>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="date"
                    required
                    value={leaveStart}
                    onChange={(e) => setLeaveStart(e.target.value)}
                    className="min-h-[42px] rounded-xl border border-slate-200 px-3 text-xs"
                  />
                  <input
                    type="date"
                    required
                    value={leaveEnd}
                    onChange={(e) => setLeaveEnd(e.target.value)}
                    className="min-h-[42px] rounded-xl border border-slate-200 px-3 text-xs"
                  />
                </div>
              </div>
              <textarea
                required
                rows={2}
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="Alasan pengajuan cuti..."
                className="w-full rounded-xl border border-slate-200 p-3 text-sm"
              />
              <button
                type="submit"
                disabled={!activeEmp}
                className="w-full min-h-[44px] rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Kirim Pengajuan Cuti
              </button>

              <div className="border-t border-slate-100 pt-3 space-y-2">
                <h3 className="text-xs font-semibold text-slate-700">Riwayat Cuti</h3>
                {leaves.map((lv) => (
                  <div key={lv.leaveRequestId} className="rounded-xl border border-slate-100 p-2.5 text-xs flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {lv.leaveType} · {lv.totalDays} hari
                      </p>
                      <p className="text-slate-500 font-mono">
                        {formatDateDMY(lv.startDate)} – {formatDateDMY(lv.endDate)}
                      </p>
                      {lv.rejectionReason && (
                        <p className="text-rose-700 mt-0.5">Alasan tolak: {lv.rejectionReason}</p>
                      )}
                    </div>
                    <span className="font-semibold text-slate-800">{lv.status}</span>
                  </div>
                ))}
              </div>
            </form>

            <form onSubmit={handleOvertimeSubmit} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3.5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Pengajuan Lembur (Overtime)</h2>
                <p className="text-xs text-slate-500">Lembur yang disetujui otomatis dihitung ke payroll.</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="date"
                  required
                  value={otDate}
                  onChange={(e) => setOtDate(e.target.value)}
                  className="min-h-[42px] rounded-xl border border-slate-200 px-3 text-xs"
                />
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  required
                  value={otHours}
                  onChange={(e) => setOtHours(e.target.value)}
                  placeholder="Jam"
                  className="min-h-[42px] rounded-xl border border-slate-200 px-3 text-xs font-mono"
                />
                <input
                  type="time"
                  required
                  value={otStart}
                  onChange={(e) => setOtStart(e.target.value)}
                  className="min-h-[42px] rounded-xl border border-slate-200 px-3 text-xs font-mono"
                />
                <input
                  type="time"
                  required
                  value={otEnd}
                  onChange={(e) => setOtEnd(e.target.value)}
                  className="min-h-[42px] rounded-xl border border-slate-200 px-3 text-xs font-mono"
                />
              </div>
              <textarea
                required
                rows={2}
                value={otReason}
                onChange={(e) => setOtReason(e.target.value)}
                placeholder="Pekerjaan yang diselesaikan saat lembur..."
                className="w-full rounded-xl border border-slate-200 p-3 text-sm"
              />
              <button
                type="submit"
                disabled={!activeEmp}
                className="w-full min-h-[44px] rounded-xl bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Ajukan Lembur
              </button>

              <div className="border-t border-slate-100 pt-3 space-y-2">
                <h3 className="text-xs font-semibold text-slate-700">Riwayat Lembur</h3>
                {overtime.map((ot) => (
                  <div key={ot.overtimeId} className="rounded-xl border border-slate-100 p-2.5 text-xs flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 font-mono">
                        {formatDateDMY(ot.overtimeDate)} · {ot.durationHours} jam
                      </p>
                      <p className="text-slate-500">{ot.reason}</p>
                    </div>
                    <span className="font-semibold text-slate-800">{ot.status}</span>
                  </div>
                ))}
              </div>
            </form>
          </div>
        )}

        {tab === 'laporan' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-emerald-700" />
                <h2 className="text-sm font-semibold text-slate-900">Slip Gaji Elektronik (Payslip)</h2>
              </div>
              {payslips.length === 0 ? (
                <p className="text-xs text-slate-500">Belum ada slip gaji diterbitkan untuk akun Anda.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {payslips.map((slip) => (
                    <div key={slip.payslipId} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {slip.periodLabel || slip.periodMonth}
                        </p>
                        <p className="text-xs text-slate-500">
                          {slip.workflowStatus} ·{' '}
                          <span className="font-mono font-semibold text-emerald-700">
                            {formatIDR(slip.netPay)}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingPayslip(slip)}
                        className="shrink-0 min-h-[36px] px-3 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Lihat Slip
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Jadwal Kerja &amp; Shift Berlaku</h2>
              <div className="grid grid-cols-1 gap-2.5">
                {shifts.map((s) => (
                  <div key={s.shiftId} className="rounded-xl border border-slate-200 p-3 text-xs">
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="font-mono tabular-nums text-slate-700 mt-1">
                      {s.startTime} – {s.endTime} · Istirahat {s.breakMinutes} mnt
                    </p>
                    <p className="text-slate-500 mt-0.5">{s.workDaysLabel || 'Senin - Jumat'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'profil' && (
          <div className={isPhoneLayout ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-5'}>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">Biodata &amp; Informasi Kompensasi</h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-500">Kode Karyawan</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">{activeEmp?.employeeCode || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Departemen / Jabatan</p>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {myDept?.name || '-'} · {myPos?.title || '-'}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-500">Email &amp; Telepon</p>
                  <p className="text-slate-900 mt-0.5 truncate">{activeEmp?.email || currentUser.email}</p>
                  <p className="text-slate-600">{activeEmp?.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Tanggal Bergabung</p>
                  <p className="font-mono text-slate-900 mt-0.5">{formatDateDMY(activeEmp?.joinDate)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Rekening Payroll</p>
                  <p className="font-mono text-slate-900 mt-0.5">
                    {activeEmp?.bankName || '-'} {activeEmp?.bankAccountNumber || ''}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-500">Gaji Pokok Terdaftar</p>
                  <p className="font-mono font-bold text-emerald-700 mt-0.5">
                    {formatIDR(activeEmp?.baseSalary ?? 0)}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">Keamanan Akun &amp; Kata Sandi</h2>
              <p className="text-xs text-slate-500">
                Ubah kata sandi akun Firebase Authentication Anda secara langsung.
              </p>
              <input
                type="password"
                minLength={6}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Kata sandi baru (minimal 6 karakter)"
                className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3.5 text-sm"
              />
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Perbarui Kata Sandi
              </button>
            </form>
          </div>
        )}
      </main>

      <nav
        className={
          isPhoneLayout
            ? 'fixed bottom-0 left-0 right-0 z-40 lg:static lg:shrink-0 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe'
            : 'fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe'
        }
      >
        <div className="max-w-lg mx-auto grid grid-cols-5 h-16 items-center">
          {(
            [
              { id: 'beranda', label: 'Beranda', icon: Home },
              { id: 'presensi', label: 'Presensi', icon: Clock },
              { id: 'cuti', label: 'Cuti', icon: CalendarClock },
              { id: 'laporan', label: 'Laporan', icon: FileText },
              { id: 'profil', label: 'Profil', icon: User },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] ${
                  active ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-medium mt-0.5">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );

  return (
    <div className={isPhoneLayout ? 'min-h-screen bg-[#E9EDF2] lg:py-6 lg:px-6' : ''}>
      {isPhoneLayout ? (
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 flex justify-center">
            <PhoneFrameShell enabled liveTimeLabel={liveTimeLabel}>
              {appSurface}
            </PhoneFrameShell>
          </div>

          <aside className="hidden lg:block lg:col-span-6 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-emerald-700">
                    Mobile App Karyawan · {isDemoMode ? 'Sinkronisasi Lintas Tab' : 'Cloud Firestore Real-Time'}
                  </p>
                  <h2 className="text-xl font-bold text-slate-900 mt-1">
                    Pratinjau Phone Frame &amp; Sinkronisasi Live
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setFrameMode('desktop')}
                  className="shrink-0 min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Layar Penuh</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
                <div>
                  <p className="text-slate-500">Status Sinkronisasi</p>
                  <p className="font-mono font-semibold text-emerald-700 mt-0.5">{syncLabel}</p>
                </div>
                <div>
                  <p className="text-slate-500">Jam Server Lokal</p>
                  <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                    {formatDateDMY(today)} · {liveTimeLabel}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Karyawan Aktif</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {activeEmp?.fullName || currentUser.displayName}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Gaji Harian (Estimasi / 22 HK)</p>
                  <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                    {formatIDR(Math.round((activeEmp?.baseSalary ?? 0) / 22))}/hari
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
                {canOpenBackoffice && (
                  <button
                    type="button"
                    onClick={onSwitchToBackoffice}
                    className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Building2 className="h-4 w-4" />
                    <span>Buka Backoffice Manajemen</span>
                  </button>
                )}
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Buka Tab Baru (Tes Real-Time 2 Layar)</span>
                </a>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Bukti Absensi Foto Hari Ini</h3>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {todayAttendance ? todayAttendance.status : 'Menunggu Clock-In'}
                </span>
              </div>

              {todayAttendance ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-600">
                      Masuk · {formatTimeHM(toJsDate(todayAttendance.clockInAt))}
                    </p>
                    <button
                      type="button"
                      onClick={() => setInspectingAttendance(todayAttendance)}
                      className="w-full aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 hover:border-emerald-600"
                    >
                      {todayAttendance.clockInSelfie ? (
                        <img
                          src={todayAttendance.clockInSelfie}
                          alt="Selfie masuk"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">Tidak ada foto</span>
                      )}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-600">
                      Pulang · {formatTimeHM(toJsDate(todayAttendance.clockOutAt))}
                    </p>
                    <button
                      type="button"
                      onClick={() => setInspectingAttendance(todayAttendance)}
                      className="w-full aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 hover:border-emerald-600 flex items-center justify-center"
                    >
                      {todayAttendance.clockOutSelfie ? (
                        <img
                          src={todayAttendance.clockOutSelfie}
                          alt="Selfie pulang"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">Belum Clock-Out</span>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center space-y-2">
                  <p className="text-xs text-slate-500">
                    Belum ada foto presensi hari ini. Gunakan kamera di Phone Frame atau tombol di bawah.
                  </p>
                  <button
                    type="button"
                    disabled={!activeEmp}
                    onClick={() => setCameraMode('clock-in')}
                    className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Clock In Foto Sekarang</span>
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : (
        appSurface
      )}

      {cameraMode && (
        <SelfieCameraModal
          mode={cameraMode}
          isSubmitting={submittingClock}
          employeeName={activeEmp?.fullName || currentUser.displayName}
          fallbackAvatarUrl={activeEmp?.photoUrl}
          gpsHint={gpsStatus || undefined}
          onClose={() => setCameraMode(null)}
          onConfirm={handleClockConfirm}
        />
      )}

      {viewingPayslip && (
        <PayslipPrintableModal
          payslip={viewingPayslip}
          company={company}
          employee={activeEmp || undefined}
          departmentName={myDept?.name}
          positionTitle={myPos?.title}
          onClose={() => setViewingPayslip(null)}
        />
      )}

      {inspectingAttendance && (
        <AttendancePhotoModal
          record={inspectingAttendance}
          employee={activeEmp || undefined}
          onClose={() => setInspectingAttendance(null)}
        />
      )}
    </div>
  );
};

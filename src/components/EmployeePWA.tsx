import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Home,
  LogOut,
  RefreshCw,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { essApi, type EssDashboardResponse } from '../services/api';
import type { AttendanceRecord, EmployeeProfile, LeaveRequest, PayrollItem } from '../types/hrm';
import {
  diffDaysInclusive,
  formatDateDMY,
  formatMonthLabel,
  formatTimeHM,
  getMonthPrefix,
  getTodayISO,
} from '../utils/dateFormat';
import { formatIDR } from '../utils/currency';
import { PWAInstallButton } from './PWAInstallButton';
import { SelfieCameraModal } from './SelfieCameraModal';

type EssTab = 'beranda' | 'presensi' | 'cuti' | 'laporan' | 'profil';

interface EmployeePWAProps {
  initialProfile: EmployeeProfile;
  onLogout: () => void;
}

export const EmployeePWA: React.FC<EmployeePWAProps> = ({ initialProfile, onLogout }) => {
  const [activeTab, setActiveTab] = useState<EssTab>('beranda');
  const [dashboard, setDashboard] = useState<EssDashboardResponse | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payrollSlips, setPayrollSlips] = useState<PayrollItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(getMonthPrefix());
  const [liveTime, setLiveTime] = useState<Date>(new Date());

  const [cameraMode, setCameraMode] = useState<'clock-in' | 'clock-out' | null>(null);
  const [isSubmittingCamera, setIsSubmittingCamera] = useState(false);
  const [previewSelfie, setPreviewSelfie] = useState<{ title: string; src: string; meta: string } | null>(null);

  // Leave form state
  const [leaveType, setLeaveType] = useState<LeaveRequest['leave_type']>('Cuti Tahunan');
  const [startDate, setStartDate] = useState<string>(getTodayISO());
  const [endDate, setEndDate] = useState<string>(getTodayISO());
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const profile = dashboard?.profile ?? initialProfile;

  const loadAll = useCallback(async (month = selectedMonth) => {
    try {
      const [dashRes, attRes, leaveRes, slipRes] = await Promise.all([
        essApi.getDashboard(),
        essApi.getAttendances(month),
        essApi.getLeaves(),
        essApi.getPayrollSlips(),
      ]);
      setDashboard(dashRes);
      setAttendances(attRes);
      setLeaves(leaveRes);
      setPayrollSlips(slipRes);
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memuat data terbaru.',
      });
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadAll(selectedMonth);
  }, [loadAll, selectedMonth]);

  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000);
    const poller = setInterval(() => loadAll(selectedMonth), 20000);
    return () => {
      clearInterval(timer);
      clearInterval(poller);
    };
  }, [loadAll, selectedMonth]);

  const handleClockConfirm = async (photoDataUrl: string, note: string) => {
    if (!cameraMode) return;
    setIsSubmittingCamera(true);
    setFeedbackMsg(null);
    try {
      if (cameraMode === 'clock-in') {
        await essApi.clockIn({ photo: photoDataUrl, note });
        setFeedbackMsg({ type: 'success', text: 'Clock-In berhasil dicatat ke database.' });
      } else {
        await essApi.clockOut({ photo: photoDataUrl, note });
        setFeedbackMsg({ type: 'success', text: 'Clock-Out berhasil dicatat ke database.' });
      }
      setCameraMode(null);
      await loadAll(selectedMonth);
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan presensi.',
      });
    } finally {
      setIsSubmittingCamera(false);
    }
  };

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingLeave(true);
    setFeedbackMsg(null);
    try {
      await essApi.createLeave({
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: leaveReason,
      });
      setLeaveReason('');
      setFeedbackMsg({ type: 'success', text: 'Pengajuan cuti berhasil dikirim ke HR Admin.' });
      await loadAll(selectedMonth);
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengirim pengajuan cuti.',
      });
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const todayAttendance = dashboard?.todayAttendance ?? null;
  const hasClockedIn = Boolean(todayAttendance?.clock_in_at);
  const hasClockedOut = Boolean(todayAttendance?.clock_out_at);

  const reportStats = useMemo(() => {
    const valid = attendances.filter((a) => a.status !== 'Alpa');
    const totalPay = valid.reduce((sum, a) => sum + (a.daily_rate_snapshot || profile.daily_rate), 0);
    const totalMinutes = attendances.reduce((sum, a) => sum + (a.work_minutes || 0), 0);
    const lateCount = attendances.filter((a) => a.status === 'Terlambat').length;
    return {
      daysPresent: valid.length,
      totalPay,
      totalHours: (totalMinutes / 60).toFixed(1),
      lateCount,
    };
  }, [attendances, profile.daily_rate]);

  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push(getMonthPrefix(dt));
    }
    return opts;
  }, []);

  const exportCsv = () => {
    const header = ['Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Tarif Harian (Rp)'];
    const rows = attendances.map((a) => [
      formatDateDMY(a.work_date),
      formatTimeHM(a.clock_in_at),
      a.clock_out_at ? formatTimeHM(a.clock_out_at) : '-',
      a.status,
      String(a.daily_rate_snapshot || profile.daily_rate),
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Laporan-Presensi-${profile.nik}-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const liveClockStr = `${String(liveTime.getHours()).padStart(2, '0')}:${String(
    liveTime.getMinutes()
  ).padStart(2, '0')}:${String(liveTime.getSeconds()).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-900 pb-24">
      {/* Sticky Top App Bar (compact 56px) */}
      <header className="sticky top-0 z-30 h-14 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="mx-auto max-w-5xl h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/src/assets/images/brand_emblem_1795590990670.jpg"
              alt="KerjaPay"
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg object-cover shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              KerjaPay
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden sm:inline font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
              {formatDateDMY(new Date())}
            </span>
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => loadAll(selectedMonth)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Segarkan data"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('profil')}
              className="flex items-center gap-2 rounded-xl p-1 hover:bg-slate-100"
              aria-label="Buka profil"
            >
              <img
                src={profile.avatar_url || '/src/assets/images/avatar_emp_1_1795590992124.jpg'}
                alt={profile.full_name}
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full object-cover border border-slate-200"
              />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 pt-5 space-y-5">
        {feedbackMsg && (
          <div
            className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-xs sm:text-sm border ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackMsg(null)}
              className="p-1 text-current opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* TAB 1: BERANDA */}
        {activeTab === 'beranda' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Fintech Balance & Clock-In Card */}
            <div className="lg:col-span-7 space-y-5">
              <section className="rounded-3xl bg-[#0B131E] text-white p-6 shadow-sm relative overflow-hidden">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-400">
                      Halo, {profile.full_name.split(' ')[0]} · {profile.position_title}
                    </p>
                    <p className="mt-3 text-xs text-slate-400">Estimasi Penghasilan Bulan Ini</p>
                    <p className="mt-1 font-mono text-3xl sm:text-4xl font-bold tracking-tight text-white tabular-nums">
                      {formatIDR(dashboard?.monthSummary.estimatedEarningsMonth ?? 0)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-lg sm:text-xl font-semibold text-emerald-400 tabular-nums">
                      {liveClockStr}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400 tabular-nums">
                      {formatDateDMY(new Date())}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-300 tabular-nums">
                  <span>Tarif {formatIDR(profile.daily_rate)}/hari</span>
                  <span aria-hidden="true">·</span>
                  <span>{dashboard?.monthSummary.daysPresent ?? 0} Hari Masuk</span>
                  <span aria-hidden="true">·</span>
                  <span>Sisa Cuti {profile.leave_quota} Hari</span>
                </div>

                {/* Primary Clock-In / Clock-Out Fintech Action */}
                <div className="mt-6 pt-5 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-400">
                      Shift Hari Ini ({dashboard?.todaySchedule?.day_name || 'Hari Kerja'})
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-medium text-white tabular-nums">
                      {dashboard?.todaySchedule?.is_work_day
                        ? `${dashboard.todaySchedule.clock_in_time} – ${dashboard.todaySchedule.clock_out_time}`
                        : 'Hari Libur Terjadwal'}
                    </p>
                    {hasClockedIn && (
                      <p className="mt-1 text-xs text-emerald-400 font-mono tabular-nums">
                        Masuk {formatTimeHM(todayAttendance?.clock_in_at)}
                        {hasClockedOut ? ` · Pulang ${formatTimeHM(todayAttendance?.clock_out_at)}` : ' · Sedang Bekerja'}
                      </p>
                    )}
                  </div>

                  {!hasClockedIn ? (
                    <button
                      type="button"
                      onClick={() => setCameraMode('clock-in')}
                      className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
                    >
                      <Camera className="h-4 w-4" />
                      <span>Clock-In Selfie</span>
                    </button>
                  ) : !hasClockedOut ? (
                    <button
                      type="button"
                      onClick={() => setCameraMode('clock-out')}
                      className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300 active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
                    >
                      <Camera className="h-4 w-4" />
                      <span>Clock-Out Selfie</span>
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-xs font-semibold text-emerald-400 whitespace-nowrap shrink-0">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Presensi Selesai</span>
                    </div>
                  )}
                </div>
              </section>

              {/* 3-Column Summary Metrics */}
              <section className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Kehadiran</p>
                  <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {dashboard?.monthSummary.daysPresent ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-400">Hari bulan ini</p>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Terlambat</p>
                  <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {dashboard?.monthSummary.lateCount ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-400">Kali bulan ini</p>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Sisa Cuti</p>
                  <p className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
                    {profile.leave_quota}
                  </p>
                  <p className="text-[11px] text-slate-400">Hari tahunan</p>
                </div>
              </section>
            </div>

            {/* Right Column: Recent Activity Feed */}
            <div className="lg:col-span-5 space-y-5">
              <section className="rounded-2xl bg-white border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-base font-semibold text-slate-900">Riwayat Presensi Terbaru</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('presensi')}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                  >
                    Lihat Semua
                  </button>
                </div>

                {attendances.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">Belum ada catatan presensi bulan ini.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {attendances.slice(0, 5).map((item) => (
                      <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 font-mono tabular-nums">
                            {formatDateDMY(item.work_date)}
                          </p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            {formatTimeHM(item.clock_in_at)} – {item.clock_out_at ? formatTimeHM(item.clock_out_at) : 'Aktif'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-xs font-semibold ${
                              item.status === 'Hadir'
                                ? 'text-emerald-700'
                                : item.status === 'Terlambat'
                                ? 'text-amber-700'
                                : 'text-red-600'
                            }`}
                          >
                            {item.status}
                          </p>
                          <p className="text-xs font-mono text-slate-500 tabular-nums">
                            +{formatIDR(item.daily_rate_snapshot || profile.daily_rate)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl bg-white border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-base font-semibold text-slate-900">Status Pengajuan Cuti</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('cuti')}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                  >
                    Ajukan Cuti
                  </button>
                </div>
                {leaves.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-500">Belum ada pengajuan cuti.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {leaves.slice(0, 3).map((lv) => (
                      <div key={lv.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{lv.leave_type}</p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            {formatDateDMY(lv.start_date)} – {formatDateDMY(lv.end_date)} ({lv.total_days} hari)
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold shrink-0 ${
                            lv.status === 'Disetujui'
                              ? 'text-emerald-700'
                              : lv.status === 'Ditolak'
                              ? 'text-red-600'
                              : 'text-amber-700'
                          }`}
                        >
                          {lv.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* TAB 2: PRESENSI */}
        {activeTab === 'presensi' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <section className="lg:col-span-5 rounded-3xl bg-white border border-slate-200 p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">Presensi Selfie Hari Ini</h2>
                  <p className="text-xs text-slate-500 font-mono tabular-nums">{formatDateDMY(new Date())}</p>
                </div>
                <span className="font-mono text-base font-semibold text-emerald-700 tabular-nums">
                  {liveClockStr}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 border border-slate-200/70 p-3.5">
                  <p className="text-xs text-slate-500">Clock-In</p>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                    {todayAttendance ? formatTimeHM(todayAttendance.clock_in_at) : '--:--'}
                  </p>
                  {todayAttendance?.clock_in_photo && (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewSelfie({
                          title: 'Foto Selfie Clock-In',
                          src: todayAttendance.clock_in_photo,
                          meta: `${formatDateDMY(todayAttendance.work_date)} · ${formatTimeHM(
                            todayAttendance.clock_in_at
                          )}`,
                        })
                      }
                      className="mt-2 text-xs font-medium text-emerald-700 hover:underline"
                    >
                      Lihat Selfie Masuk
                    </button>
                  )}
                </div>

                <div className="rounded-2xl bg-slate-50 border border-slate-200/70 p-3.5">
                  <p className="text-xs text-slate-500">Clock-Out</p>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                    {todayAttendance?.clock_out_at ? formatTimeHM(todayAttendance.clock_out_at) : '--:--'}
                  </p>
                  {todayAttendance?.clock_out_photo && (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewSelfie({
                          title: 'Foto Selfie Clock-Out',
                          src: todayAttendance.clock_out_photo!,
                          meta: `${formatDateDMY(todayAttendance.work_date)} · ${formatTimeHM(
                            todayAttendance.clock_out_at
                          )}`,
                        })
                      }
                      className="mt-2 text-xs font-medium text-emerald-700 hover:underline"
                    >
                      Lihat Selfie Pulang
                    </button>
                  )}
                </div>
              </div>

              {!hasClockedIn ? (
                <button
                  type="button"
                  onClick={() => setCameraMode('clock-in')}
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.98] transition-all"
                >
                  <Camera className="h-4 w-4" />
                  <span>Ambil Selfie &amp; Clock-In</span>
                </button>
              ) : !hasClockedOut ? (
                <button
                  type="button"
                  onClick={() => setCameraMode('clock-out')}
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 active:scale-[0.98] transition-all"
                >
                  <Camera className="h-4 w-4" />
                  <span>Ambil Selfie &amp; Clock-Out</span>
                </button>
              ) : (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-medium text-emerald-800 text-center">
                  Clock-In dan Clock-Out hari ini sudah lengkap tercatat.
                </div>
              )}

              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-700 mb-2">Jadwal Kerja Mingguan</p>
                <div className="space-y-1.5">
                  {(dashboard?.schedules ?? []).map((s) => (
                    <div key={s.day_of_week} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">{s.day_name}</span>
                      <span className="font-mono tabular-nums text-slate-900">
                        {s.is_work_day ? `${s.clock_in_time} – ${s.clock_out_time}` : 'Libur'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="font-display text-base font-bold text-slate-900">Log Kehadiran</h2>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {formatMonthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              {attendances.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">Tidak ada log presensi di periode ini.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {attendances.map((a) => (
                    <div key={a.id} className="py-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {a.clock_in_photo ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewSelfie({
                                title: `Selfie ${formatDateDMY(a.work_date)}`,
                                src: a.clock_in_photo,
                                meta: `Clock-In ${formatTimeHM(a.clock_in_at)}`,
                              })
                            }
                            className="h-11 w-11 rounded-xl overflow-hidden border border-slate-200 shrink-0"
                          >
                            <img src={a.clock_in_photo} alt="Selfie masuk" className="h-full w-full object-cover" />
                          </button>
                        ) : (
                          <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                            <Clock className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                            {formatDateDMY(a.work_date)}
                          </p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            Masuk {formatTimeHM(a.clock_in_at)} · Pulang{' '}
                            {a.clock_out_at ? formatTimeHM(a.clock_out_at) : '--:--'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`block text-xs font-semibold ${
                            a.status === 'Hadir'
                              ? 'text-emerald-700'
                              : a.status === 'Terlambat'
                              ? 'text-amber-700'
                              : 'text-red-600'
                          }`}
                        >
                          {a.status}
                        </span>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">
                          {formatIDR(a.daily_rate_snapshot || profile.daily_rate)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 3: CUTI */}
        {activeTab === 'cuti' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <section className="lg:col-span-5 rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">Ajukan Cuti / Izin</h2>
                  <p className="text-xs text-slate-500">Persetujuan diproses oleh HR Backoffice.</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-500">Sisa Kuota</p>
                  <p className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
                    {profile.leave_quota} Hari
                  </p>
                </div>
              </div>

              <form onSubmit={handleLeaveSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Jenis Pengajuan</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveRequest['leave_type'])}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900"
                  >
                    <option value="Cuti Tahunan">Cuti Tahunan</option>
                    <option value="Izin Sakit">Izin Sakit</option>
                    <option value="Izin Khusus">Izin Khusus</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Tanggal Mulai</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (e.target.value > endDate) setEndDate(e.target.value);
                      }}
                      className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Tanggal Selesai</label>
                    <input
                      type="date"
                      required
                      min={startDate}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-900 font-mono"
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  Periode: {formatDateDMY(startDate)} – {formatDateDMY(endDate)} ({diffDaysInclusive(startDate, endDate)} hari)
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Alasan Pengajuan</label>
                  <textarea
                    required
                    rows={3}
                    maxLength={280}
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="Jelaskan keperluan cuti atau izin Anda..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingLeave}
                  className="w-full min-h-[48px] rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 active:scale-[0.98] transition-all"
                >
                  {isSubmittingLeave ? 'Mengirim Pengajuan...' : 'Kirim Pengajuan Cuti'}
                </button>
              </form>
            </section>

            <section className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 p-5">
              <h2 className="font-display text-base font-bold text-slate-900 mb-4">Riwayat Pengajuan Cuti</h2>
              {leaves.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">Belum ada pengajuan cuti yang dibuat.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {leaves.map((lv) => (
                    <div key={lv.id} className="py-3.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{lv.leave_type}</p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            {formatDateDMY(lv.start_date)} – {formatDateDMY(lv.end_date)} · {lv.total_days} Hari
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold shrink-0 ${
                            lv.status === 'Disetujui'
                              ? 'text-emerald-700'
                              : lv.status === 'Ditolak'
                              ? 'text-red-600'
                              : 'text-amber-700'
                          }`}
                        >
                          {lv.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{lv.reason}</p>
                      {lv.admin_note && (
                        <p className="text-xs text-slate-500">Catatan HR: {lv.admin_note}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 4: LAPORAN */}
        {activeTab === 'laporan' && (
          <div className="space-y-5">
            <section className="rounded-2xl bg-white border border-slate-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">Laporan Kehadiran &amp; Gaji Harian</h2>
                  <p className="text-xs text-slate-500">
                    Perhitungan otomatis: Hari Masuk × Tarif Harian ({formatIDR(profile.daily_rate)}/hari)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    {monthOptions.map((m) => (
                      <option key={m} value={m}>
                        {formatMonthLabel(m)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Unduh CSV</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="rounded-2xl bg-slate-50 border border-slate-200/70 p-4">
                  <p className="text-xs text-slate-500">Total Hari Masuk</p>
                  <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {reportStats.daysPresent} Hari
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200/70 p-4">
                  <p className="text-xs text-slate-500">Total Jam Kerja</p>
                  <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {reportStats.totalHours} Jam
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200/70 p-4">
                  <p className="text-xs text-slate-500">Terlambat</p>
                  <p className="mt-1 font-mono text-xl font-bold text-amber-700 tabular-nums">
                    {reportStats.lateCount} Kali
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
                  <p className="text-xs text-emerald-700">Akumulasi Gaji Harian</p>
                  <p className="mt-1 font-mono text-xl font-bold text-emerald-800 tabular-nums">
                    {formatIDR(reportStats.totalPay)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                      <th className="py-2.5 pr-4">Tanggal</th>
                      <th className="py-2.5 px-3">Masuk</th>
                      <th className="py-2.5 px-3">Pulang</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 pl-3 text-right">Upah Harian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {attendances.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-4 font-mono text-xs sm:text-sm text-slate-900 tabular-nums whitespace-nowrap">
                          {formatDateDMY(a.work_date)}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-slate-600 tabular-nums">
                          {formatTimeHM(a.clock_in_at)}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-slate-600 tabular-nums">
                          {a.clock_out_at ? formatTimeHM(a.clock_out_at) : '--:--'}
                        </td>
                        <td className="py-3 px-3 text-xs font-semibold">
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
                        <td className="py-3 pl-3 text-right font-mono text-xs sm:text-sm font-medium text-slate-900 tabular-nums">
                          {formatIDR(a.daily_rate_snapshot || profile.daily_rate)}
                        </td>
                      </tr>
                    ))}
                    {attendances.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                          Belum ada data presensi pada bulan {formatMonthLabel(selectedMonth)}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB 5: PROFIL (BIODATA & GAJI) */}
        {activeTab === 'profil' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <section className="lg:col-span-5 rounded-2xl bg-white border border-slate-200 p-5 space-y-5">
              <div className="flex items-center gap-4">
                <img
                  src={profile.avatar_url || '/src/assets/images/avatar_emp_1_1795590992124.jpg'}
                  alt={profile.full_name}
                  referrerPolicy="no-referrer"
                  className="h-16 w-16 rounded-2xl object-cover border border-slate-200 shrink-0"
                />
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-bold text-slate-900 truncate">{profile.full_name}</h2>
                  <p className="text-xs text-slate-500 truncate">
                    {profile.position_title} · {profile.department}
                  </p>
                  <p className="mt-1 font-mono text-xs text-emerald-700 tabular-nums">
                    {profile.nik} · {profile.status}
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-100 text-sm">
                <div className="py-2.5 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Email ESS</span>
                  <span className="text-xs font-medium text-slate-900 truncate">{profile.email}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">No. Telepon</span>
                  <span className="text-xs font-mono text-slate-900 tabular-nums">{profile.phone || '-'}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Tanggal Bergabung</span>
                  <span className="text-xs font-mono text-slate-900 tabular-nums">
                    {formatDateDMY(profile.join_date)}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Rekening Payroll</span>
                  <span className="text-xs font-mono text-slate-900 tabular-nums">
                    {profile.bank_name ? `${profile.bank_name} · ${profile.bank_account}` : '-'}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Tarif Gaji Harian</span>
                  <span className="text-sm font-mono font-bold text-emerald-700 tabular-nums">
                    {formatIDR(profile.daily_rate)} / hari
                  </span>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2.5">
                <PWAInstallButton />
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Keluar dari Akun ESS</span>
                </button>
              </div>
            </section>

            <section className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">Slip Gaji Harian (Payroll)</h3>
                  <p className="text-xs text-slate-500">Riwayat penggajian resmi yang diproses dari Backoffice.</p>
                </div>
                <Wallet className="h-5 w-5 text-emerald-600" />
              </div>

              {payrollSlips.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 border border-slate-200/70 p-6 text-center space-y-1">
                  <FileText className="h-6 w-6 text-slate-400 mx-auto" />
                  <p className="text-sm font-medium text-slate-700">Belum ada slip payroll resmi</p>
                  <p className="text-xs text-slate-500">
                    Slip gaji akan muncul di sini setelah HR Admin memproses periode payroll.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {payrollSlips.map((slip) => (
                    <div key={slip.id} className="rounded-2xl border border-slate-200 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{slip.period_label}</p>
                          <p className="text-xs font-mono text-slate-500 tabular-nums">
                            {formatDateDMY(slip.start_date)} – {formatDateDMY(slip.end_date)}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            slip.status === 'Dibayar' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {slip.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-2 border-t border-slate-100">
                        <div>
                          <span className="text-slate-500 block">Hari Masuk</span>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            {slip.days_worked} Hari
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Gaji Pokok</span>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            {formatIDR(slip.base_pay)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Tunjangan / Pot.</span>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            +{formatIDR(slip.allowance)} / -{formatIDR(slip.deduction)}
                          </span>
                        </div>
                        <div className="sm:text-right">
                          <span className="text-slate-500 block">Total Diterima</span>
                          <span className="font-mono font-bold text-emerald-700 tabular-nums">
                            {formatIDR(slip.net_pay)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Fixed Mobile Bottom Navigation (5 Tabs) */}
      <nav
        aria-label="Navigasi ESS Karyawan"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="mx-auto max-w-lg grid grid-cols-5 h-16 items-center">
          {(
            [
              { id: 'beranda', label: 'Beranda', icon: Home },
              { id: 'presensi', label: 'Presensi', icon: Camera },
              { id: 'cuti', label: 'Cuti', icon: Calendar },
              { id: 'laporan', label: 'Laporan', icon: BarChart3 },
              { id: 'profil', label: 'Profil', icon: User },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {cameraMode && (
        <SelfieCameraModal
          mode={cameraMode}
          isSubmitting={isSubmittingCamera}
          onClose={() => setCameraMode(null)}
          onConfirm={handleClockConfirm}
        />
      )}

      {previewSelfie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-900">{previewSelfie.title}</p>
                <p className="text-xs font-mono text-slate-500 tabular-nums">{previewSelfie.meta}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewSelfie(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img src={previewSelfie.src} alt={previewSelfie.title} className="w-full max-h-[65vh] object-cover" />
          </div>
        </div>
      )}
    </div>
  );
};

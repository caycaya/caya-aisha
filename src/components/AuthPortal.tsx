import React, { useEffect, useState } from 'react';
import { Building2, Eye, EyeOff, Lock, Mail, ShieldCheck, Smartphone, User } from 'lucide-react';
import { authApi, setApiToken } from '../services/api';
import type { AuthSession } from '../types/hrm';
import { formatDateDMY } from '../utils/dateFormat';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthPortalProps {
  onAuthenticated: (session: AuthSession) => void;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({ onAuthenticated }) => {
  const [portalMode, setPortalMode] = useState<'employee' | 'admin'>('employee');
  const [adminConfigured, setAdminConfigured] = useState<boolean | null>(null);

  // Employee Login state
  const [empEmail, setEmpEmail] = useState('');
  const [empPassword, setEmpPassword] = useState('');
  const [showEmpPass, setShowEmpPass] = useState(false);

  // Admin Login / First-run Setup state
  const [adminName, setAdminName] = useState('HR Administrator');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let active = true;
    authApi
      .getStatus()
      .then((res) => {
        if (active) setAdminConfigured(res.adminConfigured);
      })
      .catch(() => {
        if (active) setAdminConfigured(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);
    try {
      const res = await authApi.loginEmployee({ email: empEmail, password: empPassword });
      setApiToken(res.token);
      onAuthenticated({ token: res.token, role: 'employee', user: res.user });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk ke aplikasi ESS.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);
    try {
      const res =
        adminConfigured === false
          ? await authApi.setupAdmin({ name: adminName, email: adminEmail, password: adminPassword })
          : await authApi.loginAdmin({ email: adminEmail, password: adminPassword });
      setApiToken(res.token);
      onAuthenticated({ token: res.token, role: 'admin', user: res.user });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk ke Backoffice.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col justify-center py-6 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch rounded-3xl bg-white border border-slate-200 overflow-hidden shadow-sm">
          {/* Left Editorial / Fintech Overview Panel */}
          <div className="lg:col-span-5 bg-[#0B131E] text-white p-7 sm:p-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src="/src/assets/images/brand_emblem_1795590990670.jpg"
                    alt="KerjaPay HRM"
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 rounded-xl object-cover border border-slate-700"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
                    KerjaPay HRM
                  </span>
                </div>
                <span className="font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
                  {formatDateDMY(new Date())}
                </span>
              </div>

              <h1 className="mt-8 font-display text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
                Manajemen SDM Terpusat &amp; Presensi Selfie Karyawan
              </h1>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                Satu sumber data terintegrasi untuk operasional HR Backoffice dan layanan mandiri karyawan (ESS) di semua perangkat.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Smartphone className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Mobile PWA Fintech-Grade</p>
                  <p className="text-xs text-slate-400">Clock-in &amp; clock-out selfie, pengajuan cuti, dan pantau gaji harian.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Panel Backoffice &amp; Payroll Harian</p>
                  <p className="text-xs text-slate-400">Kelola jabatan, akun login ESS karyawan, jam kerja, cuti, dan slip harian.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Auth & Portal Switch Panel */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
            {/* Switch Tampilan Awal: Mobile App Karyawan vs Backoffice Admin */}
            <div className="mb-6">
              <p className="text-xs font-medium text-slate-500 mb-2">Pilih Portal Akses</p>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1.5" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={portalMode === 'employee'}
                  onClick={() => {
                    setPortalMode('employee');
                    setErrorMsg('');
                  }}
                  className={`min-h-[44px] flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 ${
                    portalMode === 'employee'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Smartphone className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Mobile App Karyawan</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={portalMode === 'admin'}
                  onClick={() => {
                    setPortalMode('admin');
                    setErrorMsg('');
                  }}
                  className={`min-h-[44px] flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 ${
                    portalMode === 'admin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 text-slate-700" />
                  <span>Panel Backoffice</span>
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            {portalMode === 'employee' ? (
              <form onSubmit={handleEmployeeLogin} className="space-y-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    Masuk Employee Self-Service (ESS)
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-slate-500">
                    Gunakan email dan password karyawan yang telah diatur di Backoffice Management.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Email Karyawan</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={empEmail}
                      onChange={(e) => setEmpEmail(e.target.value)}
                      placeholder="nama@perusahaan.id"
                      className="w-full min-h-[46px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Password ESS</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type={showEmpPass ? 'text' : 'password'}
                      required
                      value={empPassword}
                      onChange={(e) => setEmpPassword(e.target.value)}
                      placeholder="Masukkan password Anda"
                      className="w-full min-h-[46px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-11 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEmpPass((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
                      aria-label="Tampilkan atau sembunyikan password"
                    >
                      {showEmpPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full min-h-[48px] rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 active:scale-[0.99] transition-all"
                >
                  {isLoading ? 'Memverifikasi...' : 'Masuk ke Mobile App ESS'}
                </button>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    Belum memiliki akses ESS? Aktifkan melalui menu Karyawan di Panel Backoffice.
                  </p>
                  <PWAInstallButton compact />
                </div>
              </form>
            ) : (
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    {adminConfigured === false
                      ? 'Aktivasi Akun Admin Backoffice'
                      : 'Login Panel Backoffice Management'}
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-slate-500">
                    {adminConfigured === false
                      ? 'Belum ada admin terdaftar. Daftarkan akun administrator utama untuk mulai mengelola HR & kredensial ESS.'
                      : 'Masuk untuk mengelola karyawan, jadwal kerja, persetujuan cuti, dan payroll harian.'}
                  </p>
                </div>

                {adminConfigured === false && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Nama Lengkap Admin</label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="Nama pengelola HR"
                        className="w-full min-h-[46px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Email Administrator</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@perusahaan.id"
                      className="w-full min-h-[46px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Password {adminConfigured === false ? '(Minimal 6 karakter)' : ''}
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type={showAdminPass ? 'text' : 'password'}
                      required
                      minLength={adminConfigured === false ? 6 : 1}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Masukkan password Backoffice"
                      className="w-full min-h-[46px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-11 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPass((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
                      aria-label="Tampilkan atau sembunyikan password"
                    >
                      {showAdminPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || adminConfigured === null}
                  className="w-full min-h-[48px] rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 active:scale-[0.99] transition-all"
                >
                  {isLoading
                    ? 'Memproses...'
                    : adminConfigured === false
                    ? 'Buat Akun Admin & Masuk Backoffice'
                    : 'Masuk ke Panel Backoffice'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { AlertCircle, ArrowRight, Building2, KeyRound, Mail, Play, Smartphone } from 'lucide-react';
import { auth, FIREBASE_CONFIG_META } from '../firebase';
import { DEMO_PERSONAS, type DemoPersona } from '../services/demoSessionStore';
import { PWAInstallButton } from './PWAInstallButton';

export type PortalPreference = 'backoffice' | 'employee';

interface AuthGateProps {
  portalPreference: PortalPreference;
  onPortalPreferenceChange: (pref: PortalPreference) => void;
  onDemoLogin: (persona: DemoPersona) => void;
  authError: string | null;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  portalPreference,
  onPortalPreferenceChange,
  onDemoLogin,
  authError,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setBusy(true);
    setLocalError(null);
    setInfoMsg(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setLocalError('Jendela login Google ditutup sebelum proses selesai.');
      } else {
        setLocalError(err instanceof Error ? err.message : 'Login Google gagal.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setLocalError(null);
    setInfoMsg(null);
    try {
      if (authTab === 'login') {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (!cred.user.emailVerified) {
          await sendEmailVerification(cred.user);
          setInfoMsg(
            'Email Anda belum terverifikasi. Tautan verifikasi baru telah dikirim ke kotak masuk Anda.'
          );
        }
      } else if (authTab === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        await sendEmailVerification(cred.user);
        setInfoMsg(
          'Akun berhasil dibuat. Periksa kotak masuk email Anda untuk memverifikasi alamat email sebelum mengakses data.'
        );
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setInfoMsg('Tautan pengaturan ulang kata sandi telah dikirim ke email Anda.');
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setLocalError(
          'Provider Email/Password belum diaktifkan di Firebase Console (Authentication → Sign-in method → Email/Password). Gunakan tombol Masuk dengan Google atau aktifkan di Firebase Console.'
        );
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setLocalError('Email atau kata sandi tidak valid.');
      } else {
        setLocalError(err instanceof Error ? err.message : 'Autentikasi gagal.');
      }
    } finally {
      setBusy(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col justify-between">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <img
              src="/src/assets/images/brand_emblem_1795590990670.jpg"
              alt="KerjaPay HRM"
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg object-cover border border-slate-200"
            />
            <span className="text-lg font-bold tracking-tight text-slate-900">
              KerjaPay HRM
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <span className="whitespace-nowrap">Backoffice Manajemen</span>
            <span className="whitespace-nowrap">Employee Self-Service</span>
            <span className="whitespace-nowrap">Sinkronisasi Terpusat</span>
          </nav>
          <div className="shrink-0">
            <PWAInstallButton />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <section className="lg:col-span-6 space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-medium text-emerald-700">
              Enterprise Human Resource Management · Single Source of Truth
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight text-balance">
              Satu Platform Terpusat untuk Operasional HR dan Aplikasi Karyawan
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
              Panel Backoffice Web dan aplikasi Mobile Karyawan terhubung secara real-time ke database
              Cloud Firestore yang sama untuk presensi GPS &amp; selfie, cuti, lembur, dan payroll
              Indonesia (PPh 21 &amp; BPJS).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <button
              type="button"
              onClick={() => onPortalPreferenceChange('employee')}
              className={`text-left p-4 rounded-2xl border transition-colors ${
                portalPreference === 'employee'
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Smartphone className="h-5 w-5" />
                <span className="text-xs font-medium opacity-80">
                  {portalPreference === 'employee' ? 'Dipilih (Default)' : 'Pilih'}
                </span>
              </div>
              <p className="text-sm font-semibold">Mobile ESS Karyawan</p>
              <p
                className={`text-xs mt-1 ${
                  portalPreference === 'employee' ? 'text-emerald-100' : 'text-slate-500'
                }`}
              >
                Langsung masuk ke absensi foto, rekap kehadiran, cuti &amp; slip gaji
              </p>
            </button>

            <button
              type="button"
              onClick={() => onPortalPreferenceChange('backoffice')}
              className={`text-left p-4 rounded-2xl border transition-colors ${
                portalPreference === 'backoffice'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Building2 className="h-5 w-5" />
                <span className="text-xs font-medium opacity-80">
                  {portalPreference === 'backoffice' ? 'Dipilih' : 'Pilih'}
                </span>
              </div>
              <p className="text-sm font-semibold">Backoffice Web</p>
              <p
                className={`text-xs mt-1 ${
                  portalPreference === 'backoffice' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                Super Admin, HR Admin, Management, dan Supervisor
              </p>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Akun Demo Instan (Langsung Masuk ESS Karyawan)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Setelah masuk, Anda langsung diarahkan ke ESS Karyawan. Peran admin/supervisor tetap bisa
                berpindah ke panel Backoffice kapan saja dari tombol di header ESS.
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {[...DEMO_PERSONAS]
                .sort((a, b) => (a.portal === 'employee' ? -1 : b.portal === 'employee' ? 1 : 0))
                .map((persona) => (
                <div
                  key={persona.id}
                  className="py-2.5 first:pt-1 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {persona.label} · {portalPreference === 'backoffice' && persona.portal === 'backoffice' ? 'Backoffice' : 'ESS Karyawan'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{persona.subtitle}</p>
                    <p className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                      {persona.userAccount.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDemoLogin(persona)}
                    className={`shrink-0 min-h-[38px] whitespace-nowrap inline-flex items-center gap-1.5 rounded-xl px-3 text-xs font-semibold disabled:opacity-50 transition-colors ${
                      persona.portal === 'employee'
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-900 hover:text-white hover:border-slate-900'
                    }`}
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>{persona.portal === 'employee' ? 'Masuk ESS' : 'Masuk Demo'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lg:col-span-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {portalPreference === 'backoffice'
                  ? 'Masuk ke Backoffice Manajemen'
                  : 'Masuk ke Portal Karyawan ESS'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Autentikasi Firebase Terpadu · Project {FIREBASE_CONFIG_META.projectId}
              </p>
            </div>

            {displayError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 flex items-start gap-2.5 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{displayError}</span>
              </div>
            )}

            {infoMsg && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800">
                {infoMsg}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={busy}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
                />
              </svg>
              <span>{busy ? 'Memproses...' : 'Masuk dengan Akun Google'}</span>
            </button>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200" />
              <span className="shrink mx-3 text-xs text-slate-400">atau email &amp; kata sandi</span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setAuthTab('login')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                  authTab === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('register')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                  authTab === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Aktivasi Akun
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('reset')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                  authTab === 'reset' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Reset Sandi
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {authTab === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Nama sesuai data karyawan"
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Perusahaan
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@nusantaradigital.co.id"
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {authTab !== 'reset' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kata Sandi
                  </label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 transition-colors"
              >
                <span>
                  {authTab === 'login'
                    ? 'Masuk dengan Email'
                    : authTab === 'register'
                    ? 'Buat & Verifikasi Akun'
                    : 'Kirim Tautan Reset Sandi'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>© 2026 KerjaPay HRM · PT Nusantara Digital Karya</span>
          <span>Database Terpusat · Role-Based Access Control</span>
        </div>
      </footer>
    </div>
  );
};

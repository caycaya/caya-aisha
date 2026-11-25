import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 font-medium text-white transition-colors hover:bg-emerald-700 active:scale-[0.98] whitespace-nowrap shrink-0 ${
          compact ? 'min-h-[40px] px-3 py-1.5 text-xs' : 'min-h-[44px] px-4 py-2.5 text-sm'
        }`}
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>Pasang Aplikasi</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap shrink-0 ${
          compact ? 'min-h-[40px] px-3 py-1.5 text-xs' : 'min-h-[44px] px-4 py-2.5 text-sm'
        }`}
      >
        <Smartphone className="h-4 w-4 shrink-0 text-emerald-600" />
        <span>{isIOS ? 'Pasang di iOS' : 'Pasang PWA'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Pasang KerjaPay sebagai Aplikasi</h3>
                <p className="mt-1 text-xs text-slate-500">Akses cepat presensi selfie langsung dari layar utama ponsel Anda.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Tutup panduan instalasi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2.5 text-sm text-slate-600">
                <li>1. Ketuk tombol <strong>Bagikan (Share)</strong> pada bilah Safari.</li>
                <li>2. Gulir ke bawah dan pilih <strong>Tambah ke Layar Utama</strong>.</li>
                <li>3. Ketuk <strong>Tambah</strong> untuk memasang KerjaPay ESS.</li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2.5 text-sm text-slate-600">
                <li>1. Buka menu browser (ikon titik tiga di pojok kanan atas).</li>
                <li>2. Pilih <strong>Instal Aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</li>
                <li>3. Buka KerjaPay langsung seperti aplikasi mobile native.</li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, MapPin, RefreshCw, Upload, X } from 'lucide-react';
import { formatDateDMY } from '../utils/dateFormat';

interface SelfieCameraModalProps {
  mode: 'clock-in' | 'clock-out';
  isSubmitting: boolean;
  employeeName?: string;
  fallbackAvatarUrl?: string;
  gpsHint?: string;
  onClose: () => void;
  onConfirm: (photoDataUrl: string, note: string) => Promise<void>;
}

function stampCanvasOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: 'clock-in' | 'clock-out',
  gpsHint?: string
) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dateLabel = formatDateDMY(now);
  const tag = mode === 'clock-in' ? 'CLOCK-IN' : 'CLOCK-OUT';

  const barH = 38;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fillRect(0, height - barH, width, barH);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 12px monospace';
  ctx.fillText(`${tag} · ${dateLabel} ${hh}:${mm}:${ss} WIB`, 12, height - 15);
  if (gpsHint) {
    ctx.fillStyle = '#6EE7B7';
    ctx.font = '500 10px sans-serif';
    ctx.fillText(gpsHint.slice(0, 32), width - 170, height - 15);
  }
}

export const SelfieCameraModal: React.FC<SelfieCameraModalProps> = ({
  mode,
  isSubmitting,
  employeeName,
  fallbackAvatarUrl,
  gpsHint,
  onClose,
  onConfirm,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [capturedPhoto, setCapturedPhoto] = useState<string>('');
  const [note, setNote] = useState('');
  const [reviewFirst, setReviewFirst] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [cameraError, setCameraError] = useState<string>('');
  const [cameraReady, setCameraReady] = useState(false);
  const [liveTime, setLiveTime] = useState(() => new Date().toLocaleTimeString('id-ID', { hour12: false }));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveTime(new Date().toLocaleTimeString('id-ID', { hour12: false }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    setCameraError('');
    setCameraReady(false);
    stopStream();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Perangkat atau browser tidak mendukung kamera langsung. Unggah foto selfie atau gunakan verifikasi cepat di bawah.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch {
      setCameraError('Kamera tidak tersedia atau izin diblokir. Unggah foto selfie atau ambil foto verifikasi cepat.');
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopStream();
    };
  }, []);

  const finalizePhoto = async (dataUrl: string) => {
    setCapturedPhoto(dataUrl);
    setSubmitError('');
    stopStream();
    if (!reviewFirst) {
      try {
        await onConfirm(dataUrl, note);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Gagal mencatat presensi foto.');
      }
    }
  };

  const handleCapture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const width = 480;
    const height = Math.round((video.videoHeight / (video.videoWidth || 1)) * width) || 360;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();

    stampCanvasOverlay(ctx, width, height, mode, gpsHint);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.74);
    await finalizePhoto(dataUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const maxW = 480;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        stampCanvasOverlay(ctx, canvas.width, canvas.height, mode, gpsHint);
        void finalizePhoto(canvas.toDataURL('image/jpeg', 0.74));
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleQuickProfileCapture = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = 480;
    const height = 360;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const finalize = () => {
      stampCanvasOverlay(ctx, width, height, mode, gpsHint || 'Verifikasi Cepat');
      void finalizePhoto(canvas.toDataURL('image/jpeg', 0.76));
    };

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, width, height);

    if (fallbackAvatarUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const scale = Math.max(width / img.width, height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
        finalize();
      };
      img.onerror = () => {
        ctx.fillStyle = '#E2E8F0';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(employeeName || 'Karyawan KerjaPay', width / 2, height / 2);
        ctx.textAlign = 'start';
        finalize();
      };
      img.src = fallbackAvatarUrl;
    } else {
      ctx.fillStyle = '#E2E8F0';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(employeeName || 'Karyawan KerjaPay', width / 2, height / 2);
      ctx.textAlign = 'start';
      finalize();
    }
  };

  const handleRetake = () => {
    setCapturedPhoto('');
    setSubmitError('');
    startCamera();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capturedPhoto) return;
    setSubmitError('');
    try {
      await onConfirm(capturedPhoto, note);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Gagal mencatat presensi foto.');
    }
  };

  const title = mode === 'clock-in' ? 'Absensi Foto · Clock-In' : 'Absensi Foto · Clock-Out';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">
              {reviewFirst
                ? 'Mode tinjau aktif · Periksa foto sebelum mengirim.'
                : 'Ambil foto untuk langsung mencatat dan menampilkan ke Rekap Absensi.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
            }}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup kamera"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-950 flex items-center justify-center">
            {capturedPhoto ? (
              <>
                <img src={capturedPhoto} alt="Preview selfie presensi" className="h-full w-full object-cover" />
                {isSubmitting && (
                  <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center text-white text-xs gap-2">
                    <RefreshCw className="h-6 w-6 animate-spin text-emerald-400" />
                    <span className="font-semibold">Menyimpan foto ke Rekap Absensi...</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-full w-full object-cover -scale-x-100"
                />
                {cameraReady && (
                  <div className="pointer-events-none absolute inset-3 rounded-xl border border-white/30 flex flex-col justify-between p-2.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-white bg-slate-950/60 px-2.5 py-1 rounded-lg">
                      <span>{liveTime} WIB</span>
                      <span>{mode === 'clock-in' ? 'MASUK' : 'PULANG'}</span>
                    </div>
                    {gpsHint && (
                      <div className="self-start inline-flex items-center gap-1 text-[11px] text-emerald-200 bg-slate-950/65 px-2.5 py-1 rounded-lg">
                        <MapPin className="h-3 w-3" />
                        <span>{gpsHint}</span>
                      </div>
                    )}
                  </div>
                )}
                {!cameraReady && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 text-xs gap-2">
                    <Camera className="h-7 w-7 text-emerald-400" />
                    <span>Menghubungkan kamera depan...</span>
                  </div>
                )}
                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center text-slate-200 gap-3 bg-slate-900/95">
                    <Camera className="h-8 w-8 text-amber-400" />
                    <p className="text-xs leading-relaxed text-slate-300">{cameraError}</p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-700">
                        <Upload className="h-4 w-4" />
                        <span>Unggah Foto &amp; Absen</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="user"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleQuickProfileCapture}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-600 disabled:opacity-50"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        <span>Foto Verifikasi Cepat</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {submitError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
              {submitError}
            </div>
          )}

          {!capturedPhoto ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                {cameraReady && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleCapture}
                    className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98] transition-all"
                  >
                    <Camera className="h-4 w-4" />
                    <span>{reviewFirst ? 'Ambil Foto Selfie' : 'Ambil Foto & Catat Absensi'}</span>
                  </button>
                )}
                <label className="min-h-[48px] inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <Upload className="h-4 w-4" />
                  <span>Unggah Foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={reviewFirst}
                  onChange={(e) => setReviewFirst(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span>Tinjau foto dulu sebelum simpan ke rekap</span>
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleRetake}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Foto Ulang</span>
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
              >
                <Check className="h-4 w-4" />
                <span>
                  {isSubmitting
                    ? 'Menyimpan Presensi...'
                    : mode === 'clock-in'
                    ? 'Simpan ke Rekap Absensi'
                    : 'Simpan Clock-Out ke Rekap'}
                </span>
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Catatan Kehadiran (Opsional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={180}
              placeholder={mode === 'clock-in' ? 'Contoh: Hadir di kantor pusat' : 'Contoh: Pekerjaan harian selesai'}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
            />
          </div>
        </form>
      </div>
    </div>
  );
};

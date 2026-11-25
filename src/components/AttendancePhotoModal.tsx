import React from 'react';
import { Camera, Clock, MapPin, Smartphone, X } from 'lucide-react';
import type { AttendanceRecord, EmployeeRecord } from '../types/hrms';
import { toJsDate } from '../services/hrmsFirestore';
import { formatDateDMY, formatTimeHM } from '../utils/dateFormat';

interface AttendancePhotoModalProps {
  record: AttendanceRecord;
  employee?: EmployeeRecord;
  onClose: () => void;
}

export const AttendancePhotoModal: React.FC<AttendancePhotoModalProps> = ({
  record,
  employee,
  onClose,
}) => {
  const clockInTime = formatTimeHM(toJsDate(record.clockInAt));
  const clockOutTime = formatTimeHM(toJsDate(record.clockOutAt));
  const durationLabel = record.workMinutes
    ? `${Math.floor(record.workMinutes / 60)} jam ${record.workMinutes % 60} menit`
    : 'Sedang berlangsung';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 truncate">
              Bukti Absensi Foto · {employee?.fullName || record.employeeId}
            </h3>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
              {formatDateDMY(record.workDate)} · Status: {record.status}
              {record.lateMinutes ? ` (Terlambat ${record.lateMinutes} mnt)` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Tutup foto presensi"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">Foto Clock-In (Masuk)</span>
                <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                  {clockInTime}
                </span>
              </div>
              <div className="aspect-[4/3] w-full rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                {record.clockInSelfie ? (
                  <img
                    src={record.clockInSelfie}
                    alt={`Selfie masuk ${employee?.fullName || record.employeeId}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-slate-400 text-xs">
                    <Camera className="h-6 w-6" />
                    <span>Tidak ada foto masuk</span>
                  </div>
                )}
              </div>
              {typeof record.clockInLat === 'number' && typeof record.clockInLng === 'number' && (
                <p className="text-[11px] font-mono tabular-nums text-slate-500">
                  Koordinat: {record.clockInLat.toFixed(5)}, {record.clockInLng.toFixed(5)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">Foto Clock-Out (Pulang)</span>
                <span className="font-mono tabular-nums text-slate-700 font-semibold">
                  {clockOutTime}
                </span>
              </div>
              <div className="aspect-[4/3] w-full rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                {record.clockOutSelfie ? (
                  <img
                    src={record.clockOutSelfie}
                    alt={`Selfie pulang ${employee?.fullName || record.employeeId}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-slate-400 text-xs">
                    <Camera className="h-6 w-6" />
                    <span>{record.clockOutAt ? 'Tidak ada foto pulang' : 'Belum Clock-Out'}</span>
                  </div>
                )}
              </div>
              {typeof record.clockOutLat === 'number' && typeof record.clockOutLng === 'number' && (
                <p className="text-[11px] font-mono tabular-nums text-slate-500">
                  Koordinat: {record.clockOutLat.toFixed(5)}, {record.clockOutLng.toFixed(5)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <MapPin className="h-4 w-4 text-emerald-700 shrink-0" />
              <span>{record.gpsVerified ? 'GPS Dalam Radius Kantor' : 'Luar Radius Geofence'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Clock className="h-4 w-4 text-slate-600 shrink-0" />
              <span className="font-mono tabular-nums">Durasi: {durationLabel}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Smartphone className="h-4 w-4 text-slate-600 shrink-0" />
              <span className="truncate">{record.sourceDevice || 'Web ESS PWA'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

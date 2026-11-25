import React, { useState } from 'react';
import { X } from 'lucide-react';
import type {
  DepartmentRecord,
  EmployeeRecord,
  EmploymentStatus,
  EmploymentType,
  GenderOption,
  PositionRecord,
  ShiftRecord,
} from '../../types/hrms';
import { DEFAULT_COMPANY_ID, saveEmployeeRecord } from '../../services/hrmsFirestore';
import { getTodayISO } from '../../utils/dateFormat';

interface EmployeeFormModalProps {
  employee: EmployeeRecord | null;
  departments: DepartmentRecord[];
  positions: PositionRecord[];
  shifts: ShiftRecord[];
  employees: EmployeeRecord[];
  actorRole: string;
  onClose: () => void;
}

const AVATAR_CHOICES = [
  { label: 'Avatar 1', url: '/src/assets/images/avatar_emp_1_1795590992124.jpg' },
  { label: 'Avatar 2', url: '/src/assets/images/avatar_emp_2_1795590994249.jpg' },
  { label: 'Avatar 3', url: '/src/assets/images/avatar_emp_3_1795590993422.jpg' },
  { label: 'Avatar Admin', url: '/src/assets/images/avatar_admin_1795590992322.jpg' },
];

export const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({
  employee,
  departments,
  positions,
  shifts,
  employees,
  actorRole,
  onClose,
}) => {
  const isNew = !employee;
  const [employeeId, setEmployeeId] = useState(
    employee?.employeeId || `emp_${String(employees.length + 1).padStart(3, '0')}`
  );
  const [employeeCode, setEmployeeCode] = useState(
    employee?.employeeCode || `NDK-2026-${String(employees.length + 1).padStart(3, '0')}`
  );
  const [fullName, setFullName] = useState(employee?.fullName || '');
  const [email, setEmail] = useState(employee?.email || '');
  const [phone, setPhone] = useState(employee?.phone || '');
  const [address, setAddress] = useState(employee?.address || '');
  const [dateOfBirth, setDateOfBirth] = useState(employee?.dateOfBirth || '1995-01-01');
  const [gender, setGender] = useState<GenderOption>(employee?.gender || 'Laki-laki');
  const [photoUrl, setPhotoUrl] = useState(employee?.photoUrl || AVATAR_CHOICES[0].url);
  const [nik, setNik] = useState(employee?.nik || '');
  const [npwp, setNpwp] = useState(employee?.npwp || '');
  const [departmentId, setDepartmentId] = useState(
    employee?.departmentId || departments[0]?.departmentId || 'dept_eng'
  );
  const [positionId, setPositionId] = useState(
    employee?.positionId || positions[0]?.positionId || 'pos_swe'
  );
  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    employee?.employmentType || 'Full-Time'
  );
  const [joinDate, setJoinDate] = useState(employee?.joinDate || getTodayISO());
  const [contractStartDate, setContractStartDate] = useState(employee?.contractStartDate || '');
  const [contractEndDate, setContractEndDate] = useState(employee?.contractEndDate || '');
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>(
    employee?.employmentStatus || 'Active'
  );
  const [supervisorId, setSupervisorId] = useState(employee?.supervisorId || '');
  const [shiftId, setShiftId] = useState(employee?.shiftId || shifts[0]?.shiftId || 'shift_reg');
  const [bankName, setBankName] = useState(employee?.bankName || 'BCA');
  const [bankAccountNumber, setBankAccountNumber] = useState(employee?.bankAccountNumber || '');
  const [bankAccountHolder, setBankAccountHolder] = useState(employee?.bankAccountHolder || '');
  const [baseSalary, setBaseSalary] = useState(String(employee?.baseSalary ?? 10000000));
  const [positionAllowance, setPositionAllowance] = useState(String(employee?.positionAllowance ?? 1000000));
  const [transportAllowance, setTransportAllowance] = useState(String(employee?.transportAllowance ?? 750000));
  const [mealAllowance, setMealAllowance] = useState(String(employee?.mealAllowance ?? 650000));
  const [documentNotes, setDocumentNotes] = useState(employee?.documentNotes || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePositionChange = (nextPosId: string) => {
    setPositionId(nextPosId);
    const pos = positions.find((p) => p.positionId === nextPosId);
    if (isNew && pos) {
      setBaseSalary(String(pos.defaultBaseSalary));
      setDepartmentId(pos.departmentId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveEmployeeRecord(
        {
          employeeId,
          companyId: employee?.companyId || DEFAULT_COMPANY_ID,
          uid: employee?.uid || '',
          employeeCode,
          fullName,
          email,
          phone,
          address,
          dateOfBirth,
          gender,
          photoUrl,
          nik,
          npwp,
          departmentId,
          positionId,
          employmentType,
          joinDate,
          contractStartDate,
          contractEndDate,
          employmentStatus,
          supervisorId,
          shiftId,
          bankName,
          bankAccountNumber,
          bankAccountHolder: bankAccountHolder || fullName,
          baseSalary: Number(baseSalary) || 0,
          positionAllowance: Number(positionAllowance) || 0,
          transportAllowance: Number(transportAllowance) || 0,
          mealAllowance: Number(mealAllowance) || 0,
          documentNotes,
        },
        isNew,
        actorRole
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan data karyawan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {isNew ? 'Tambah Karyawan Baru' : `Edit Data Karyawan · ${employee.fullName}`}
            </h3>
            <p className="text-xs text-slate-500">
              Data tersinkron langsung ke portal Mobile Android &amp; ESS Web melalui Firestore.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ID Dokumen</label>
              <input
                type="text"
                required
                disabled={!isNew}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-mono disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kode Karyawan</label>
              <input
                type="text"
                required
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status Karyawan</label>
              <select
                value={employmentStatus}
                onChange={(e) => setEmploymentStatus(e.target.value as EmploymentStatus)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email (Untuk Aktivasi ESS &amp; Android)
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Telepon</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Lahir &amp; Gender</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm"
                />
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as GenderOption)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
                >
                  <option value="Laki-laki">Laki-laki</option>
                  <option value="Perempuan">Perempuan</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Domisili</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Foto Profil</label>
              <select
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
              >
                {AVATAR_CHOICES.map((c) => (
                  <option key={c.url} value={c.url}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">NIK (KTP)</label>
              <input
                type="text"
                value={nik}
                onChange={(e) => setNik(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">NPWP (Pajak)</label>
              <input
                type="text"
                value={npwp}
                onChange={(e) => setNpwp(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Departemen</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
              >
                {departments.map((d) => (
                  <option key={d.departmentId} value={d.departmentId}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jabatan</label>
              <select
                value={positionId}
                onChange={(e) => handlePositionChange(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
              >
                {positions.map((p) => (
                  <option key={p.positionId} value={p.positionId}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tipe Kontrak</label>
              <select
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
              >
                <option value="Full-Time">Full-Time</option>
                <option value="Contract">Contract</option>
                <option value="Probation">Probation</option>
                <option value="Intern">Intern</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Bergabung</label>
              <input
                type="date"
                required
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Mulai Kontrak</label>
              <input
                type="date"
                value={contractStartDate}
                onChange={(e) => setContractStartDate(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Akhir Kontrak</label>
              <input
                type="date"
                value={contractEndDate}
                onChange={(e) => setContractEndDate(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Atasan Langsung (Supervisor)</label>
              <select
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
              >
                <option value="">Tidak ada</option>
                {employees
                  .filter((e) => e.employeeId !== employeeId)
                  .map((e) => (
                    <option key={e.employeeId} value={e.employeeId}>
                      {e.fullName} ({e.employeeCode})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jadwal Shift Kerja</label>
              <select
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
              >
                {shifts.map((s) => (
                  <option key={s.shiftId} value={s.shiftId}>
                    {s.name} ({s.startTime}–{s.endTime})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Bank</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">No. Rekening</label>
              <input
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Pemilik Rekening</label>
              <input
                type="text"
                value={bankAccountHolder}
                onChange={(e) => setBankAccountHolder(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Gaji Pokok (IDR)</label>
              <input
                type="number"
                min={0}
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tunj. Jabatan</label>
              <input
                type="number"
                min={0}
                value={positionAllowance}
                onChange={(e) => setPositionAllowance(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tunj. Transport</label>
              <input
                type="number"
                min={0}
                value={transportAllowance}
                onChange={(e) => setTransportAllowance(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tunj. Makan</label>
              <input
                type="number"
                min={0}
                value={mealAllowance}
                onChange={(e) => setMealAllowance(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Catatan Dokumen &amp; Riwayat Kerja
            </label>
            <textarea
              rows={2}
              value={documentNotes}
              onChange={(e) => setDocumentNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : isNew ? 'Simpan Karyawan' : 'Perbarui Data'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

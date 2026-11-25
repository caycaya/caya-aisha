import React, { useState } from 'react';
import { Download, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  RBAC_MATRIX,
  hasPermission,
  type AnnouncementCategory,
  type AnnouncementRecord,
  type AttendanceRecord,
  type AuditLogRecord,
  type DepartmentRecord,
  type EmployeeRecord,
  type LeaveRequestRecord,
  type PayslipRecord,
  type PerformanceRating,
  type PerformanceReviewRecord,
  type PositionRecord,
  type ShiftRecord,
  type SystemSettingsRecord,
  type UserAccountRecord,
  type UserRole,
} from '../../types/hrms';
import {
  DEFAULT_COMPANY_ID,
  deleteAnnouncement,
  makeId,
  publishAnnouncement,
  saveDepartmentRecord,
  savePerformanceReview,
  savePositionRecord,
  saveShiftRecord,
  saveSystemSettings,
  toJsDate,
  updateUserAccountRoleStatus,
} from '../../services/hrmsFirestore';
import { buildPayslipSummaryCSV } from '../../services/payrollCalculator';
import { formatIDR } from '../../utils/currency';
import { formatDateDMY, formatDateTimeDMY } from '../../utils/dateFormat';

export const DepartmentsPanel: React.FC<{
  departments: DepartmentRecord[];
  employees: EmployeeRecord[];
  role: UserRole;
}> = ({ departments, employees, role }) => {
  const canEdit = hasPermission(role, 'departments', 'create');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [headEmployeeId, setHeadEmployeeId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    setBusy(true);
    try {
      await saveDepartmentRecord(
        {
          departmentId: `dept_${code.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          companyId: DEFAULT_COMPANY_ID,
          code,
          name,
          headEmployeeId,
          description,
        },
        true,
        role
      );
      setCode('');
      setName('');
      setHeadEmployeeId('');
      setDescription('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-slate-200 p-5 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Kode</label>
            <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="MKT" className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono uppercase" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nama Departemen</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing & Growth" className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Kepala Departemen</label>
            <select value={headEmployeeId} onChange={(e) => setHeadEmployeeId(e.target.value)} className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white">
              <option value="">Belum ditetapkan</option>
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>{e.fullName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Deskripsi</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ruang lingkup" className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm" />
          </div>
          <button type="submit" disabled={busy} className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            <span>Tambah Departemen</span>
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
            <tr>
              <th className="px-5 py-3 font-medium">Kode</th>
              <th className="px-5 py-3 font-medium">Nama Departemen</th>
              <th className="px-5 py-3 font-medium">Kepala</th>
              <th className="px-5 py-3 font-medium">Keterangan</th>
              <th className="px-5 py-3 font-medium text-right">Jumlah Karyawan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {departments.map((d) => {
              const head = employees.find((e) => e.employeeId === d.headEmployeeId);
              const count = employees.filter((e) => e.departmentId === d.departmentId).length;
              return (
                <tr key={d.departmentId} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-700">{d.code}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{d.name}</td>
                  <td className="px-5 py-3.5 text-slate-600">{head?.fullName || '-'}</td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs">{d.description || '-'}</td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums font-semibold text-slate-900">{count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PositionsPanel: React.FC<{
  positions: PositionRecord[];
  departments: DepartmentRecord[];
  role: UserRole;
}> = ({ positions, departments, role }) => {
  const canEdit = hasPermission(role, 'positions', 'create');
  const [title, setTitle] = useState('');
  const [departmentId, setDepartmentId] = useState(departments[0]?.departmentId || 'dept_eng');
  const [grade, setGrade] = useState('L3');
  const [defaultBaseSalary, setDefaultBaseSalary] = useState('10000000');
  const [busy, setBusy] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await savePositionRecord(
        {
          positionId: makeId('pos'),
          companyId: DEFAULT_COMPANY_ID,
          departmentId,
          title,
          grade,
          defaultBaseSalary: Number(defaultBaseSalary) || 0,
          description: `${title} (${grade})`,
        },
        true,
        role
      );
      setTitle('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-slate-200 p-5 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nama Jabatan</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product Designer" className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Departemen</label>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white">
              {departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Grade / Level</label>
            <input value={grade} onChange={(e) => setGrade(e.target.value)} className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Standar Gaji Pokok</label>
            <input type="number" min={0} value={defaultBaseSalary} onChange={(e) => setDefaultBaseSalary(e.target.value)} className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono" />
          </div>
          <button type="submit" disabled={busy} className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            <span>Tambah Jabatan</span>
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
            <tr>
              <th className="px-5 py-3 font-medium">Jabatan</th>
              <th className="px-5 py-3 font-medium">Departemen</th>
              <th className="px-5 py-3 font-medium">Grade</th>
              <th className="px-5 py-3 font-medium text-right">Standar Gaji Pokok</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {positions.map((p) => {
              const dept = departments.find((d) => d.departmentId === p.departmentId);
              return (
                <tr key={p.positionId} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3.5 font-medium text-slate-900">{p.title}</td>
                  <td className="px-5 py-3.5 text-slate-600">{dept?.name || p.departmentId}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-700">{p.grade || '-'}</td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums font-semibold text-slate-900">{formatIDR(p.defaultBaseSalary)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const ShiftsPanel: React.FC<{
  shifts: ShiftRecord[];
  role: UserRole;
}> = ({ shifts, role }) => {
  const canEdit = hasPermission(role, 'shifts', 'create');
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [breakMinutes, setBreakMinutes] = useState('60');
  const [lateToleranceMinutes, setLateToleranceMinutes] = useState('15');
  const [workDaysLabel, setWorkDaysLabel] = useState('Senin - Jumat');
  const [isHoliday, setIsHoliday] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await saveShiftRecord(
      {
        shiftId: makeId('shift'),
        companyId: DEFAULT_COMPANY_ID,
        name,
        startTime,
        endTime,
        breakMinutes: Number(breakMinutes) || 60,
        lateToleranceMinutes: Number(lateToleranceMinutes) || 15,
        workDaysLabel,
        isHoliday,
      },
      true,
      role
    );
    setName('');
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-slate-200 p-5 grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Nama Shift / Hari Kerja</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Shift Siang / Libur Nasional" className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Jam Masuk</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Jam Pulang</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Istirahat / Toleransi (mnt)</label>
            <div className="grid grid-cols-2 gap-1.5">
              <input type="number" min={0} value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} className="w-full min-h-[40px] rounded-xl border border-slate-200 px-2 text-xs font-mono" />
              <input type="number" min={0} value={lateToleranceMinutes} onChange={(e) => setLateToleranceMinutes(e.target.value)} className="w-full min-h-[40px] rounded-xl border border-slate-200 px-2 text-xs font-mono" />
            </div>
          </div>
          <button type="submit" className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            <span>Simpan Shift</span>
          </button>
          <div className="sm:col-span-3">
            <input value={workDaysLabel} onChange={(e) => setWorkDaysLabel(e.target.value)} placeholder="Senin - Jumat" className="w-full min-h-[38px] rounded-xl border border-slate-200 px-3 text-xs" />
          </div>
          <label className="sm:col-span-3 flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={isHoliday} onChange={(e) => setIsHoliday(e.target.checked)} className="rounded" />
            <span>Tandai sebagai jadwal hari libur / non-operasional</span>
          </label>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
            <tr>
              <th className="px-5 py-3 font-medium">Nama Shift</th>
              <th className="px-5 py-3 font-medium">Jam Kerja</th>
              <th className="px-5 py-3 font-medium">Istirahat</th>
              <th className="px-5 py-3 font-medium">Toleransi Terlambat</th>
              <th className="px-5 py-3 font-medium">Hari Berlaku</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shifts.map((s) => (
              <tr key={s.shiftId} className="hover:bg-slate-50/60">
                <td className="px-5 py-3.5 font-medium text-slate-900">
                  {s.name} {s.isHoliday ? '· Libur' : ''}
                </td>
                <td className="px-5 py-3.5 font-mono tabular-nums text-slate-700">{s.startTime} – {s.endTime}</td>
                <td className="px-5 py-3.5 font-mono tabular-nums text-slate-600">{s.breakMinutes} menit</td>
                <td className="px-5 py-3.5 font-mono tabular-nums text-slate-600">{s.lateToleranceMinutes} menit</td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{s.workDaysLabel || 'Senin - Jumat'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PerformancePanel: React.FC<{
  reviews: PerformanceReviewRecord[];
  employees: EmployeeRecord[];
  role: UserRole;
}> = ({ reviews, employees, role }) => {
  const canCreate = hasPermission(role, 'performance', 'create');
  const [employeeId, setEmployeeId] = useState(employees[0]?.employeeId || '');
  const [cycleLabel, setCycleLabel] = useState('H2 2026 Review');
  const [kpiScore, setKpiScore] = useState('88');
  const [competencyScore, setCompetencyScore] = useState('85');
  const [overallRating, setOverallRating] = useState<PerformanceRating>('Meets');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find((item) => item.employeeId === employeeId) || employees[0];
    if (!emp) return;
    await savePerformanceReview(
      {
        reviewId: makeId('perf'),
        companyId: emp.companyId,
        employeeId: emp.employeeId,
        uid: emp.uid || '',
        cycleLabel,
        kpiScore: Number(kpiScore) || 0,
        competencyScore: Number(competencyScore) || 0,
        overallRating,
        strengths,
        improvements,
        status: 'Submitted',
      },
      true,
      role
    );
    setStrengths('');
    setImprovements('');
  };

  return (
    <div className="space-y-6">
      {canCreate && employees.length > 0 && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Catat Evaluasi Kinerja Karyawan</h3>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <select value={employeeId || employees[0]?.employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white">
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>{e.fullName}</option>
              ))}
            </select>
            <input required value={cycleLabel} onChange={(e) => setCycleLabel(e.target.value)} placeholder="Periode" className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm" />
            <input type="number" min={0} max={100} value={kpiScore} onChange={(e) => setKpiScore(e.target.value)} placeholder="KPI (0-100)" className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono" />
            <input type="number" min={0} max={100} value={competencyScore} onChange={(e) => setCompetencyScore(e.target.value)} placeholder="Kompetensi" className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono" />
            <select value={overallRating} onChange={(e) => setOverallRating(e.target.value as PerformanceRating)} className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white">
              <option value="Exceeds">Exceeds</option>
              <option value="Meets">Meets</option>
              <option value="Needs Improvement">Needs Improvement</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="Kekuatan & pencapaian utama" className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm" />
            <input value={improvements} onChange={(e) => setImprovements(e.target.value)} placeholder="Area pengembangan" className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm" />
          </div>
          <button type="submit" className="min-h-[40px] px-4 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800">
            Kirim Evaluasi Kinerja
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
            <tr>
              <th className="px-5 py-3 font-medium">Karyawan</th>
              <th className="px-5 py-3 font-medium">Siklus</th>
              <th className="px-5 py-3 font-medium text-right">KPI / Kompetensi</th>
              <th className="px-5 py-3 font-medium">Penilaian</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reviews.map((r) => {
              const emp = employees.find((e) => e.employeeId === r.employeeId);
              return (
                <tr key={r.reviewId} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3.5 font-medium text-slate-900">{emp?.fullName || r.employeeId}</td>
                  <td className="px-5 py-3.5 text-slate-600">{r.cycleLabel}</td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-800">{r.kpiScore} / {r.competencyScore ?? '-'}</td>
                  <td className="px-5 py-3.5 font-medium text-emerald-700">{r.overallRating}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">{r.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const AnnouncementsPanel: React.FC<{
  announcements: AnnouncementRecord[];
  role: UserRole;
}> = ({ announcements, role }) => {
  const canCreate = hasPermission(role, 'announcements', 'create');
  const canDelete = hasPermission(role, 'announcements', 'delete');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('Policy');

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    await publishAnnouncement({ companyId: DEFAULT_COMPANY_ID, title, body, category }, role);
    setTitle('');
    setBody('');
  };

  return (
    <div className="space-y-6">
      {canCreate && (
        <form onSubmit={handlePublish} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Terbitkan Pengumuman Perusahaan</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul pengumuman" className="sm:col-span-2 min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm" />
            <select value={category} onChange={(e) => setCategory(e.target.value as AnnouncementCategory)} className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white">
              <option value="Policy">Policy</option>
              <option value="Payroll">Payroll</option>
              <option value="Event">Event</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
          <textarea required rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Isi pengumuman untuk seluruh karyawan..." className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
          <button type="submit" className="min-h-[40px] px-4 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800">
            Publikasikan Sekarang
          </button>
        </form>
      )}

      <div className="space-y-3">
        {announcements.map((a) => (
          <div key={a.announcementId} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500">
                {a.category} · {formatDateDMY(toJsDate(a.publishedAt) || toJsDate(a.createdAt))}
              </p>
              <h4 className="text-base font-semibold text-slate-900">{a.title}</h4>
              <p className="text-sm text-slate-600 leading-relaxed">{a.body}</p>
            </div>
            {canDelete && (
              <button
                type="button"
                onClick={() => deleteAnnouncement(a.announcementId, role)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title="Hapus pengumuman"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export const ReportsPanel: React.FC<{
  employees: EmployeeRecord[];
  departments: DepartmentRecord[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequestRecord[];
  payslips: PayslipRecord[];
}> = ({ employees, departments, attendance, leaves, payslips }) => {
  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAttendanceCSV = () => {
    const header = 'AttendanceID,EmployeeID,WorkDate,Status,LateMinutes,WorkMinutes,GPSVerified';
    const rows = attendance.map((a) =>
      [a.attendanceId, a.employeeId, a.workDate, a.status, a.lateMinutes ?? 0, a.workMinutes ?? 0, a.gpsVerified ? 'Ya' : 'Tidak'].join(',')
    );
    downloadCSV('laporan-presensi-kerjapay.csv', [header, ...rows].join('\n'));
  };

  const exportLeaveCSV = () => {
    const header = 'LeaveID,EmployeeID,Type,StartDate,EndDate,Days,Status';
    const rows = leaves.map((l) =>
      [l.leaveRequestId, l.employeeId, l.leaveType, l.startDate, l.endDate, l.totalDays, l.status].join(',')
    );
    downloadCSV('laporan-cuti-kerjapay.csv', [header, ...rows].join('\n'));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Laporan Kehadiran</h3>
          <p className="text-xs text-slate-500">Ekspor catatan presensi, keterlambatan, dan durasi kerja.</p>
          <button type="button" onClick={exportAttendanceCSV} className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800">
            <Download className="h-4 w-4" />
            <span>Unduh CSV Presensi</span>
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Laporan Cuti Karyawan</h3>
          <p className="text-xs text-slate-500">Rekap pengajuan cuti, persetujuan supervisor, dan sisa kuota.</p>
          <button type="button" onClick={exportLeaveCSV} className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800">
            <Download className="h-4 w-4" />
            <span>Unduh CSV Cuti</span>
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Rekap Payroll &amp; Pajak</h3>
          <p className="text-xs text-slate-500">Ekspor gaji bruto, potongan BPJS, PPh 21, dan gaji bersih.</p>
          <button
            type="button"
            onClick={() => downloadCSV('laporan-payroll-kerjapay.csv', buildPayslipSummaryCSV(payslips))}
            className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <Download className="h-4 w-4" />
            <span>Unduh CSV Payroll</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">Distribusi Karyawan &amp; Estimasi Beban Gaji per Departemen</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="py-2.5 font-medium">Departemen</th>
                <th className="py-2.5 font-medium text-right">Aktif</th>
                <th className="py-2.5 font-medium text-right">Total Gaji Pokok Bulanan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departments.map((d) => {
                const deptEmps = employees.filter((e) => e.departmentId === d.departmentId && e.employmentStatus === 'Active');
                const sumBase = deptEmps.reduce((acc, e) => acc + (e.baseSalary || 0), 0);
                return (
                  <tr key={d.departmentId}>
                    <td className="py-3 font-medium text-slate-900">{d.name}</td>
                    <td className="py-3 text-right font-mono tabular-nums text-slate-700">{deptEmps.length}</td>
                    <td className="py-3 text-right font-mono tabular-nums font-semibold text-slate-900">{formatIDR(sumBase)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const AuditLogsPanel: React.FC<{ logs: AuditLogRecord[] }> = ({ logs }) => {
  const [search, setSearch] = useState('');
  const filtered = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.summary.toLowerCase().includes(search.toLowerCase()) ||
      (l.actorEmail || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari aksi, aktor, atau deskripsi audit log..."
          className="w-full max-w-md min-h-[40px] rounded-xl border border-slate-200 px-3.5 text-sm"
        />
        <span className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
          {filtered.length} catatan permanen
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
            <tr>
              <th className="px-5 py-3 font-medium">Waktu</th>
              <th className="px-5 py-3 font-medium">Aktor</th>
              <th className="px-5 py-3 font-medium">Aksi</th>
              <th className="px-5 py-3 font-medium">Target</th>
              <th className="px-5 py-3 font-medium">Ringkasan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((l) => (
              <tr key={l.logId} className="hover:bg-slate-50/60">
                <td className="px-5 py-3 text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                  {formatDateTimeDMY(toJsDate(l.createdAt))}
                </td>
                <td className="px-5 py-3 text-xs text-slate-700">
                  {l.actorEmail || l.actorUid} · {l.actorRole}
                </td>
                <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-900">{l.action}</td>
                <td className="px-5 py-3 font-mono text-xs text-slate-500">
                  {l.targetCollection}/{l.targetId}
                </td>
                <td className="px-5 py-3 text-xs text-slate-600">{l.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const SettingsAndRbacPanel: React.FC<{
  settings: SystemSettingsRecord | undefined;
  users: UserAccountRecord[];
  employees: EmployeeRecord[];
  role: UserRole;
}> = ({ settings, users, employees, role }) => {
  const isSuperAdmin = role === 'Super Admin';
  const [form, setForm] = useState<SystemSettingsRecord | null>(settings || null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    await saveSystemSettings(form, role);
    setSavedMsg('Pengaturan PPh 21, BPJS, dan Geofence kantor berhasil disimpan ke Firestore.');
    setTimeout(() => setSavedMsg(null), 4000);
  };

  return (
    <div className="space-y-6">
      {form && (
        <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Konfigurasi Payroll Indonesia &amp; Geofence Kehadiran
              </h3>
              <p className="text-xs text-slate-500">
                Berlaku efektif tanggal {formatDateDMY(form.effectiveDate)} · Hanya Super Admin yang dapat mengubah.
              </p>
            </div>
            {savedMsg && <span className="text-xs font-medium text-emerald-700">{savedMsg}</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Efektif</label>
              <input
                type="date"
                disabled={!isSuperAdmin}
                value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Metode PPh 21</label>
              <select
                disabled={!isSuperAdmin}
                value={form.pph21Method}
                onChange={(e) => setForm({ ...form, pph21Method: e.target.value as 'TER' | 'Progressive' })}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
              >
                <option value="TER">TER (Tarif Efektif Rata-Rata)</option>
                <option value="Progressive">Progressive Pasal 17</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Pengali Lembur / Jam</label>
              <input
                type="number"
                step="0.1"
                min={1}
                disabled={!isSuperAdmin}
                value={form.overtimeHourlyMultiplier}
                onChange={(e) => setForm({ ...form, overtimeHourlyMultiplier: Number(e.target.value) })}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">BPJS Kes (Karyawan)</label>
              <input
                type="number"
                step="0.005"
                disabled={!isSuperAdmin}
                value={form.bpjsHealthEmployeeRate}
                onChange={(e) => setForm({ ...form, bpjsHealthEmployeeRate: Number(e.target.value) })}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">BPJS JHT (Karyawan)</label>
              <input
                type="number"
                step="0.005"
                disabled={!isSuperAdmin}
                value={form.bpjsJhtEmployeeRate}
                onChange={(e) => setForm({ ...form, bpjsJhtEmployeeRate: Number(e.target.value) })}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">BPJS JP (Karyawan)</label>
              <input
                type="number"
                step="0.005"
                disabled={!isSuperAdmin}
                value={form.bpjsJpEmployeeRate}
                onChange={(e) => setForm({ ...form, bpjsJpEmployeeRate: Number(e.target.value) })}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">PTKP Tahunan (IDR)</label>
              <input
                type="number"
                disabled={!isSuperAdmin}
                value={form.pph21PtkpAnnual ?? 54000000}
                onChange={(e) => setForm({ ...form, pph21PtkpAnnual: Number(e.target.value) })}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Latitude Kantor</label>
              <input
                type="number"
                step="0.0001"
                disabled={!isSuperAdmin}
                value={form.officeLat ?? -6.225}
                onChange={(e) => setForm({ ...form, officeLat: Number(e.target.value) })}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Longitude Kantor</label>
              <input
                type="number"
                step="0.0001"
                disabled={!isSuperAdmin}
                value={form.officeLng ?? 106.8097}
                onChange={(e) => setForm({ ...form, officeLng: Number(e.target.value) })}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Radius Geofence (meter)</label>
              <input
                type="number"
                min={50}
                disabled={!isSuperAdmin}
                value={form.maxGeofenceMeters ?? 500}
                onChange={(e) => setForm({ ...form, maxGeofenceMeters: Number(e.target.value) })}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={Boolean(form.requireGpsAttendance)}
                  onChange={(e) => setForm({ ...form, requireGpsAttendance: e.target.checked })}
                />
                <span>Wajib GPS</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={Boolean(form.requireSelfieAttendance)}
                  onChange={(e) => setForm({ ...form, requireSelfieAttendance: e.target.checked })}
                />
                <span>Wajib Selfie</span>
              </label>
            </div>
          </div>

          {isSuperAdmin && (
            <button type="submit" className="min-h-[42px] px-5 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800">
              Simpan Pengaturan Sistem
            </button>
          )}
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-700" />
          <h3 className="text-base font-semibold text-slate-900">Manajemen Akun &amp; Peran RBAC</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="py-2.5 font-medium">Pengguna</th>
                <th className="py-2.5 font-medium">Email</th>
                <th className="py-2.5 font-medium">Karyawan Terkait</th>
                <th className="py-2.5 font-medium">Peran RBAC</th>
                <th className="py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.uid}>
                  <td className="py-3 font-medium text-slate-900">{u.displayName}</td>
                  <td className="py-3 text-xs text-slate-600">{u.email}</td>
                  <td className="py-3 text-xs">
                    {isSuperAdmin ? (
                      <select
                        value={u.employeeId || ''}
                        onChange={(e) =>
                          updateUserAccountRoleStatus(u.uid, u.role, u.status, role, e.target.value)
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs bg-white"
                      >
                        <option value="">Tidak ditautkan</option>
                        {employees.map((emp) => (
                          <option key={emp.employeeId} value={emp.employeeId}>
                            {emp.fullName} ({emp.employeeCode})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{u.employeeId || '-'}</span>
                    )}
                  </td>
                  <td className="py-3 text-xs">
                    {isSuperAdmin ? (
                      <select
                        value={u.role}
                        onChange={(e) =>
                          updateUserAccountRoleStatus(u.uid, e.target.value as UserRole, u.status, role)
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs bg-white font-medium"
                      >
                        {(['Super Admin', 'HR Admin', 'Management', 'Supervisor', 'Employee'] as UserRole[]).map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-medium">{u.role}</span>
                    )}
                  </td>
                  <td className="py-3 text-xs">
                    {isSuperAdmin ? (
                      <button
                        type="button"
                        onClick={() =>
                          updateUserAccountRoleStatus(
                            u.uid,
                            u.role,
                            u.status === 'active' ? 'inactive' : 'active',
                            role
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                          u.status === 'active'
                            ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                            : 'border-rose-200 text-rose-700 bg-rose-50'
                        }`}
                      >
                        {u.status}
                      </button>
                    ) : (
                      <span>{u.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Matriks Izin Role-Based Access Control (RBAC)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 font-medium">Peran</th>
                <th className="py-2 font-medium">Karyawan</th>
                <th className="py-2 font-medium">Presensi &amp; Cuti</th>
                <th className="py-2 font-medium">Payroll</th>
                <th className="py-2 font-medium">Audit &amp; Pengaturan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(Object.keys(RBAC_MATRIX) as UserRole[]).map((r) => (
                <tr key={r}>
                  <td className="py-2.5 font-semibold text-slate-900">{r}</td>
                  <td className="py-2.5 text-slate-600">{RBAC_MATRIX[r].employees.join(', ') || 'Tidak ada'}</td>
                  <td className="py-2.5 text-slate-600">{RBAC_MATRIX[r].leave.join(', ') || 'Tidak ada'}</td>
                  <td className="py-2.5 text-slate-600">{RBAC_MATRIX[r].payroll.join(', ') || 'Pribadi saja'}</td>
                  <td className="py-2.5 text-slate-600">{RBAC_MATRIX[r].settings.join(', ') || 'Tidak ada'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

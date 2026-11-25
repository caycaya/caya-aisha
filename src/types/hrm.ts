export type Role = 'admin' | 'employee';

export interface AuthSession {
  token: string;
  role: Role;
  user: AdminUser | EmployeeProfile;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  avatar_url: string;
}

export interface Position {
  id: number;
  title: string;
  department: string;
  default_daily_rate: number;
  description: string;
  employee_count?: number;
}

export interface EmployeeProfile {
  id: number;
  nik: string;
  full_name: string;
  email: string;
  ess_enabled: number;
  has_password?: boolean;
  phone: string;
  position_id: number;
  position_title?: string;
  department?: string;
  daily_rate: number;
  join_date: string; // YYYY-MM-DD
  bank_name: string;
  bank_account: string;
  leave_quota: number;
  status: 'Aktif' | 'Nonaktif';
  avatar_url: string;
}

export interface WorkSchedule {
  day_of_week: number; // 0 = Minggu ... 6 = Sabtu
  day_name: string;
  is_work_day: number; // 0 | 1
  clock_in_time: string; // HH:MM
  clock_out_time: string; // HH:MM
  late_tolerance_min: number;
}

export interface Holiday {
  id: number;
  holiday_date: string; // YYYY-MM-DD
  name: string;
}

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_nik?: string;
  position_title?: string;
  avatar_url?: string;
  work_date: string; // YYYY-MM-DD
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_photo: string;
  clock_out_photo: string | null;
  clock_in_note: string;
  clock_out_note: string;
  status: 'Hadir' | 'Terlambat' | 'Pulang Awal' | 'Alpa';
  work_minutes: number;
  daily_rate_snapshot: number;
}

export interface LeaveRequest {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_nik?: string;
  position_title?: string;
  avatar_url?: string;
  leave_type: 'Cuti Tahunan' | 'Izin Sakit' | 'Izin Khusus';
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  total_days: number;
  reason: string;
  status: 'Menunggu' | 'Disetujui' | 'Ditolak';
  admin_note: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface PayrollItem {
  id: number;
  payroll_run_id: number;
  employee_id: number;
  employee_name?: string;
  employee_nik?: string;
  position_title?: string;
  department?: string;
  bank_name?: string;
  bank_account?: string;
  days_worked: number;
  daily_rate: number;
  base_pay: number;
  allowance: number;
  deduction: number;
  net_pay: number;
  attended_dates_json: string;
  status: 'Draft' | 'Dibayar';
  period_label?: string;
  start_date?: string;
  end_date?: string;
  paid_at?: string | null;
}

export interface PayrollRun {
  id: number;
  period_label: string;
  start_date: string;
  end_date: string;
  status: 'Draft' | 'Dibayar';
  total_amount: number;
  created_by: string;
  created_at: string;
  paid_at: string | null;
  items?: PayrollItem[];
}

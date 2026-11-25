import type {
  AdminUser,
  AttendanceRecord,
  EmployeeProfile,
  Holiday,
  LeaveRequest,
  PayrollRun,
  PayrollItem,
  Position,
  Role,
  WorkSchedule,
} from '../types/hrm';

let authToken: string | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
}

export function getApiToken(): string | null {
  return authToken;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Permintaan gagal (${res.status})`);
  }
  return data as T;
}

export const authApi = {
  getStatus: () =>
    apiFetch<{ adminConfigured: boolean; hasRegisteredAdmin: boolean; envPasscodeActive: boolean }>('/api/auth/status'),
  setupAdmin: (payload: { name: string; email: string; password: string }) =>
    apiFetch<{ token: string; role: 'admin'; user: AdminUser }>('/api/auth/admin/setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  loginAdmin: (payload: { email: string; password: string }) =>
    apiFetch<{ token: string; role: 'admin'; user: AdminUser }>('/api/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  loginEmployee: (payload: { email: string; password: string }) =>
    apiFetch<{ token: string; role: 'employee'; user: EmployeeProfile }>('/api/auth/employee/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  me: () => apiFetch<{ role: Role; user: AdminUser | EmployeeProfile }>('/api/auth/me'),
};

export interface AdminOverviewResponse {
  today: string;
  totalEmployees: number;
  essActiveCount: number;
  presentToday: number;
  lateToday: number;
  pendingLeaves: number;
  estPayrollMonth: number;
  recentAttendances: AttendanceRecord[];
}

export const adminApi = {
  getOverview: () => apiFetch<AdminOverviewResponse>('/api/admin/overview'),
  getPositions: () => apiFetch<Position[]>('/api/admin/positions'),
  createPosition: (payload: Omit<Position, 'id' | 'employee_count'>) =>
    apiFetch<Position>('/api/admin/positions', { method: 'POST', body: JSON.stringify(payload) }),
  updatePosition: (id: number, payload: Omit<Position, 'id' | 'employee_count'>) =>
    apiFetch<Position>(`/api/admin/positions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deletePosition: (id: number) => apiFetch<{ ok: boolean }>(`/api/admin/positions/${id}`, { method: 'DELETE' }),

  getEmployees: () => apiFetch<EmployeeProfile[]>('/api/admin/employees'),
  createEmployee: (payload: Record<string, unknown>) =>
    apiFetch<EmployeeProfile>('/api/admin/employees', { method: 'POST', body: JSON.stringify(payload) }),
  updateEmployee: (id: number, payload: Record<string, unknown>) =>
    apiFetch<EmployeeProfile>(`/api/admin/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateEmployeeCredentials: (
    id: number,
    payload: { email: string; password?: string; ess_enabled: boolean }
  ) =>
    apiFetch<EmployeeProfile>(`/api/admin/employees/${id}/credentials`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteEmployee: (id: number) => apiFetch<{ ok: boolean }>(`/api/admin/employees/${id}`, { method: 'DELETE' }),

  getSchedules: () => apiFetch<{ schedules: WorkSchedule[]; holidays: Holiday[] }>('/api/admin/schedules'),
  updateSchedules: (schedules: WorkSchedule[]) =>
    apiFetch<WorkSchedule[]>('/api/admin/schedules', { method: 'PUT', body: JSON.stringify({ schedules }) }),
  addHoliday: (payload: { holiday_date: string; name: string }) =>
    apiFetch<Holiday[]>('/api/admin/holidays', { method: 'POST', body: JSON.stringify(payload) }),
  deleteHoliday: (id: number) => apiFetch<{ ok: boolean }>(`/api/admin/holidays/${id}`, { method: 'DELETE' }),

  getAttendances: (params?: { date?: string; month?: string }) => {
    const qs = new URLSearchParams();
    if (params?.date) qs.set('date', params.date);
    if (params?.month) qs.set('month', params.month);
    const q = qs.toString();
    return apiFetch<AttendanceRecord[]>(`/api/admin/attendances${q ? `?${q}` : ''}`);
  },
  updateAttendanceStatus: (id: number, status: AttendanceRecord['status']) =>
    apiFetch<AttendanceRecord>(`/api/admin/attendances/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  getLeaves: () => apiFetch<LeaveRequest[]>('/api/admin/leaves'),
  reviewLeave: (id: number, payload: { status: 'Disetujui' | 'Ditolak'; admin_note: string }) =>
    apiFetch<LeaveRequest>(`/api/admin/leaves/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  getPayrollRuns: () => apiFetch<PayrollRun[]>('/api/admin/payroll'),
  generatePayroll: (payload: { period_label: string; start_date: string; end_date: string }) =>
    apiFetch<PayrollRun>('/api/admin/payroll/generate', { method: 'POST', body: JSON.stringify(payload) }),
  updatePayrollItem: (itemId: number, payload: { allowance: number; deduction: number }) =>
    apiFetch<PayrollItem>(`/api/admin/payroll/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  finalizePayrollRun: (runId: number) =>
    apiFetch<{ ok: boolean }>(`/api/admin/payroll/${runId}/finalize`, { method: 'POST' }),
};

export interface EssDashboardResponse {
  today: string;
  profile: EmployeeProfile;
  todayAttendance: AttendanceRecord | null;
  todaySchedule: WorkSchedule;
  schedules: WorkSchedule[];
  monthSummary: {
    daysPresent: number;
    lateCount: number;
    estimatedEarningsMonth: number;
  };
  recentLeaves: LeaveRequest[];
}

export const essApi = {
  getDashboard: () => apiFetch<EssDashboardResponse>('/api/ess/dashboard'),
  getAttendances: (month?: string) =>
    apiFetch<AttendanceRecord[]>(`/api/ess/attendances${month ? `?month=${encodeURIComponent(month)}` : ''}`),
  clockIn: (payload: { photo: string; note: string }) =>
    apiFetch<AttendanceRecord>('/api/ess/clock-in', { method: 'POST', body: JSON.stringify(payload) }),
  clockOut: (payload: { photo: string; note: string }) =>
    apiFetch<AttendanceRecord>('/api/ess/clock-out', { method: 'POST', body: JSON.stringify(payload) }),
  getLeaves: () => apiFetch<LeaveRequest[]>('/api/ess/leaves'),
  createLeave: (payload: {
    leave_type: LeaveRequest['leave_type'];
    start_date: string;
    end_date: string;
    reason: string;
  }) => apiFetch<LeaveRequest>('/api/ess/leaves', { method: 'POST', body: JSON.stringify(payload) }),
  getPayrollSlips: () => apiFetch<PayrollItem[]>('/api/ess/payroll-slips'),
};

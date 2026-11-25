import express, { type Request, type Response, type NextFunction } from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const TOKEN_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'hrm.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema Initialization ---
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    default_daily_rate INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nik TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    ess_enabled INTEGER NOT NULL DEFAULT 0,
    phone TEXT NOT NULL DEFAULT '',
    position_id INTEGER NOT NULL,
    daily_rate INTEGER NOT NULL DEFAULT 0,
    join_date TEXT NOT NULL,
    bank_name TEXT NOT NULL DEFAULT '',
    bank_account TEXT NOT NULL DEFAULT '',
    leave_quota INTEGER NOT NULL DEFAULT 12,
    status TEXT NOT NULL DEFAULT 'Aktif',
    avatar_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (position_id) REFERENCES positions(id)
  );

  CREATE TABLE IF NOT EXISTS work_schedules (
    day_of_week INTEGER PRIMARY KEY,
    day_name TEXT NOT NULL,
    is_work_day INTEGER NOT NULL DEFAULT 1,
    clock_in_time TEXT NOT NULL DEFAULT '08:30',
    clock_out_time TEXT NOT NULL DEFAULT '17:30',
    late_tolerance_min INTEGER NOT NULL DEFAULT 15
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    holiday_date TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    clock_in_at TEXT NOT NULL,
    clock_out_at TEXT,
    clock_in_photo TEXT NOT NULL,
    clock_out_photo TEXT,
    clock_in_note TEXT NOT NULL DEFAULT '',
    clock_out_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Hadir',
    work_minutes INTEGER NOT NULL DEFAULT 0,
    daily_rate_snapshot INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(employee_id, work_date),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    leave_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    total_days INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Menunggu',
    admin_note TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payroll_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_label TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    total_amount INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    paid_at TEXT
  );

  CREATE TABLE IF NOT EXISTS payroll_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payroll_run_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    days_worked INTEGER NOT NULL DEFAULT 0,
    daily_rate INTEGER NOT NULL DEFAULT 0,
    base_pay INTEGER NOT NULL DEFAULT 0,
    allowance INTEGER NOT NULL DEFAULT 0,
    deduction INTEGER NOT NULL DEFAULT 0,
    net_pay INTEGER NOT NULL DEFAULT 0,
    attended_dates_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'Draft',
    FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  );
`);

// --- Seed Initial Reference Data (Positions, Schedules, Sample Employees/Logs) ---
function seedInitialData() {
  const nowIso = new Date().toISOString();
  const posCount = db.prepare('SELECT COUNT(*) AS c FROM positions').get() as { c: number };
  if (posCount.c === 0) {
    const insertPos = db.prepare(
      'INSERT INTO positions (title, department, default_daily_rate, description, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    insertPos.run('Software Engineer', 'Teknologi & Produk', 350000, 'Pengembangan aplikasi web dan layanan backend', nowIso);
    insertPos.run('Product Designer', 'Teknologi & Produk', 300000, 'Desain pengalaman pengguna dan antarmuka', nowIso);
    insertPos.run('Operations Specialist', 'Operasional', 225000, 'Koordinasi operasional harian dan logistik', nowIso);
    insertPos.run('Finance & HR Officer', 'Keuangan & SDM', 250000, 'Administrasi SDM dan penggajian harian', nowIso);
  }

  const schedCount = db.prepare('SELECT COUNT(*) AS c FROM work_schedules').get() as { c: number };
  if (schedCount.c === 0) {
    const days = [
      { dow: 1, name: 'Senin', work: 1 },
      { dow: 2, name: 'Selasa', work: 1 },
      { dow: 3, name: 'Rabu', work: 1 },
      { dow: 4, name: 'Kamis', work: 1 },
      { dow: 5, name: 'Jumat', work: 1 },
      { dow: 6, name: 'Sabtu', work: 0 },
      { dow: 0, name: 'Minggu', work: 0 },
    ];
    const insertSched = db.prepare(
      'INSERT INTO work_schedules (day_of_week, day_name, is_work_day, clock_in_time, clock_out_time, late_tolerance_min) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const d of days) {
      insertSched.run(d.dow, d.name, d.work, '08:30', '17:30', 15);
    }
  }

  const empCount = db.prepare('SELECT COUNT(*) AS c FROM employees').get() as { c: number };
  if (empCount.c === 0) {
    const positions = db.prepare('SELECT id, title, default_daily_rate FROM positions ORDER BY id ASC').all() as Array<{
      id: number;
      title: string;
      default_daily_rate: number;
    }>;
    const p1 = positions[0] ?? { id: 1, default_daily_rate: 350000 };
    const p2 = positions[1] ?? { id: 2, default_daily_rate: 300000 };
    const p3 = positions[2] ?? { id: 3, default_daily_rate: 225000 };

    const insertEmp = db.prepare(`
      INSERT INTO employees (
        nik, full_name, email, password_hash, ess_enabled, phone, position_id,
        daily_rate, join_date, bank_name, bank_account, leave_quota, status, avatar_url, created_at
      ) VALUES (?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, 'Aktif', ?, ?)
    `);

    insertEmp.run(
      'EMP-2026-001',
      'Arif Budiman',
      'arif.budiman@kerjapay.id',
      '0812-8840-1120',
      p1.id,
      p1.default_daily_rate,
      '2025-03-10',
      'BCA',
      '5210-8891-4421',
      12,
      '/src/assets/images/avatar_emp_1_1795590992124.jpg',
      nowIso
    );
    insertEmp.run(
      'EMP-2026-002',
      'Nadia Kusuma',
      'nadia.kusuma@kerjapay.id',
      '0813-9021-3345',
      p2.id,
      p2.default_daily_rate,
      '2025-06-02',
      'Mandiri',
      '1370-0112-8890',
      11,
      '/src/assets/images/avatar_emp_2_1795590994249.jpg',
      nowIso
    );
    insertEmp.run(
      'EMP-2026-003',
      'Rina Hartanti',
      'rina.hartanti@kerjapay.id',
      '0856-7712-9043',
      p3.id,
      p3.default_daily_rate,
      '2026-01-15',
      'BNI',
      '0241-9980-3312',
      12,
      '/src/assets/images/avatar_emp_3_1795590993422.jpg',
      nowIso
    );

    const employees = db.prepare('SELECT id, daily_rate FROM employees ORDER BY id ASC').all() as Array<{
      id: number;
      daily_rate: number;
    }>;

    // Seed sample historical attendances for current month so payroll & reports show real calculations
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const insertAtt = db.prepare(`
      INSERT OR IGNORE INTO attendances (
        employee_id, work_date, clock_in_at, clock_out_at, clock_in_photo, clock_out_photo,
        clock_in_note, clock_out_note, status, work_minutes, daily_rate_snapshot, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const sampleDays = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13];
    for (const emp of employees) {
      for (const dayNum of sampleDays) {
        const dt = new Date(y, m, dayNum);
        if (dt > today) continue;
        const dow = dt.getDay();
        if (dow === 0 || dow === 6) continue;
        const isoDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        const isLate = emp.id === 2 && dayNum === 11;
        const inTime = isLate ? `${isoDate}T08:52:00.000Z` : `${isoDate}T08:22:00.000Z`;
        const outTime = `${isoDate}T17:35:00.000Z`;
        insertAtt.run(
          emp.id,
          isoDate,
          inTime,
          outTime,
          '',
          '',
          'Check-in kantor pusat',
          'Selesai tugas harian',
          isLate ? 'Terlambat' : 'Hadir',
          isLate ? 523 : 553,
          emp.daily_rate,
          nowIso
        );
      }
    }

    // Seed 1 pending leave request for Admin Approval queue
    if (employees[1]) {
      const targetDate = `${y}-${String(m + 1).padStart(2, '0')}-27`;
      db.prepare(`
        INSERT INTO leave_requests (
          employee_id, leave_type, start_date, end_date, total_days, reason, status, admin_note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'Menunggu', '', ?)
      `).run(
        employees[1].id,
        'Cuti Tahunan',
        targetDate,
        targetDate,
        1,
        'Keperluan keluarga di Bandung',
        nowIso
      );
    }
  }
}

seedInitialData();

// --- Crypto & Auth Helpers ---
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

interface TokenPayload {
  sub: number;
  role: 'admin' | 'employee';
  email: string;
  exp: number;
}

function signToken(payload: Omit<TokenPayload, 'exp'>): string {
  const fullPayload: TokenPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed || typeof parsed.sub !== 'number' || (parsed.role !== 'admin' && parsed.role !== 'employee')) {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface AuthedRequest extends Request {
  auth?: TokenPayload;
}

function requireAuth(role: 'admin' | 'employee') {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Sesi login diperlukan.' });
      return;
    }
    const token = header.slice(7).trim();
    const payload = verifyToken(token);
    if (!payload || payload.role !== role) {
      res.status(401).json({ error: 'Token sesi tidak valid atau akses ditolak.' });
      return;
    }
    req.auth = payload;
    next();
  };
}

function sanitizeImageDataUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return '';
  }
  if (trimmed.length > 2_500_000) {
    return '';
  }
  return trimmed;
}

function sanitizeText(value: unknown, maxLen = 250): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function isValidISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function computeWorkDateLocal(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function computeInclusiveDays(startISO: string, endISO: string): number {
  const s = new Date(`${startISO}T00:00:00Z`);
  const e = new Date(`${endISO}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

function evaluateClockInStatus(now: Date, workDate: string): 'Hadir' | 'Terlambat' {
  const dow = now.getDay();
  const sched = db.prepare('SELECT is_work_day, clock_in_time, late_tolerance_min FROM work_schedules WHERE day_of_week = ?').get(dow) as
    | { is_work_day: number; clock_in_time: string; late_tolerance_min: number }
    | undefined;
  if (!sched || !sched.is_work_day) return 'Hadir';
  const [hh, mm] = sched.clock_in_time.split(':').map(Number);
  const [y, m, d] = workDate.split('-').map(Number);
  const limit = new Date(y, m - 1, d, hh, mm + sched.late_tolerance_min, 59);
  return now.getTime() > limit.getTime() ? 'Terlambat' : 'Hadir';
}

// --- Express App ---
const app = express();
app.use(express.json({ limit: '4mb' }));

// Health & Auth Bootstrap Status
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/status', (_req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS count FROM admins').get() as { count: number };
  const envPasscodeActive = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
  res.json({
    adminConfigured: row.count > 0 || envPasscodeActive,
    hasRegisteredAdmin: row.count > 0,
    envPasscodeActive,
  });
});

// One-time First-Run Admin Setup (locks permanently once an admin exists)
app.post('/api/auth/admin/setup', (req, res) => {
  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  const existingCount = (db.prepare('SELECT COUNT(*) AS count FROM admins').get() as { count: number }).count;
  if (existingCount > 0 || envPasscode) {
    res.status(403).json({ error: 'Akun Admin Backoffice sudah dikonfigurasi.' });
    return;
  }

  const name = sanitizeText(req.body?.name, 80);
  const email = sanitizeText(req.body?.email, 120).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!name || !email.includes('@') || password.length < 6) {
    res.status(400).json({ error: 'Nama, email valid, dan password minimal 6 karakter wajib diisi.' });
    return;
  }

  const avatar = '/src/assets/images/avatar_admin_1795590992322.jpg';
  const nowIso = new Date().toISOString();
  const hash = hashPassword(password);
  const info = db.prepare(
    'INSERT INTO admins (name, email, password_hash, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email, hash, avatar, nowIso);

  const admin = {
    id: Number(info.lastInsertRowid),
    name,
    email,
    avatar_url: avatar,
  };
  const token = signToken({ sub: admin.id, role: 'admin', email: admin.email });
  res.status(201).json({ token, role: 'admin', user: admin });
});

// Admin Login
app.post('/api/auth/admin/login', (req, res) => {
  const email = sanitizeText(req.body?.email, 120).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email dan password wajib diisi.' });
    return;
  }

  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  const adminRow = db.prepare('SELECT id, name, email, password_hash, avatar_url FROM admins WHERE lower(email) = ?').get(email) as
    | { id: number; name: string; email: string; password_hash: string; avatar_url: string }
    | undefined;

  if (envPasscode && password === envPasscode) {
    const user = adminRow
      ? { id: adminRow.id, name: adminRow.name, email: adminRow.email, avatar_url: adminRow.avatar_url }
      : { id: 0, name: 'Administrator', email, avatar_url: '/src/assets/images/avatar_admin_1795590992322.jpg' };
    const token = signToken({ sub: user.id, role: 'admin', email: user.email });
    res.json({ token, role: 'admin', user });
    return;
  }

  if (!adminRow || !verifyPassword(password, adminRow.password_hash)) {
    res.status(401).json({ error: 'Email atau password Backoffice tidak sesuai.' });
    return;
  }

  const user = {
    id: adminRow.id,
    name: adminRow.name,
    email: adminRow.email,
    avatar_url: adminRow.avatar_url,
  };
  const token = signToken({ sub: user.id, role: 'admin', email: user.email });
  res.json({ token, role: 'admin', user });
});

// Employee ESS Login
app.post('/api/auth/employee/login', (req, res) => {
  const email = sanitizeText(req.body?.email, 120).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email dan password ESS wajib diisi.' });
    return;
  }

  const emp = db.prepare(`
    SELECT e.*, p.title AS position_title, p.department AS department
    FROM employees e
    JOIN positions p ON p.id = e.position_id
    WHERE lower(e.email) = ?
  `).get(email) as (Record<string, unknown> & {
    id: number;
    email: string;
    password_hash: string | null;
    ess_enabled: number;
    status: string;
  }) | undefined;

  if (!emp) {
    res.status(401).json({ error: 'Email karyawan tidak terdaftar.' });
    return;
  }
  if (emp.status !== 'Aktif') {
    res.status(403).json({ error: 'Status kepegawaian Anda saat ini Nonaktif.' });
    return;
  }
  if (!emp.ess_enabled || !emp.password_hash) {
    res.status(403).json({ error: 'Akses login ESS belum diaktifkan. Hubungi HR Admin di Backoffice.' });
    return;
  }
  if (!verifyPassword(password, emp.password_hash)) {
    res.status(401).json({ error: 'Password ESS salah.' });
    return;
  }

  const { password_hash: _ph, ...safeProfile } = emp;
  const token = signToken({ sub: emp.id, role: 'employee', email: emp.email });
  res.json({ token, role: 'employee', user: safeProfile });
});

// Session restore check
app.get('/api/auth/me', (req: AuthedRequest, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const payload = verifyToken(header.slice(7).trim());
  if (!payload) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  if (payload.role === 'admin') {
    const adminRow = db.prepare('SELECT id, name, email, avatar_url FROM admins WHERE id = ?').get(payload.sub);
    res.json({
      role: 'admin',
      user: adminRow || { id: 0, name: 'Administrator', email: payload.email, avatar_url: '/src/assets/images/avatar_admin_1795590992322.jpg' },
    });
    return;
  }

  const emp = db.prepare(`
    SELECT e.id, e.nik, e.full_name, e.email, e.ess_enabled, e.phone, e.position_id,
           p.title AS position_title, p.department AS department, e.daily_rate,
           e.join_date, e.bank_name, e.bank_account, e.leave_quota, e.status, e.avatar_url
    FROM employees e
    JOIN positions p ON p.id = e.position_id
    WHERE e.id = ?
  `).get(payload.sub);
  if (!emp) {
    res.status(401).json({ error: 'Employee not found' });
    return;
  }
  res.json({ role: 'employee', user: emp });
});

// ========================
// BACKOFFICE ADMIN ROUTES
// ========================

app.get('/api/admin/overview', requireAuth('admin'), (req, res) => {
  const today = computeWorkDateLocal();
  const monthPrefix = today.slice(0, 7);

  const totalEmployees = (db.prepare("SELECT COUNT(*) AS c FROM employees WHERE status = 'Aktif'").get() as { c: number }).c;
  const essActiveCount = (db.prepare("SELECT COUNT(*) AS c FROM employees WHERE status = 'Aktif' AND ess_enabled = 1").get() as { c: number }).c;
  const presentToday = (db.prepare('SELECT COUNT(*) AS c FROM attendances WHERE work_date = ?').get(today) as { c: number }).c;
  const lateToday = (db.prepare("SELECT COUNT(*) AS c FROM attendances WHERE work_date = ? AND status = 'Terlambat'").get(today) as { c: number }).c;
  const pendingLeaves = (db.prepare("SELECT COUNT(*) AS c FROM leave_requests WHERE status = 'Menunggu'").get() as { c: number }).c;

  const estPayrollMonth = (
    db.prepare('SELECT COALESCE(SUM(daily_rate_snapshot), 0) AS total FROM attendances WHERE work_date LIKE ?').get(`${monthPrefix}%`) as {
      total: number;
    }
  ).total;

  const recentAttendances = db.prepare(`
    SELECT a.*, e.full_name AS employee_name, e.nik AS employee_nik, e.avatar_url, p.title AS position_title
    FROM attendances a
    JOIN employees e ON e.id = a.employee_id
    JOIN positions p ON p.id = e.position_id
    ORDER BY a.work_date DESC, a.clock_in_at DESC
    LIMIT 8
  `).all();

  res.json({
    today,
    totalEmployees,
    essActiveCount,
    presentToday,
    lateToday,
    pendingLeaves,
    estPayrollMonth,
    recentAttendances,
  });
});

// Positions (Jabatan) CRUD
app.get('/api/admin/positions', requireAuth('admin'), (_req, res) => {
  const rows = db.prepare(`
    SELECT p.*, COUNT(e.id) AS employee_count
    FROM positions p
    LEFT JOIN employees e ON e.position_id = p.id
    GROUP BY p.id
    ORDER BY p.id ASC
  `).all();
  res.json(rows);
});

app.post('/api/admin/positions', requireAuth('admin'), (req, res) => {
  const title = sanitizeText(req.body?.title, 80);
  const department = sanitizeText(req.body?.department, 80);
  const defaultDailyRate = Math.max(0, Math.round(Number(req.body?.default_daily_rate || 0)));
  const description = sanitizeText(req.body?.description, 250);

  if (!title || !department || !Number.isFinite(defaultDailyRate)) {
    res.status(400).json({ error: 'Nama jabatan, departemen, dan tarif harian wajib diisi.' });
    return;
  }

  const info = db.prepare(
    'INSERT INTO positions (title, department, default_daily_rate, description, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(title, department, defaultDailyRate, description, new Date().toISOString());

  const created = db.prepare('SELECT * FROM positions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(created);
});

app.put('/api/admin/positions/:id', requireAuth('admin'), (req, res) => {
  const id = Number(req.params.id);
  const title = sanitizeText(req.body?.title, 80);
  const department = sanitizeText(req.body?.department, 80);
  const defaultDailyRate = Math.max(0, Math.round(Number(req.body?.default_daily_rate || 0)));
  const description = sanitizeText(req.body?.description, 250);

  if (!title || !department) {
    res.status(400).json({ error: 'Nama jabatan dan departemen wajib diisi.' });
    return;
  }

  db.prepare(
    'UPDATE positions SET title = ?, department = ?, default_daily_rate = ?, description = ? WHERE id = ?'
  ).run(title, department, defaultDailyRate, description, id);

  res.json(db.prepare('SELECT * FROM positions WHERE id = ?').get(id));
});

app.delete('/api/admin/positions/:id', requireAuth('admin'), (req, res) => {
  const id = Number(req.params.id);
  const used = (db.prepare('SELECT COUNT(*) AS c FROM employees WHERE position_id = ?').get(id) as { c: number }).c;
  if (used > 0) {
    res.status(400).json({ error: 'Jabatan masih digunakan oleh karyawan aktif.' });
    return;
  }
  db.prepare('DELETE FROM positions WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Employees (Karyawan) & ESS Login Credentials CRUD
app.get('/api/admin/employees', requireAuth('admin'), (_req, res) => {
  const rows = db.prepare(`
    SELECT e.id, e.nik, e.full_name, e.email, e.ess_enabled,
           CASE WHEN e.password_hash IS NOT NULL AND length(e.password_hash) > 0 THEN 1 ELSE 0 END AS has_password,
           e.phone, e.position_id, p.title AS position_title, p.department AS department,
           e.daily_rate, e.join_date, e.bank_name, e.bank_account, e.leave_quota, e.status, e.avatar_url
    FROM employees e
    JOIN positions p ON p.id = e.position_id
    ORDER BY e.id ASC
  `).all();
  res.json(rows);
});

app.post('/api/admin/employees', requireAuth('admin'), (req, res) => {
  const nik = sanitizeText(req.body?.nik, 40);
  const fullName = sanitizeText(req.body?.full_name, 100);
  const email = sanitizeText(req.body?.email, 120).toLowerCase();
  const phone = sanitizeText(req.body?.phone, 40);
  const positionId = Number(req.body?.position_id);
  const dailyRate = Math.max(0, Math.round(Number(req.body?.daily_rate || 0)));
  const joinDate = isValidISODate(req.body?.join_date) ? req.body.join_date : computeWorkDateLocal();
  const bankName = sanitizeText(req.body?.bank_name, 40);
  const bankAccount = sanitizeText(req.body?.bank_account, 60);
  const leaveQuota = Math.max(0, Math.round(Number(req.body?.leave_quota ?? 12)));
  const status = req.body?.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
  const essEnabled = req.body?.ess_enabled ? 1 : 0;
  const essPassword = typeof req.body?.ess_password === 'string' ? req.body.ess_password : '';

  if (!nik || !fullName || !email.includes('@') || !positionId) {
    res.status(400).json({ error: 'NIK, nama lengkap, email valid, dan jabatan wajib diisi.' });
    return;
  }
  if (essEnabled && essPassword.length < 6) {
    res.status(400).json({ error: 'Password ESS minimal 6 karakter saat akses ESS diaktifkan.' });
    return;
  }

  const dup = db.prepare('SELECT id FROM employees WHERE nik = ? OR lower(email) = ?').get(nik, email);
  if (dup) {
    res.status(409).json({ error: 'NIK atau email sudah terdaftar pada karyawan lain.' });
    return;
  }

  const passwordHash = essPassword.length >= 6 ? hashPassword(essPassword) : null;
  const avatarUrl = '/src/assets/images/avatar_emp_1_1795590992124.jpg';

  const info = db.prepare(`
    INSERT INTO employees (
      nik, full_name, email, password_hash, ess_enabled, phone, position_id,
      daily_rate, join_date, bank_name, bank_account, leave_quota, status, avatar_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nik,
    fullName,
    email,
    passwordHash,
    essEnabled,
    phone,
    positionId,
    dailyRate,
    joinDate,
    bankName,
    bankAccount,
    leaveQuota,
    status,
    avatarUrl,
    new Date().toISOString()
  );

  const created = db.prepare(`
    SELECT e.id, e.nik, e.full_name, e.email, e.ess_enabled,
           CASE WHEN e.password_hash IS NOT NULL THEN 1 ELSE 0 END AS has_password,
           e.phone, e.position_id, p.title AS position_title, p.department AS department,
           e.daily_rate, e.join_date, e.bank_name, e.bank_account, e.leave_quota, e.status, e.avatar_url
    FROM employees e JOIN positions p ON p.id = e.position_id WHERE e.id = ?
  `).get(info.lastInsertRowid);

  res.status(201).json(created);
});

app.put('/api/admin/employees/:id', requireAuth('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
    return;
  }

  const nik = sanitizeText(req.body?.nik, 40);
  const fullName = sanitizeText(req.body?.full_name, 100);
  const email = sanitizeText(req.body?.email, 120).toLowerCase();
  const phone = sanitizeText(req.body?.phone, 40);
  const positionId = Number(req.body?.position_id);
  const dailyRate = Math.max(0, Math.round(Number(req.body?.daily_rate || 0)));
  const joinDate = isValidISODate(req.body?.join_date) ? req.body.join_date : computeWorkDateLocal();
  const bankName = sanitizeText(req.body?.bank_name, 40);
  const bankAccount = sanitizeText(req.body?.bank_account, 60);
  const leaveQuota = Math.max(0, Math.round(Number(req.body?.leave_quota ?? 12)));
  const status = req.body?.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';

  if (!nik || !fullName || !email.includes('@') || !positionId) {
    res.status(400).json({ error: 'NIK, nama lengkap, email, dan jabatan wajib diisi.' });
    return;
  }

  const dup = db.prepare('SELECT id FROM employees WHERE (nik = ? OR lower(email) = ?) AND id != ?').get(nik, email, id);
  if (dup) {
    res.status(409).json({ error: 'NIK atau email sudah digunakan karyawan lain.' });
    return;
  }

  db.prepare(`
    UPDATE employees SET
      nik = ?, full_name = ?, email = ?, phone = ?, position_id = ?,
      daily_rate = ?, join_date = ?, bank_name = ?, bank_account = ?, leave_quota = ?, status = ?
    WHERE id = ?
  `).run(nik, fullName, email, phone, positionId, dailyRate, joinDate, bankName, bankAccount, leaveQuota, status, id);

  const updated = db.prepare(`
    SELECT e.id, e.nik, e.full_name, e.email, e.ess_enabled,
           CASE WHEN e.password_hash IS NOT NULL AND length(e.password_hash) > 0 THEN 1 ELSE 0 END AS has_password,
           e.phone, e.position_id, p.title AS position_title, p.department AS department,
           e.daily_rate, e.join_date, e.bank_name, e.bank_account, e.leave_quota, e.status, e.avatar_url
    FROM employees e JOIN positions p ON p.id = e.position_id WHERE e.id = ?
  `).get(id);

  res.json(updated);
});

// Dedicated ESS Login Credentials Management (Email + Password + Active Switch)
app.patch('/api/admin/employees/:id/credentials', requireAuth('admin'), (req, res) => {
  const id = Number(req.params.id);
  const emp = db.prepare('SELECT id, password_hash FROM employees WHERE id = ?').get(id) as
    | { id: number; password_hash: string | null }
    | undefined;
  if (!emp) {
    res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
    return;
  }

  const email = sanitizeText(req.body?.email, 120).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const essEnabled = req.body?.ess_enabled ? 1 : 0;

  if (!email.includes('@')) {
    res.status(400).json({ error: 'Alamat email login ESS tidak valid.' });
    return;
  }
  const dup = db.prepare('SELECT id FROM employees WHERE lower(email) = ? AND id != ?').get(email, id);
  if (dup) {
    res.status(409).json({ error: 'Email sudah digunakan oleh karyawan lain.' });
    return;
  }
  if (password && password.length < 6) {
    res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
    return;
  }
  if (essEnabled && !password && !emp.password_hash) {
    res.status(400).json({ error: 'Harap masukkan password awal minimal 6 karakter untuk mengaktifkan akun ESS.' });
    return;
  }

  if (password) {
    const newHash = hashPassword(password);
    db.prepare('UPDATE employees SET email = ?, password_hash = ?, ess_enabled = ? WHERE id = ?').run(email, newHash, essEnabled, id);
  } else {
    db.prepare('UPDATE employees SET email = ?, ess_enabled = ? WHERE id = ?').run(email, essEnabled, id);
  }

  const updated = db.prepare(`
    SELECT e.id, e.nik, e.full_name, e.email, e.ess_enabled,
           CASE WHEN e.password_hash IS NOT NULL AND length(e.password_hash) > 0 THEN 1 ELSE 0 END AS has_password,
           e.phone, e.position_id, p.title AS position_title, p.department AS department,
           e.daily_rate, e.join_date, e.bank_name, e.bank_account, e.leave_quota, e.status, e.avatar_url
    FROM employees e JOIN positions p ON p.id = e.position_id WHERE e.id = ?
  `).get(id);

  res.json(updated);
});

app.delete('/api/admin/employees/:id', requireAuth('admin'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Work Schedules & Holidays
app.get('/api/admin/schedules', requireAuth('admin'), (_req, res) => {
  const schedules = db.prepare('SELECT * FROM work_schedules ORDER BY CASE WHEN day_of_week = 0 THEN 7 ELSE day_of_week END ASC').all();
  const holidays = db.prepare('SELECT * FROM holidays ORDER BY holiday_date ASC').all();
  res.json({ schedules, holidays });
});

app.put('/api/admin/schedules', requireAuth('admin'), (req, res) => {
  const list = Array.isArray(req.body?.schedules) ? req.body.schedules : [];
  const updateStmt = db.prepare(`
    UPDATE work_schedules
    SET is_work_day = ?, clock_in_time = ?, clock_out_time = ?, late_tolerance_min = ?
    WHERE day_of_week = ?
  `);

  const tx = db.transaction(() => {
    for (const item of list) {
      const dow = Number(item.day_of_week);
      const isWork = item.is_work_day ? 1 : 0;
      const inTime = /^\d{2}:\d{2}$/.test(String(item.clock_in_time)) ? String(item.clock_in_time) : '08:30';
      const outTime = /^\d{2}:\d{2}$/.test(String(item.clock_out_time)) ? String(item.clock_out_time) : '17:30';
      const tol = Math.max(0, Math.min(180, Math.round(Number(item.late_tolerance_min ?? 15))));
      updateStmt.run(isWork, inTime, outTime, tol, dow);
    }
  });
  tx();

  const updated = db.prepare('SELECT * FROM work_schedules ORDER BY CASE WHEN day_of_week = 0 THEN 7 ELSE day_of_week END ASC').all();
  res.json(updated);
});

app.post('/api/admin/holidays', requireAuth('admin'), (req, res) => {
  const holidayDate = req.body?.holiday_date;
  const name = sanitizeText(req.body?.name, 100);
  if (!isValidISODate(holidayDate) || !name) {
    res.status(400).json({ error: 'Tanggal dan nama hari libur wajib diisi.' });
    return;
  }
  db.prepare('INSERT OR REPLACE INTO holidays (holiday_date, name, created_at) VALUES (?, ?, ?)').run(
    holidayDate,
    name,
    new Date().toISOString()
  );
  res.status(201).json(db.prepare('SELECT * FROM holidays ORDER BY holiday_date ASC').all());
});

app.delete('/api/admin/holidays/:id', requireAuth('admin'), (req, res) => {
  db.prepare('DELETE FROM holidays WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Attendances Admin
app.get('/api/admin/attendances', requireAuth('admin'), (req, res) => {
  const dateFilter = typeof req.query.date === 'string' && isValidISODate(req.query.date) ? req.query.date : '';
  const monthFilter = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : '';

  let sql = `
    SELECT a.*, e.full_name AS employee_name, e.nik AS employee_nik, e.avatar_url, p.title AS position_title
    FROM attendances a
    JOIN employees e ON e.id = a.employee_id
    JOIN positions p ON p.id = e.position_id
  `;
  const params: string[] = [];
  if (dateFilter) {
    sql += ' WHERE a.work_date = ?';
    params.push(dateFilter);
  } else if (monthFilter) {
    sql += ' WHERE a.work_date LIKE ?';
    params.push(`${monthFilter}%`);
  }
  sql += ' ORDER BY a.work_date DESC, a.clock_in_at DESC LIMIT 250';

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.patch('/api/admin/attendances/:id', requireAuth('admin'), (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!['Hadir', 'Terlambat', 'Pulang Awal', 'Alpa'].includes(status)) {
    res.status(400).json({ error: 'Status kehadiran tidak valid.' });
    return;
  }
  db.prepare('UPDATE attendances SET status = ? WHERE id = ?').run(status, id);
  res.json(db.prepare('SELECT * FROM attendances WHERE id = ?').get(id));
});

// Leave Requests Admin Approval
app.get('/api/admin/leaves', requireAuth('admin'), (_req, res) => {
  const rows = db.prepare(`
    SELECT l.*, e.full_name AS employee_name, e.nik AS employee_nik, e.avatar_url, p.title AS position_title
    FROM leave_requests l
    JOIN employees e ON e.id = l.employee_id
    JOIN positions p ON p.id = e.position_id
    ORDER BY CASE WHEN l.status = 'Menunggu' THEN 0 ELSE 1 END ASC, l.created_at DESC
  `).all();
  res.json(rows);
});

app.patch('/api/admin/leaves/:id', requireAuth('admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const decision = req.body?.status;
  const adminNote = sanitizeText(req.body?.admin_note, 250);

  if (decision !== 'Disetujui' && decision !== 'Ditolak') {
    res.status(400).json({ error: 'Keputusan cuti harus Disetujui atau Ditolak.' });
    return;
  }

  const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id) as
    | { id: number; employee_id: number; leave_type: string; total_days: number; status: string }
    | undefined;
  if (!leave) {
    res.status(404).json({ error: 'Pengajuan cuti tidak ditemukan.' });
    return;
  }
  if (leave.status !== 'Menunggu') {
    res.status(400).json({ error: 'Pengajuan cuti ini sudah diproses sebelumnya.' });
    return;
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE leave_requests
      SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ?
    `).run(decision, adminNote, req.auth?.email || 'Admin', new Date().toISOString(), id);

    if (decision === 'Disetujui' && leave.leave_type === 'Cuti Tahunan') {
      db.prepare('UPDATE employees SET leave_quota = MAX(0, leave_quota - ?) WHERE id = ?').run(
        leave.total_days,
        leave.employee_id
      );
    }
  });
  tx();

  const updated = db.prepare(`
    SELECT l.*, e.full_name AS employee_name, e.nik AS employee_nik, e.avatar_url, p.title AS position_title
    FROM leave_requests l
    JOIN employees e ON e.id = l.employee_id
    JOIN positions p ON p.id = e.position_id
    WHERE l.id = ?
  `).get(id);
  res.json(updated);
});

// Payroll (Daily-Rate Model) Admin
app.get('/api/admin/payroll', requireAuth('admin'), (_req, res) => {
  const runs = db.prepare('SELECT * FROM payroll_runs ORDER BY id DESC').all() as Array<Record<string, unknown> & { id: number }>;
  const itemStmt = db.prepare(`
    SELECT pi.*, e.full_name AS employee_name, e.nik AS employee_nik, e.bank_name, e.bank_account,
           p.title AS position_title, p.department AS department
    FROM payroll_items pi
    JOIN employees e ON e.id = pi.employee_id
    JOIN positions p ON p.id = e.position_id
    WHERE pi.payroll_run_id = ?
    ORDER BY e.full_name ASC
  `);
  const hydrated = runs.map((run) => ({
    ...run,
    items: itemStmt.all(run.id),
  }));
  res.json(hydrated);
});

app.post('/api/admin/payroll/generate', requireAuth('admin'), (req: AuthedRequest, res) => {
  const periodLabel = sanitizeText(req.body?.period_label, 80);
  const startDate = req.body?.start_date;
  const endDate = req.body?.end_date;

  if (!periodLabel || !isValidISODate(startDate) || !isValidISODate(endDate) || startDate > endDate) {
    res.status(400).json({ error: 'Label periode dan rentang tanggal valid wajib diisi.' });
    return;
  }

  const employees = db.prepare("SELECT id, daily_rate FROM employees WHERE status = 'Aktif' ORDER BY id ASC").all() as Array<{
    id: number;
    daily_rate: number;
  }>;

  const attStmt = db.prepare(`
    SELECT work_date, daily_rate_snapshot
    FROM attendances
    WHERE employee_id = ? AND work_date >= ? AND work_date <= ? AND status IN ('Hadir', 'Terlambat', 'Pulang Awal')
    ORDER BY work_date ASC
  `);

  const nowIso = new Date().toISOString();
  let runId = 0;

  const tx = db.transaction(() => {
    const runInfo = db.prepare(`
      INSERT INTO payroll_runs (period_label, start_date, end_date, status, total_amount, created_by, created_at)
      VALUES (?, ?, ?, 'Draft', 0, ?, ?)
    `).run(periodLabel, startDate, endDate, req.auth?.email || 'Admin', nowIso);
    runId = Number(runInfo.lastInsertRowid);

    const insertItem = db.prepare(`
      INSERT INTO payroll_items (
        payroll_run_id, employee_id, days_worked, daily_rate, base_pay, allowance, deduction, net_pay, attended_dates_json, status
      ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 'Draft')
    `);

    let grandTotal = 0;
    for (const emp of employees) {
      const attRows = attStmt.all(emp.id, startDate, endDate) as Array<{ work_date: string; daily_rate_snapshot: number }>;
      const daysWorked = attRows.length;
      const basePay = attRows.reduce((sum, r) => sum + (r.daily_rate_snapshot || emp.daily_rate), 0);
      const effectiveRate = daysWorked > 0 ? Math.round(basePay / daysWorked) : emp.daily_rate;
      const datesJson = JSON.stringify(attRows.map((r) => r.work_date));

      insertItem.run(runId, emp.id, daysWorked, effectiveRate, basePay, basePay, datesJson);
      grandTotal += basePay;
    }

    db.prepare('UPDATE payroll_runs SET total_amount = ? WHERE id = ?').run(grandTotal, runId);
  });
  tx();

  const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(runId) as Record<string, unknown>;
  const items = db.prepare(`
    SELECT pi.*, e.full_name AS employee_name, e.nik AS employee_nik, e.bank_name, e.bank_account,
           p.title AS position_title, p.department AS department
    FROM payroll_items pi
    JOIN employees e ON e.id = pi.employee_id
    JOIN positions p ON p.id = e.position_id
    WHERE pi.payroll_run_id = ?
  `).all(runId);

  res.status(201).json({ ...run, items });
});

app.patch('/api/admin/payroll/items/:itemId', requireAuth('admin'), (req, res) => {
  const itemId = Number(req.params.itemId);
  const item = db.prepare('SELECT * FROM payroll_items WHERE id = ?').get(itemId) as
    | { id: number; payroll_run_id: number; base_pay: number; status: string }
    | undefined;
  if (!item) {
    res.status(404).json({ error: 'Item payroll tidak ditemukan.' });
    return;
  }
  if (item.status === 'Dibayar') {
    res.status(400).json({ error: 'Slip payroll yang sudah dibayar tidak dapat diubah.' });
    return;
  }

  const allowance = Math.max(0, Math.round(Number(req.body?.allowance || 0)));
  const deduction = Math.max(0, Math.round(Number(req.body?.deduction || 0)));
  const netPay = Math.max(0, item.base_pay + allowance - deduction);

  const tx = db.transaction(() => {
    db.prepare('UPDATE payroll_items SET allowance = ?, deduction = ?, net_pay = ? WHERE id = ?').run(
      allowance,
      deduction,
      netPay,
      itemId
    );
    const total = (
      db.prepare('SELECT COALESCE(SUM(net_pay), 0) AS t FROM payroll_items WHERE payroll_run_id = ?').get(item.payroll_run_id) as {
        t: number;
      }
    ).t;
    db.prepare('UPDATE payroll_runs SET total_amount = ? WHERE id = ?').run(total, item.payroll_run_id);
  });
  tx();

  res.json(db.prepare('SELECT * FROM payroll_items WHERE id = ?').get(itemId));
});

app.post('/api/admin/payroll/:runId/finalize', requireAuth('admin'), (req, res) => {
  const runId = Number(req.params.runId);
  const nowIso = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("UPDATE payroll_runs SET status = 'Dibayar', paid_at = ? WHERE id = ?").run(nowIso, runId);
    db.prepare("UPDATE payroll_items SET status = 'Dibayar' WHERE payroll_run_id = ?").run(runId);
  });
  tx();
  res.json({ ok: true });
});

// ========================
// EMPLOYEE ESS PWA ROUTES
// ========================

app.get('/api/ess/dashboard', requireAuth('employee'), (req: AuthedRequest, res) => {
  const empId = req.auth!.sub;
  const today = computeWorkDateLocal();
  const monthPrefix = today.slice(0, 7);

  const profile = db.prepare(`
    SELECT e.id, e.nik, e.full_name, e.email, e.ess_enabled, e.phone, e.position_id,
           p.title AS position_title, p.department AS department, e.daily_rate,
           e.join_date, e.bank_name, e.bank_account, e.leave_quota, e.status, e.avatar_url
    FROM employees e
    JOIN positions p ON p.id = e.position_id
    WHERE e.id = ?
  `).get(empId);

  const todayAttendance = db.prepare('SELECT * FROM attendances WHERE employee_id = ? AND work_date = ?').get(empId, today) || null;
  const dow = new Date().getDay();
  const todaySchedule = db.prepare('SELECT * FROM work_schedules WHERE day_of_week = ?').get(dow);

  const monthAttendances = db.prepare(`
    SELECT * FROM attendances
    WHERE employee_id = ? AND work_date LIKE ?
    ORDER BY work_date DESC
  `).all(empId, `${monthPrefix}%`) as Array<{ daily_rate_snapshot: number; status: string }>;

  const validDays = monthAttendances.filter((a) => a.status !== 'Alpa');
  const estimatedEarningsMonth = validDays.reduce((sum, a) => sum + (a.daily_rate_snapshot || 0), 0);

  const schedules = db.prepare('SELECT * FROM work_schedules ORDER BY CASE WHEN day_of_week = 0 THEN 7 ELSE day_of_week END ASC').all();
  const recentLeaves = db.prepare('SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 5').all(empId);

  res.json({
    today,
    profile,
    todayAttendance,
    todaySchedule,
    schedules,
    monthSummary: {
      daysPresent: validDays.length,
      lateCount: monthAttendances.filter((a) => a.status === 'Terlambat').length,
      estimatedEarningsMonth,
    },
    recentLeaves,
  });
});

app.get('/api/ess/attendances', requireAuth('employee'), (req: AuthedRequest, res) => {
  const empId = req.auth!.sub;
  const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : '';

  if (month) {
    const rows = db.prepare(
      'SELECT * FROM attendances WHERE employee_id = ? AND work_date LIKE ? ORDER BY work_date DESC'
    ).all(empId, `${month}%`);
    res.json(rows);
    return;
  }

  const rows = db.prepare('SELECT * FROM attendances WHERE employee_id = ? ORDER BY work_date DESC LIMIT 60').all(empId);
  res.json(rows);
});

app.post('/api/ess/clock-in', requireAuth('employee'), (req: AuthedRequest, res) => {
  const empId = req.auth!.sub;
  const now = new Date();
  const workDate = computeWorkDateLocal(now);

  const existing = db.prepare('SELECT id FROM attendances WHERE employee_id = ? AND work_date = ?').get(empId, workDate);
  if (existing) {
    res.status(409).json({ error: 'Anda sudah melakukan Clock-in hari ini.' });
    return;
  }

  const photo = sanitizeImageDataUrl(req.body?.photo);
  if (!photo) {
    res.status(400).json({ error: 'Foto selfie wajib diambil sebelum Clock-in.' });
    return;
  }

  const note = sanitizeText(req.body?.note, 200);
  const emp = db.prepare('SELECT daily_rate FROM employees WHERE id = ?').get(empId) as { daily_rate: number } | undefined;
  const dailyRate = emp?.daily_rate ?? 0;
  const status = evaluateClockInStatus(now, workDate);
  const nowIso = now.toISOString();

  const info = db.prepare(`
    INSERT INTO attendances (
      employee_id, work_date, clock_in_at, clock_in_photo, clock_in_note, status, work_minutes, daily_rate_snapshot, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(empId, workDate, nowIso, photo, note, status, dailyRate, nowIso);

  res.status(201).json(db.prepare('SELECT * FROM attendances WHERE id = ?').get(info.lastInsertRowid));
});

app.post('/api/ess/clock-out', requireAuth('employee'), (req: AuthedRequest, res) => {
  const empId = req.auth!.sub;
  const now = new Date();
  const workDate = computeWorkDateLocal(now);

  const existing = db.prepare('SELECT * FROM attendances WHERE employee_id = ? AND work_date = ?').get(empId, workDate) as
    | { id: number; clock_in_at: string; clock_out_at: string | null }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Anda belum melakukan Clock-in hari ini.' });
    return;
  }
  if (existing.clock_out_at) {
    res.status(409).json({ error: 'Anda sudah melakukan Clock-out hari ini.' });
    return;
  }

  const photo = sanitizeImageDataUrl(req.body?.photo);
  if (!photo) {
    res.status(400).json({ error: 'Foto selfie wajib diambil sebelum Clock-out.' });
    return;
  }

  const note = sanitizeText(req.body?.note, 200);
  const clockInMs = new Date(existing.clock_in_at).getTime();
  const workMinutes = Math.max(1, Math.round((now.getTime() - clockInMs) / 60000));
  const nowIso = now.toISOString();

  db.prepare(`
    UPDATE attendances
    SET clock_out_at = ?, clock_out_photo = ?, clock_out_note = ?, work_minutes = ?
    WHERE id = ?
  `).run(nowIso, photo, note, workMinutes, existing.id);

  res.json(db.prepare('SELECT * FROM attendances WHERE id = ?').get(existing.id));
});

// Employee Leave Requests
app.get('/api/ess/leaves', requireAuth('employee'), (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC').all(req.auth!.sub);
  res.json(rows);
});

app.post('/api/ess/leaves', requireAuth('employee'), (req: AuthedRequest, res) => {
  const empId = req.auth!.sub;
  const leaveType = req.body?.leave_type;
  const startDate = req.body?.start_date;
  const endDate = req.body?.end_date;
  const reason = sanitizeText(req.body?.reason, 300);

  if (!['Cuti Tahunan', 'Izin Sakit', 'Izin Khusus'].includes(leaveType)) {
    res.status(400).json({ error: 'Jenis cuti tidak valid.' });
    return;
  }
  if (!isValidISODate(startDate) || !isValidISODate(endDate) || startDate > endDate) {
    res.status(400).json({ error: 'Rentang tanggal cuti tidak valid.' });
    return;
  }
  if (!reason) {
    res.status(400).json({ error: 'Alasan pengajuan cuti wajib diisi.' });
    return;
  }

  const totalDays = computeInclusiveDays(startDate, endDate);
  if (leaveType === 'Cuti Tahunan') {
    const emp = db.prepare('SELECT leave_quota FROM employees WHERE id = ?').get(empId) as { leave_quota: number } | undefined;
    if (emp && totalDays > emp.leave_quota) {
      res.status(400).json({ error: `Sisa kuota cuti tahunan Anda hanya ${emp.leave_quota} hari.` });
      return;
    }
  }

  const info = db.prepare(`
    INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, total_days, reason, status, admin_note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'Menunggu', '', ?)
  `).run(empId, leaveType, startDate, endDate, totalDays, reason, new Date().toISOString());

  res.status(201).json(db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(info.lastInsertRowid));
});

// Employee Payroll Slips & Monthly Report
app.get('/api/ess/payroll-slips', requireAuth('employee'), (req: AuthedRequest, res) => {
  const empId = req.auth!.sub;
  const rows = db.prepare(`
    SELECT pi.*, pr.period_label, pr.start_date, pr.end_date, pr.paid_at
    FROM payroll_items pi
    JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
    WHERE pi.employee_id = ?
    ORDER BY pr.id DESC
  `).all(empId);
  res.json(rows);
});

// --- Vite Dev / Production Static Serving ---
async function startServer() {
  const httpServer = http.createServer(app);

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`KerjaPay HRM server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

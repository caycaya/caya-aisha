const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Formats YYYY-MM-DD or ISO date string strictly as DD-MMM-YYYY (e.g. 13-Nov-2026)
 */
export function formatDateDMY(input: string | Date | null | undefined): string {
  if (!input) return '-';
  let year: number;
  let monthIdx: number;
  let day: number;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return '-';
    year = input.getFullYear();
    monthIdx = input.getMonth();
    day = input.getDate();
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    const [y, m, d] = input.trim().split('-').map(Number);
    year = y;
    monthIdx = m - 1;
    day = d;
  } else {
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return String(input);
    year = parsed.getFullYear();
    monthIdx = parsed.getMonth();
    day = parsed.getDate();
  }

  const dd = String(day).padStart(2, '0');
  const mmm = MONTHS_SHORT[monthIdx] ?? 'Jan';
  return `${dd}-${mmm}-${year}`;
}

export function formatTimeHM(input: string | Date | null | undefined): string {
  if (!input) return '--:--';
  const parsed = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(parsed.getTime())) return '--:--';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}

export function formatDateTimeDMY(input: string | Date | null | undefined): string {
  if (!input) return '-';
  return `${formatDateDMY(input)} ${formatTimeHM(input)}`;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthPrefix(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatMonthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-').map(Number);
  const mmm = MONTHS_SHORT[m - 1] ?? 'Jan';
  return `${mmm} ${y}`;
}

export function diffDaysInclusive(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(0, diff);
}

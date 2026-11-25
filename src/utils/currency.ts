export function formatIDR(amount: number | null | undefined): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? Math.round(amount) : 0;
  const abs = Math.abs(value);
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return value < 0 ? `-Rp ${formatted}` : `Rp ${formatted}`;
}

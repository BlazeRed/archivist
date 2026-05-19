export function yearMonthKey(taken_at: string | null | undefined): string {
  if (!taken_at) return '__nodate__';
  const d = new Date(taken_at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function parseYearMonth(key: string): { year: number; month: number } | null {
  if (key === '__nodate__') return null;
  const [year, month] = key.split('-').map(Number);
  return { year, month };
}

/**
 * Checks whether a given date string (YYYY-MM-DD) falls within the current calendar week
 * (Monday 00:00:00 to Sunday 23:59:59).
 */
export function isDateInCurrentWeek(dateStr: string): boolean {
  try {
    const target = new Date(dateStr);
    if (isNaN(target.getTime())) return false;
    target.setHours(0, 0, 0, 0);

    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 for Monday, 6 for Sunday

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return target >= startOfWeek && target <= endOfWeek;
  } catch {
    return false;
  }
}

export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  const clean = timeStr.trim().toUpperCase();
  const match = clean.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3];

  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  } else if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }
  return hours * 60 + minutes;
}

export function doTimesOverlap(
  startAStr: string,
  endAStr: string | undefined,
  startBStr: string,
  endBStr: string | undefined
): boolean {
  const startA = parseTimeToMinutes(startAStr);
  if (startA === null) return false;
  let endA = parseTimeToMinutes(endAStr || "");
  if (endA === null || endA <= startA) endA = startA + 45;

  const startB = parseTimeToMinutes(startBStr);
  if (startB === null) return false;
  let endB = parseTimeToMinutes(endBStr || "");
  if (endB === null || endB <= startB) endB = startB + 45;

  return Math.max(startA, startB) < Math.min(endA, endB);
}

export function getDayOfWeekFromDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length < 3) return "";
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const dt = new Date(y, m, d);
  const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  return days[dt.getDay()] || "";
}

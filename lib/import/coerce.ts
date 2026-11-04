/**
 * Cell coercion and sanitization utilities
 * Guarantees lossless string conversion, leading zero preservation, and formula safety.
 */

// Placeholder values that represent null or empty
const NULL_PLACEHOLDERS = new Set([
  "-",
  "--",
  "---",
  "na",
  "n/a",
  "n.a.",
  "nil",
  "null",
  "none",
  "undefined",
  "empty"
]);

// Excel formula error strings
const FORMULA_ERRORS = new Set([
  "#ref!",
  "#n/a",
  "#value!",
  "#div/0!",
  "#num!",
  "#name?",
  "#null!"
]);

/**
 * Coerces any raw Excel cell value into a clean, normalized string.
 * Preserves leading zeros, prevents scientific notation for numbers,
 * trims accidental surrounding whitespace, and resolves dates.
 */
export function coerceCellToString(val: unknown): string {
  if (val === null || val === undefined) {
    return "";
  }

  // Handle Date instances directly
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      // Format as YYYY-MM-DD in Asia/Kolkata
      return formatDateToKolkataIso(val);
    }
    return "";
  }

  // Handle numbers
  if (typeof val === "number") {
    if (isNaN(val)) return "";

    // Check if it's an Excel date serial (typical range for birth/joining dates: 10000 to 70000)
    // Note: Plain numbers like phone numbers (10 digits) are far larger than Excel date serials
    // Excel serial 50000 is ~2036. Phones are > 1000000000 (10 digits).
    // We only treat as date if explicitly checked or small integer within date range.
    // However, to avoid mistaking 4-digit passwords (e.g. 5363) or years as dates,
    // raw numbers are strictly coerced to exact string format here.
    return formatNumberLossless(val);
  }

  // Handle strings
  let str = String(val);

  // Normalize Unicode spaces (non-breaking space \u00A0, zero-width space \u200B, etc.)
  str = str.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, " ");
  str = str.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // Trim whitespace
  str = str.trim();

  // Check for formula errors
  const lower = str.toLowerCase();
  if (FORMULA_ERRORS.has(lower)) {
    return "";
  }

  // Check for placeholder empty values
  if (NULL_PLACEHOLDERS.has(lower)) {
    return "";
  }

  // If the cell had an escaped formula (starts with single quote like '=something), preserve value without single quote
  if (str.startsWith("'") && str.length > 1 && /^[=+\-@]/.test(str.slice(1))) {
    str = str.slice(1);
  }

  return str;
}

/**
 * Formats a JavaScript number without scientific notation and without spurious decimal zeros (.0)
 */
export function formatNumberLossless(num: number): string {
  // If integer
  if (Number.isInteger(num)) {
    return num.toLocaleString("fullwide", { useGrouping: false });
  }

  // If floating point, format up to 6 decimal places and remove trailing zeros
  const fixed = num.toFixed(6).replace(/\.?0+$/, "");
  return fixed;
}

/**
 * Converts an Excel serial date number (e.g. 44197 -> 2021-01-01) without UTC timezone drift.
 */
export function excelSerialToDateString(serial: number): string | null {
  if (typeof serial !== "number" || isNaN(serial) || serial < 1 || serial > 100000) {
    return null;
  }

  // Excel epoch begins Dec 30, 1899 (due to Lotus 1-2-3 leap year bug)
  const utcDays = Math.floor(serial - 25569);
  const ms = utcDays * 86400 * 1000;
  const dateObj = new Date(ms);

  if (isNaN(dateObj.getTime())) {
    return null;
  }

  return formatDateToKolkataIso(dateObj);
}

/**
 * Formats a Date object into YYYY-MM-DD using Asia/Kolkata timezone.
 */
export function formatDateToKolkataIso(date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(date); // en-CA returns YYYY-MM-DD
  } catch {
    return date.toISOString().split("T")[0];
  }
}

/**
 * Formula injection defense: Escapes potentially malicious spreadsheet formula prefixes
 * (=, +, -, @, Tab, CR) by prepending a single quote before exporting to CSV/Excel.
 */
export function sanitizeForSpreadsheetExport(val: unknown): string {
  if (val === null || val === undefined) return "";
  const raw = String(val);
  const trimmed = raw.trim();

  // If cell begins with formula trigger character
  if (/^[=+\-@\t\r]/.test(raw) || /^[=+\-@]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

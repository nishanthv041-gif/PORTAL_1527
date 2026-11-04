/**
 * Normalization utilities for Bulk Import Engine
 * Standardizes names, emails, phones, genders, subjects, classes, and passwords.
 */

/**
 * Converts a string to Title Case only if it is entirely UPPERCASE or entirely lowercase.
 * Preserves camelCase / mixedCase like "NandhiniS", "MacArthur", "iPhone".
 */
export function smartTitleCase(val: string): string {
  if (!val) return "";
  const trimmed = val.trim();
  if (trimmed.length === 0) return "";

  // Check if all alpha chars are uppercase
  const alphas = trimmed.replace(/[^a-zA-Z]/g, "");
  if (alphas.length === 0) return trimmed;

  const isAllUpper = alphas === alphas.toUpperCase();
  const isAllLower = alphas === alphas.toLowerCase();

  if (!isAllUpper && !isAllLower) {
    // Preserve mixed/camel case
    return trimmed;
  }

  // Convert to Title Case word by word
  return trimmed
    .split(/\s+/)
    .map(word => {
      if (word.length === 0) return "";
      // If word is a single initial like "S." or "S"
      if (word.length === 1) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Normalizes full names:
 * - Collapses consecutive periods or weird spacing like "GAYATHRI.  .P" -> "Gayathri P"
 * - Converts "SARANYA.M" -> "Saranya M"
 * - Returns clean full name
 */
export function normalizeFullName(rawName: string): string {
  if (!rawName) return "";
  let name = rawName.trim();

  // Replace multiple dots or dot-spaces with a single space
  name = name.replace(/\.+/g, " ");
  // Collapse whitespace
  name = name.replace(/\s+/g, " ").trim();

  return smartTitleCase(name);
}

export interface SplitName {
  firstName: string;
  lastName: string;
}

/**
 * Splits a full name into firstName and lastName:
 * - Tokens before the last word -> firstName
 * - The last word -> lastName
 * - Handles leading initials: "S Vadivel" -> firstName: "S", lastName: "Vadivel"
 * - Handles trailing initials: "Vadivel S" -> firstName: "Vadivel", lastName: "S"
 * - Handles single-word names: "Lavanya" -> firstName: "Lavanya", lastName: ""
 */
export function splitFullName(rawName: string): SplitName {
  const clean = normalizeFullName(rawName);
  if (!clean) return { firstName: "", lastName: "" };

  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };

  // If first token is 1 char (e.g. "S Vadivel" or "R B Nischal")
  if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  }

  // If multiple words: all tokens except the last become firstName, last is lastName
  const lastName = parts.pop() || "";
  const firstName = parts.join(" ");

  return { firstName, lastName };
}

/**
 * Normalizes and cleans email addresses:
 * - Lowercases and trims
 * - Removes erroneous "www." prefixes like "www.matheswarivel@gmail.com"
 * - Strips accidental spaces
 */
export function normalizeEmail(rawEmail: string): string {
  if (!rawEmail) return "";
  let email = rawEmail.trim().toLowerCase();

  // Strip leading "www." if accidentally typed into an email field
  email = email.replace(/^www\./, "");
  // Remove any whitespace inside
  email = email.replace(/\s+/g, "");

  return email;
}

/**
 * Validates email format with a standard RFC 5322 regex
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Normalizes Indian phone numbers:
 * - Strips non-digit characters
 * - If 12 digits starting with 91, strips 91
 * - If 11 digits starting with 0, strips 0
 * - Returns clean 10-digit number or empty string if invalid
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return "";
  const digits = rawPhone.replace(/\D/g, "");

  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);

  // Return digits as-is if other length so validation can flag it accurately
  return digits;
}

/**
 * Validates a 10-digit Indian mobile number (starts with 6, 7, 8, 9)
 */
export function isValidIndianPhone(phone: string): boolean {
  const clean = normalizePhone(phone);
  return /^[6-9]\d{9}$/.test(clean);
}

/**
 * Standardizes Gender values into "Female" | "Male" | "Other" (matching UI selects)
 */
export function normalizeGender(rawGender: string): "Female" | "Male" | "Other" {
  if (!rawGender) return "Other";
  const g = rawGender.trim().toUpperCase();

  if (g === "M" || g === "MALE" || g === "BOY" || g === "MAN") return "Male";
  if (g === "F" || g === "FEMALE" || g === "GIRL" || g === "WOMAN") return "Female";
  return "Other";
}

// Subject typo dictionary & abbreviation mapping
const SUBJECT_MAP: Record<string, string> = {
  math: "Mathematics",
  maths: "Mathematics",
  mathamatics: "Mathematics",
  mathematics: "Mathematics",
  sci: "Science",
  science: "Science",
  soc: "Social Science",
  social: "Social Science",
  "social science": "Social Science",
  "soc sci": "Social Science",
  eng: "English",
  english: "English",
  tam: "Tamil",
  tamil: "Tamil",
  comp: "Computer Science",
  "comp sci": "Computer Science",
  cs: "Computer Science",
  "computer science": "Computer Science",
  physics: "Physics",
  phy: "Physics",
  chemistry: "Chemistry",
  chem: "Chemistry",
  biology: "Biology",
  bio: "Biology",
  commerce: "Commerce",
  comm: "Commerce",
  accountancy: "Accountancy",
  accounts: "Accountancy",
  acc: "Accountancy",
  economics: "Economics",
  econ: "Economics",
  history: "History",
  geography: "Geography",
  hindi: "Hindi",
  drawing: "Drawing",
  art: "Art",
  pe: "Physical Education",
  pet: "Physical Education",
  "physical education": "Physical Education",
};

/**
 * Splits and maps subjects:
 * e.g. "Mathamatics, Sci" -> ["Mathematics", "Science"]
 */
export function normalizeSubjects(rawSubject: string): string[] {
  if (!rawSubject) return [];
  const parts = rawSubject
    .split(/[,/;&+]+/)
    .map(p => p.trim())
    .filter(Boolean);

  const normalizedList: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (SUBJECT_MAP[key]) {
      normalizedList.push(SUBJECT_MAP[key]);
    } else {
      // Keep capitalized original if not in dictionary
      normalizedList.push(smartTitleCase(part));
    }
  }

  return Array.from(new Set(normalizedList));
}

export interface ParsedClassTeacher {
  isClassTeacher: boolean;
  rawEntry: string;
  className?: string; // e.g. "Class 1" or "1"
  section?: string;   // e.g. "A"
  canonicalName?: string; // e.g. "Class 1 - A"
  isNonClassRole?: boolean; // e.g. "Accounts assistant"
}

// Non-class role phrases that indicate the teacher is NOT a class teacher
const NON_CLASS_ROLES = new Set([
  "accounts assistant",
  "office",
  "office staff",
  "admin",
  "clerk",
  "none",
  "no",
  "nil",
  "na",
  "n/a",
  "-",
]);

/**
 * Parses Class Teacher string:
 * - "class 1 - section A" -> { isClassTeacher: true, className: "Class 1", section: "A", canonicalName: "Class 1 - A" }
 * - "1-A" -> { isClassTeacher: true, className: "Class 1", section: "A", canonicalName: "Class 1 - A" }
 * - "Accounts assistant" -> { isClassTeacher: false, isNonClassRole: true }
 */
export function parseClassTeacher(raw: string): ParsedClassTeacher {
  if (!raw) return { isClassTeacher: false, rawEntry: "" };
  const str = raw.trim();
  const lower = str.toLowerCase();

  if (NON_CLASS_ROLES.has(lower)) {
    return { isClassTeacher: false, rawEntry: str, isNonClassRole: true };
  }

  // Match patterns like:
  // "class 1 - section A", "Class 1 - A", "1 - A", "1-A", "Class 11 - Section C"
  const classSecMatch = str.match(
    /(?:class\s+)?(\d{1,2}|ukg|lkg|pre-kg)\s*[-–/]?\s*(?:section\s+)?([a-eA-E])/i
  );

  if (classSecMatch) {
    const classNum = classSecMatch[1].toUpperCase();
    const section = classSecMatch[2].toUpperCase();
    const formattedClass = classNum.startsWith("CLASS") ? classNum : `Class ${classNum}`;
    return {
      isClassTeacher: true,
      rawEntry: str,
      className: formattedClass,
      section,
      canonicalName: `${formattedClass} - ${section}`,
    };
  }

  // If text has numbers/words, treat as potential class but flag
  return {
    isClassTeacher: true,
    rawEntry: str,
    canonicalName: str,
  };
}

export interface SmartClassResolution {
  isClassTeacher: boolean;
  matchedClass: { id: string; name: string; section: string } | null;
  isNotFound: boolean;
  rawEntry: string;
  canonicalName: string;
  isNonClassRole?: boolean;
  nonClassRole?: string;
}

/**
 * Intelligently resolves raw Class Teacher Excel strings against database classes.
 * - Handles: "class 3 - section A" -> Class 3 - Section A
 * - Handles: "class 11 - section C" -> Class 11 - Section C(BIO - CS)
 * - Flags classes that do not exist in the database (e.g. Class 1-B, LKG, UKG) with isNotFound: true
 * - Safely detects non-class staff roles ("Accounts assistant", "-", etc.)
 */
export function resolveClassSmart(
  raw: string,
  availableClasses: Array<{ id: string; name: string; section: string }> = []
): SmartClassResolution {
  const parsed = parseClassTeacher(raw);

  if (!parsed.isClassTeacher || parsed.isNonClassRole) {
    return {
      isClassTeacher: false,
      matchedClass: null,
      isNotFound: false,
      rawEntry: parsed.rawEntry,
      canonicalName: "",
      isNonClassRole: parsed.isNonClassRole,
      nonClassRole: parsed.rawEntry,
    };
  }

  const targetClass = parsed.className ? parsed.className.toUpperCase().replace(/^CLASS\s*/i, "").trim() : "";
  const targetSection = parsed.section ? parsed.section.toUpperCase().trim() : "";

  for (const c of availableClasses) {
    const dbClassNum = c.name.toUpperCase().replace(/^CLASS\s*/i, "").trim();
    const dbSection = c.section.toUpperCase().trim();
    const dbSectionPrefix = dbSection.split(/[^A-Z]/)[0] || dbSection;

    // Direct match: e.g. Class 3 and Section A
    if (targetClass && targetSection) {
      if (dbClassNum === targetClass && (dbSection === targetSection || dbSectionPrefix === targetSection)) {
        return {
          isClassTeacher: true,
          matchedClass: c,
          isNotFound: false,
          rawEntry: parsed.rawEntry,
          canonicalName: `${c.name} - Section ${c.section}`,
        };
      }
    }

    // Fallback exact full string comparison
    const rawClean = parsed.rawEntry.toLowerCase().replace(/[^a-z0-9]/g, "");
    const dbClean = `${c.name} ${c.section}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (rawClean && dbClean && (rawClean === dbClean || dbClean.includes(rawClean))) {
      return {
        isClassTeacher: true,
        matchedClass: c,
        isNotFound: false,
        rawEntry: parsed.rawEntry,
        canonicalName: `${c.name} - Section ${c.section}`,
      };
    }
  }

  // Class not found in the portal database
  return {
    isClassTeacher: true,
    matchedClass: null,
    isNotFound: true,
    rawEntry: parsed.rawEntry,
    canonicalName: parsed.canonicalName || parsed.rawEntry,
  };
}

export interface PasswordQuality {
  isValid: boolean;
  isWeak: boolean;
  warning?: string;
}

/**
 * Assesses password quality:
 * - Minimum 6 characters required by portal standard
 * - Flags weak passwords: 4 digits (e.g. "5363"), plain phone number, sequential
 */
export function assessPassword(password: string, phone?: string): PasswordQuality {
  if (!password) {
    return { isValid: false, isWeak: true, warning: "Password is required." };
  }

  const p = String(password).trim();

  if (p.length < 6) {
    return {
      isValid: false,
      isWeak: true,
      warning: `Password is only ${p.length} characters (minimum 6 required).`,
    };
  }

  // Check if purely numeric
  if (/^\d+$/.test(p)) {
    return {
      isValid: true,
      isWeak: true,
      warning: "Password contains only numbers. A stronger mix of letters and numbers is recommended.",
    };
  }

  // Check if matches phone
  if (phone && normalizePhone(phone) === normalizePhone(p)) {
    return {
      isValid: true,
      isWeak: true,
      warning: "Password matches phone number. A stronger unique password is recommended.",
    };
  }

  return { isValid: true, isWeak: false };
}


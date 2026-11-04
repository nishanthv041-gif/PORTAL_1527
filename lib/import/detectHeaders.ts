/**
 * Header detection and column mapping engine.
 * Solves Bug 1: Exact-token matching guarantees "NAME" matches "name", NEVER "classTeacher".
 * Prepares 3-row sample previews for each column.
 */

import { ColumnMappingItem, RawRow } from "./types";
import { TargetFieldDef, TEACHER_TARGET_FIELDS } from "./schemas/teacher";
import { STUDENT_TARGET_FIELDS } from "./schemas/student";

/**
 * Normalizes a header label into a clean comparable token:
 * - Lowercases and trims
 * - Replaces dots, underscores, dashes with single spaces
 * - Collapses consecutive whitespace
 */
export function normalizeHeaderToken(header: string): string {
  if (!header) return "";
  return header
    .toLowerCase()
    .replace(/[._\-–/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Automatically maps Excel headers to target field definitions.
 * Employs exact-first matching followed by strict alias dictionary lookups.
 */
export function autoMapColumns(
  headers: string[],
  rows: RawRow[],
  targetFields: TargetFieldDef[]
): ColumnMappingItem[] {
  const result: ColumnMappingItem[] = [];
  const assignedFields = new Set<string>();

  // Extract up to 3 non-empty sample values for each column
  const sampleMap = new Map<string, string[]>();
  for (const h of headers) {
    const samples: string[] = [];
    for (const r of rows) {
      const val = (r.cells[h] || "").trim();
      if (val && !samples.includes(val)) {
        samples.push(val);
        if (samples.length >= 3) break;
      }
    }
    sampleMap.set(h, samples);
  }

  // 1. Pass 1: Exact matches against target key
  const unmappedHeaders: string[] = [];

  for (const h of headers) {
    const token = normalizeHeaderToken(h);
    const samples = sampleMap.get(h) || [];

    // Exact key match (e.g. "gender" === "gender")
    const exactTarget = targetFields.find(
      tf => !assignedFields.has(tf.key) && tf.key.toLowerCase() === token
    );

    if (exactTarget) {
      assignedFields.add(exactTarget.key);
      result.push({
        excelHeader: h,
        targetField: exactTarget.key,
        confidence: "EXACT",
        sampleValues: samples,
      });
      continue;
    }

    // Exact alias match (e.g. "sign in with google mail id" in aliases)
    const aliasTarget = targetFields.find(
      tf => !assignedFields.has(tf.key) && tf.aliases.some(a => a.toLowerCase() === token)
    );

    if (aliasTarget) {
      assignedFields.add(aliasTarget.key);
      result.push({
        excelHeader: h,
        targetField: aliasTarget.key,
        confidence: "ALIAS",
        sampleValues: samples,
      });
      continue;
    }

    unmappedHeaders.push(h);
  }

  // 2. Pass 2: Fuzzy / token contains matches for remaining unassigned headers
  for (const h of unmappedHeaders) {
    const token = normalizeHeaderToken(h);
    const samples = sampleMap.get(h) || [];

    let matchedTarget: TargetFieldDef | null = null;

    for (const tf of targetFields) {
      if (assignedFields.has(tf.key)) continue;

      // Check if any alias is an exact word boundary in the token
      // E.g. "teacher's name" or "faculty phone number"
      const match = tf.aliases.some(alias => {
        // Guard against false positives: "name" must NOT match "class teacher"
        if (tf.key === "name" && (token.includes("teacher") || token.includes("class"))) {
          return false;
        }
        if (tf.key === "classTeacher" && !token.includes("class")) {
          return false;
        }

        const regex = new RegExp(`\\b${alias}\\b`, "i");
        return regex.test(token);
      });

      if (match) {
        matchedTarget = tf;
        break;
      }
    }

    if (matchedTarget) {
      assignedFields.add(matchedTarget.key);
      result.push({
        excelHeader: h,
        targetField: matchedTarget.key,
        confidence: "FUZZY",
        sampleValues: samples,
      });
    } else {
      result.push({
        excelHeader: h,
        targetField: null,
        confidence: "UNMAPPED",
        sampleValues: samples,
      });
    }
  }

  return result;
}

/**
 * Returns the appropriate TargetFieldDef list for a given role.
 */
export function getTargetFieldsForRole(role: "TEACHER" | "STUDENT" | "PARENT"): TargetFieldDef[] {
  switch (role) {
    case "TEACHER":
      return TEACHER_TARGET_FIELDS;
    case "STUDENT":
    case "PARENT":
      return STUDENT_TARGET_FIELDS;
    default:
      return TEACHER_TARGET_FIELDS;
  }
}


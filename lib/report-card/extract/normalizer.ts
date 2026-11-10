/**
 * Subject name normalizer (map aliases to one canonical name).
 * Unknown names are converted to Title Case.
 */
export function normalizeSubjectName(raw: string): string {
  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "");

  if (/^(MATHS?|MATHEMATICS|MATHS?1|MATHS?2)$/.test(clean)) return "Mathematics";
  if (/^(SOCIAL(\s*SCIENCE)?|SST|HIS(TORY)?|GEO(GRAPHY)?)$/.test(clean)) return "Social Science";
  if (/^(SCI(ENCE)?|GEN(ERAL)?\s*SCI(ENCE)?)$/.test(clean)) return "Science";
  if (/^(TAMIL|TAM)$/.test(clean)) return "Tamil";
  if (/^(ENG(LISH)?|LANG(\s*2)?)$/.test(clean)) return "English";
  if (/^(HINDI|HIN)$/.test(clean)) return "Hindi";
  if (/^(COMP(UTER)?(\s*SCI(ENCE)?)?|CS|IP|IT)$/.test(clean)) return "Computer Science";
  if (/^(EVS|ENV(IRONMENTAL)?(\s*STUDIES)?)$/.test(clean)) return "Environmental Studies";
  if (/^(PHYSICS|PHY)$/.test(clean)) return "Physics";
  if (/^(CHEM(ISTRY)?|CHE)$/.test(clean)) return "Chemistry";
  if (/^(BIO(LOGY)?|BOTANY|ZOOLOGY)$/.test(clean)) return "Biology";

  // Title Case fallback
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

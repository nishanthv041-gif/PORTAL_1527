/**
 * Standardize and format class names so "Class Class 2 - A" never happens.
 * Strips repeated "Class" or "Grade" prefixes and prevents duplicated section suffix.
 * Safe for both Client and Server Components (zero DB/Node dependencies).
 */
export function formatClassName(name: string, section?: string | null): string {
  let cleanName = (name || "").trim();
  // Strip repeated Class or Grade prefixes case-insensitively
  cleanName = cleanName.replace(/^((class|grade)[\s_:-]*)+/i, "").trim();

  const sec = (section || "").trim();
  if (sec) {
    // If cleanName already ends with the section suffix (e.g. "- A" or "_A"), strip it before appending
    const secPattern = new RegExp(`[\\s_:-]+${sec}$`, "i");
    if (secPattern.test(cleanName)) {
      cleanName = cleanName.replace(secPattern, "").trim();
    }
    return `Class ${cleanName} - ${sec}`;
  }
  return `Class ${cleanName}`;
}

export default formatClassName;


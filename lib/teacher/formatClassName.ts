/**
 * Standardize and format class names so "Class Class 2 - A" never happens.
 * Strips any leading "Class" or "Grade" before prepending "Class".
 * Safe for both Client and Server Components (zero DB/Node dependencies).
 */
export function formatClassName(name: string, section?: string | null): string {
  let cleanName = (name || "").trim();
  // Strip duplicate Class or Grade prefixes case-insensitively
  cleanName = cleanName.replace(/^(class|grade)\s+/i, "").replace(/^(class|grade)\s+/i, "").trim();
  const sec = (section || "").trim();
  if (sec) {
    return `Class ${cleanName} - ${sec}`;
  }
  return `Class ${cleanName}`;
}

export default formatClassName;


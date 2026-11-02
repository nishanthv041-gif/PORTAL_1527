export const SUPER_ADMIN_EMAILS = [
  "jpranav116@gmail.com",
  "nishanthv041@gmail.com",
] as const;

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.some(
    (superAdminEmail) => superAdminEmail.toLowerCase() === normalized
  );
}


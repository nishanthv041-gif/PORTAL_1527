export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get DATABASE_URL() { return requireEnv('DATABASE_URL'); },
  get NEXTAUTH_SECRET() { return requireEnv('NEXTAUTH_SECRET'); },
  get NEXTAUTH_URL() { 
    if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return requireEnv('NEXTAUTH_URL'); 
  },
  get GOOGLE_CLIENT_ID() { return requireEnv('GOOGLE_CLIENT_ID'); },
  get GOOGLE_CLIENT_SECRET() { return requireEnv('GOOGLE_CLIENT_SECRET'); },
};

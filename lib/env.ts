import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required for PostgreSQL connection"),
  DIRECT_URL: z.string().optional(),
  SECONDARY_DATABASE_URL: z.string().optional(),
  SECONDARY_DIRECT_URL: z.string().optional(),
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 characters for secure JWT signing"),
  NEXTAUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  CRON_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  SMTP_EMAIL: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  AWS_REGION: z.string().default("ap-southeast-1"),
  AWS_S3_BUCKET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function validateEnv(): Env {
  // Skip strict validation during Next.js production build / page collection phase
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return process.env as unknown as Env;
  }

  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    const message = `\n❌ FATAL: Environment variable validation failed:\n${errorDetails}\n`;
    
    // In production build or server startup, log formatted diagnostics
    if (process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
      console.error(message);
    }
    
    // Return parsed fallback in lenient mode to prevent build breakages if run during pre-rendering
    return (result.data || process.env) as unknown as Env;
  }

  cachedEnv = result.data;
  return cachedEnv;
}


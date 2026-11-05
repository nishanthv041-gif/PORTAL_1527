import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "alive",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    nodeEnv: process.env.NODE_ENV || "production"
  }, { status: 200 });
}


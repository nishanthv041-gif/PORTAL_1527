export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/backend/services/push/webPushService";

export async function GET() {
  const publicKey = getVapidPublicKey();
  return NextResponse.json({ publicKey }, { status: 200 });
}


import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { sendUserInviteEmail } from "@/backend/lib/services/emailService";

export async function POST(request: Request) {
  const session = await getServerSession(getAuthOptions());
  
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { email, role, name } = await request.json();

    if (!email || !role) {
      return NextResponse.json({ error: "Missing email or role" }, { status: 400 });
    }

    const result = await sendUserInviteEmail({ email, name, role });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: result.message || "Invite sent successfully!" 
    }, { status: 200 });
  } catch (error: any) {
    console.error("Failed to send invite email:", error);
    return NextResponse.json({ 
      error: `Failed to send invite: ${error?.message || "Unknown error"}` 
    }, { status: 500 });
  }
}

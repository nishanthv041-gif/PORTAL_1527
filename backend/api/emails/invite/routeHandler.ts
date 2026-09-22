import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

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

    // Mock sending email
    console.log(`[EMAIL SERVICE] Sending invite email to ${name} (${email}) for role ${role}...`);
    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(`[EMAIL SERVICE] Successfully sent email to ${email}`);

    return NextResponse.json({ success: true, message: "Invite sent successfully!" }, { status: 200 });
  } catch (error) {
    console.error("Failed to send invite:", error);
    return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
  }
}

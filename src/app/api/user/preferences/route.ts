import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const VALID_THEMES = ["light", "dark", "system"] as const;
type Theme = typeof VALID_THEMES[number];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { theme: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ theme: user.theme });
  } catch (error) {
    console.error("GET /api/user/preferences error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("theme" in body) ||
      typeof (body as { theme: unknown }).theme !== "string"
    ) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const theme = (body as { theme: string }).theme as Theme;

    if (!VALID_THEMES.includes(theme)) {
      return NextResponse.json(
        { error: `Invalid theme. Must be one of: ${VALID_THEMES.join(", ")}` },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { theme },
      select: { theme: true },
    });

    return NextResponse.json({ theme: updated.theme });
  } catch (error) {
    console.error("PATCH /api/user/preferences error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

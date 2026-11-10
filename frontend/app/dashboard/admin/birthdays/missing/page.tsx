import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { getMissingDobSummaryAction } from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import MissingDobClient from "./MissingDobClient";

export const dynamic = "force-dynamic";

export default async function MissingDobPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const [summary, classes] = await Promise.all([
    getMissingDobSummaryAction(),
    prisma.class.findMany({
      select: { id: true, name: true, section: true },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    }),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <MissingDobClient initialData={summary} classes={classes} />
    </div>
  );
}

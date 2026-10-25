import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { prisma } from "@/backend/db/prisma";
import ExcelImportHubClient from "./ExcelImportHubClient";

export const metadata = {
  title: "Intelligent Excel Import | School Portal Admin",
  description: "Bulk import student, parent, and teacher accounts safely from Excel templates."
};

export default async function ExcelImportPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user?.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const classes = await prisma.class.findMany({
    where: { isActive: true },
    select: { id: true, name: true, section: true },
    orderBy: [{ name: "asc" }, { section: "asc" }]
  });

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem 1rem" }}>
      <ExcelImportHubClient classes={classes} />
    </div>
  );
}

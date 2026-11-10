import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { getClassTeacherReconciliationData } from "@/backend/api/actions/dashboard/admin/classes/classTeacherActions";
import ClassTeacherReconciliationClient from "./ClassTeacherReconciliationClient";

export const dynamic = "force-dynamic";

export default async function ClassTeacherReconciliationPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const data = await getClassTeacherReconciliationData();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <ClassTeacherReconciliationClient initialData={data} />
    </div>
  );
}


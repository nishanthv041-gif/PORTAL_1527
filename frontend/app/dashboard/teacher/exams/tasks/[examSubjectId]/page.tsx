import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getExamSubjectMarksDataAction } from "@/backend/api/actions/exams/marksEntryActions";
import ExamSubjectMarksWorkspaceClient from "./ExamSubjectMarksWorkspaceClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Marks Entry Workspace | SRT Portal",
  description: "Enter, draft, or upload marks for class students.",
};

export default async function ExamSubjectMarksWorkspacePage({
  params,
}: {
  params: Promise<{ examSubjectId: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user.role || "").toUpperCase();
  if (role !== "TEACHER" && role !== "ADMIN") {
    redirect("/dashboard");
  }

  const { examSubjectId } = await params;
  if (!examSubjectId) {
    notFound();
  }

  const res = await getExamSubjectMarksDataAction(examSubjectId);
  if (!res.success || !res.task || !res.entries) {
    return (
      <div style={{ maxWidth: "800px", margin: "2rem auto", padding: "1.5rem", background: "#0f172a", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
        <h2 style={{ color: "#ef4444", marginBottom: "0.5rem" }}>Unable to Open Marks Task</h2>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>{res.error || "Marks entry task not found or access denied."}</p>
        <Link
          href="/dashboard/teacher/exams/tasks"
          style={{ display: "inline-block", marginTop: "1rem", padding: "0.5rem 1rem", background: "#3b82f6", color: "#fff", borderRadius: "8px", textDecoration: "none", fontSize: "0.85rem" }}
        >
          Return to My Marks Tasks
        </Link>
      </div>
    );
  }

  return (
    <ExamSubjectMarksWorkspaceClient
      task={res.task as any}
      initialEntries={res.entries as any}
    />
  );
}


import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect, notFound } from "next/navigation";
import { getClassTeacherExamMarksGridAction } from "@/backend/api/actions/exams/classTeacherMarksActions";
import ConsolidatedMarksReviewClient from "./ConsolidatedMarksReviewClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Consolidated Marks Review | SRT Portal",
  description: "Class teacher all-student marks review, verification, and report card publishing.",
};

export default async function ConsolidatedMarksReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user.role || "").toUpperCase();
  if (role !== "TEACHER" && role !== "ADMIN") {
    redirect("/dashboard");
  }

  const { id } = await params;
  if (!id) {
    notFound();
  }

  const res = await getClassTeacherExamMarksGridAction(id);
  if (!res.success || !res.exam || !res.subjects || !res.rows) {
    return (
      <div style={{ maxWidth: "800px", margin: "2rem auto", padding: "1.5rem", background: "#0f172a", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
        <h2 style={{ color: "#ef4444", marginBottom: "0.5rem" }}>Unable to Open Marks Review</h2>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>{res.error || "Exam not found or you are not the assigned Class Teacher for this class."}</p>
        <a
          href="/dashboard/teacher/exams"
          style={{ display: "inline-block", marginTop: "1rem", padding: "0.5rem 1rem", background: "#3b82f6", color: "#fff", borderRadius: "8px", textDecoration: "none", fontSize: "0.85rem" }}
        >
          Return to Exams
        </a>
      </div>
    );
  }

  return (
    <ConsolidatedMarksReviewClient
      exam={res.exam as any}
      subjects={res.subjects as any}
      initialRows={res.rows as any}
    />
  );
}


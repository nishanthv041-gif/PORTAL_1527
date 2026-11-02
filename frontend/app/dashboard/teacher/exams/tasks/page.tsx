import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { getTeacherMarksTasksAction } from "@/backend/api/actions/exams/marksEntryActions";
import TeacherMarksTasksClient from "./TeacherMarksTasksClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Marks Tasks | SRT Portal",
  description: "Enter and submit subject marks to Class Teachers.",
};

export default async function TeacherMarksTasksPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user.role || "").toUpperCase();
  if (role !== "TEACHER" && role !== "ADMIN") {
    redirect("/dashboard");
  }

  const res = await getTeacherMarksTasksAction();
  const tasks = res.success ? res.tasks || [] : [];

  return <TeacherMarksTasksClient tasks={tasks} />;
}


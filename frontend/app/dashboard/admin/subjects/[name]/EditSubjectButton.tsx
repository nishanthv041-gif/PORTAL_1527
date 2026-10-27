"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import EditSubjectModal from "../EditSubjectModal";
import { Class, Teacher, User, Subject, Student, Mark } from "@prisma/client";

type TeacherWithUser = Teacher & { user: User };
type SubjectWithRelations = Subject & {
  class: Class & { students: Student[] };
  teacher: TeacherWithUser | null;
  marks: Mark[];
};

export default function EditSubjectButton({
  subjectName,
  instances,
  classes,
  teachers,
}: {
  subjectName: string;
  instances: SubjectWithRelations[];
  classes: Class[];
  teachers: TeacherWithUser[];
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const handleSuccess = (newName: string) => {
    if (newName !== subjectName) {
      router.push(`/dashboard/admin/subjects/${encodeURIComponent(newName)}`);
    } else {
      router.refresh();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.65rem 1.25rem",
          borderRadius: "10px",
          border: "1px solid rgba(234, 179, 8, 0.3)",
          background: "rgba(234, 179, 8, 0.12)",
          color: "var(--warning, #eab308)",
          fontWeight: 600,
          fontSize: "0.875rem",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <Pencil size={16} />
        <span>Edit Subject</span>
      </button>

      <EditSubjectModal
        subjectName={subjectName}
        instances={instances}
        classes={classes}
        teachers={teachers}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  );
}

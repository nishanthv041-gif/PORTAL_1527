"use client";

import { useState, useEffect } from "react";
import { 
  GraduationCap, Search, Calendar, User, Phone, Mail, 
  Award, Loader2, FileText, CheckCircle2 
} from "lucide-react";
import { getGraduatedStudentsAction } from "@/backend/api/actions/dashboard/admin/batches/actions";

export default function GraduatedStudentsTable() {
  const [graduatedStudents, setGraduatedStudents] = useState<any[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const fetchGraduated = async () => {
    setLoading(true);
    try {
      const res = await getGraduatedStudentsAction(selectedBatch, searchQuery);
      if (res.success && res.graduatedStudents) {
        setGraduatedStudents(res.graduatedStudents);
        if (res.graduationBatches) {
          setBatches(res.graduationBatches);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraduated();
  }, [selectedBatch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGraduated();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Top Filter and Search Bar */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        padding: "1rem 1.25rem",
        backgroundColor: "rgba(255, 255, 255, 0.02)",
        border: "1px solid var(--border-color)",
        borderRadius: "12px"
      }}>
        {/* Batch Filter Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-secondary)", marginRight: "0.25rem" }}>
            Graduation Batch:
          </span>
          <button
            type="button"
            onClick={() => setSelectedBatch("ALL")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "6px",
              border: selectedBatch === "ALL" ? "1px solid var(--primary, #6366f1)" : "1px solid var(--border-color)",
              backgroundColor: selectedBatch === "ALL" ? "rgba(99, 102, 241, 0.15)" : "transparent",
              color: selectedBatch === "ALL" ? "var(--primary, #6366f1)" : "var(--foreground)",
              fontWeight: 600,
              fontSize: "0.8125rem",
              cursor: "pointer"
            }}
          >
            All Batches
          </button>
          {batches.map(b => (
            <button
              key={b}
              type="button"
              onClick={() => setSelectedBatch(b)}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: "6px",
                border: selectedBatch === b ? "1px solid #f59e0b" : "1px solid var(--border-color)",
                backgroundColor: selectedBatch === b ? "rgba(245, 158, 11, 0.15)" : "transparent",
                color: selectedBatch === b ? "#f59e0b" : "var(--foreground)",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: "pointer"
              }}
            >
              🎓 Batch {b}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
            <input
              type="text"
              placeholder="Search by student name or roll..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: "0.45rem 0.75rem 0.45rem 2rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--card-bg, #1f2937)",
                color: "var(--foreground)",
                fontSize: "0.8125rem",
                width: "240px"
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: "0.45rem 0.85rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "var(--primary, #6366f1)",
              color: "#ffffff",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Search
          </button>
        </form>
      </div>

      {/* Graduated Students List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
          <Loader2 size={30} className="animate-spin" style={{ color: "var(--primary)" }} />
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>Loading alumni directory...</p>
        </div>
      ) : graduatedStudents.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "3.5rem 2rem",
          border: "1px dashed var(--border-color)",
          borderRadius: "12px",
          color: "var(--text-secondary)"
        }}>
          <GraduationCap size={44} style={{ opacity: 0.4, marginBottom: "0.5rem" }} />
          <h4 style={{ margin: "0 0 0.25rem", color: "var(--foreground)", fontSize: "1.1rem" }}>No Graduated Alumni Records Found</h4>
          <p style={{ margin: 0, fontSize: "0.85rem" }}>
            When Class 12 students are promoted during a batch rollover, they will automatically appear in this alumni directory.
          </p>
        </div>
      ) : (
        <div style={{
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
          overflow: "hidden"
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
            <thead>
              <tr style={{ backgroundColor: "rgba(0,0,0,0.05)", borderBottom: "1px solid var(--border-color)" }}>
                <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Student Name</th>
                <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Roll & Admission</th>
                <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Graduation Batch</th>
                <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Graduated Date</th>
                <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Parent Contacts</th>
                <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {graduatedStudents.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "0.85rem 1rem" }}>
                    <div style={{ fontWeight: 700, color: "var(--foreground)" }}>
                      {s.firstName} {s.lastName}
                    </div>
                  </td>
                  <td style={{ padding: "0.85rem 1rem" }}>
                    <div>Roll: <strong>{s.rollNumber}</strong></div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Adm: {s.admissionNo}</div>
                  </td>
                  <td style={{ padding: "0.85rem 1rem" }}>
                    <span style={{
                      padding: "0.25rem 0.6rem",
                      borderRadius: "6px",
                      backgroundColor: "rgba(245, 158, 11, 0.15)",
                      color: "#f59e0b",
                      fontWeight: 700,
                      fontSize: "0.8125rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem"
                    }}>
                      <GraduationCap size={13} /> Batch {s.graduationBatch || "Completed"}
                    </span>
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    {s.graduatedAt ? new Date(s.graduatedAt).toLocaleDateString() : "Recorded"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem" }}>
                    {s.parents?.length > 0 ? (
                      <div>
                        <div style={{ fontWeight: 500 }}>{s.parents[0].parent?.user?.name || "Parent"}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{s.parents[0].parent?.user?.email}</div>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>None on file</span>
                    )}
                  </td>
                  <td style={{ padding: "0.85rem 1rem" }}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      color: "#10b981",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.2rem 0.5rem",
                      backgroundColor: "rgba(16, 185, 129, 0.1)",
                      borderRadius: "4px"
                    }}>
                      <CheckCircle2 size={12} /> Alumni
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

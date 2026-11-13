"use client";

import { useState, useTransition } from "react";
import {
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Upload,
  Download,
  Users,
  GraduationCap,
  Briefcase,
  UserCheck,
  Heart,
  Truck,
  Save,
  Check,
  X,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import {
  MissingDobPerson,
  updateSinglePersonDobAction,
  previewBulkDobUploadAction,
  commitBulkDobUpdatesAction,
  BulkDobPreviewItem,
} from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import styles from "./MissingDobClient.module.css";

interface MissingDobClientProps {
  initialData: {
    totalPeople: number;
    totalMissing: number;
    completedCount: number;
    percentage: number;
    people: MissingDobPerson[];
  };
  classes: { id: string; name: string; section: string }[];
}

export default function MissingDobClient({ initialData, classes }: MissingDobClientProps) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [classFilter, setClassFilter] = useState<string>("ALL");

  // Inline edit state
  const [editingDates, setEditingDates] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set());
  const [wishedIds, setWishedIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Bulk Upload Modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewItems, setPreviewItems] = useState<BulkDobPreviewItem[] | null>(null);
  const [uploadStats, setUploadStats] = useState<{ total: number; matched: number; unmatched: number; invalid: number } | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  // Filtered people
  const filteredPeople = data.people.filter((person) => {
    // Role filter
    if (roleFilter !== "ALL" && person.role !== roleFilter) {
      return false;
    }
    // Class filter (only applies to students)
    if (classFilter !== "ALL") {
      if (person.role !== "STUDENT" || person.classId !== classFilter) {
        return false;
      }
    }
    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = person.name.toLowerCase().includes(q);
      const matchId = person.identifier.toLowerCase().includes(q);
      const matchClass = person.className?.toLowerCase().includes(q);
      return matchName || matchId || matchClass;
    }
    return true;
  });

  // Handle single DOB save
  const handleSaveDob = async (person: MissingDobPerson) => {
    const dobValue = editingDates[person.id];
    if (!dobValue) {
      setRowErrors((prev) => ({ ...prev, [person.id]: "Please select a date." }));
      return;
    }

    setSavingId(person.id);
    setRowErrors((prev) => ({ ...prev, [person.id]: "" }));

    const res = await updateSinglePersonDobAction({
      personType: person.role,
      personId: person.id,
      dateOfBirth: dobValue,
    });

    setSavingId(null);

    if (res.error) {
      setRowErrors((prev) => ({ ...prev, [person.id]: res.error || "Failed to save." }));
    } else {
      // Mark as success and remove from missing list
      setSuccessIds((prev) => new Set(prev).add(person.id));
      if (res.immediateSent || res.isBirthdayToday) {
        setWishedIds((prev) => new Set(prev).add(person.id));
      }
      const delay = (res.immediateSent || res.isBirthdayToday) ? 2200 : 1200;
      setTimeout(() => {
        setData((prev) => {
          const nextPeople = prev.people.filter((p) => p.id !== person.id);
          const nextCompleted = prev.completedCount + 1;
          const nextMissing = Math.max(0, prev.totalMissing - 1);
          return {
            ...prev,
            people: nextPeople,
            completedCount: nextCompleted,
            totalMissing: nextMissing,
            percentage: prev.totalPeople > 0 ? Math.round((nextCompleted / prev.totalPeople) * 100) : 100,
          };
        });
        setSuccessIds((prev) => {
          const s = new Set(prev);
          s.delete(person.id);
          return s;
        });
        setWishedIds((prev) => {
          const s = new Set(prev);
          s.delete(person.id);
          return s;
        });
      }, delay);
    }
  };

  // Handle Bulk Upload Preview
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setIsUploading(true);
    setCommitMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await previewBulkDobUploadAction(formData);
      setIsUploading(false);

      if (!res.success) {
        setCommitMessage(res.error || "Failed to parse file.");
        return;
      }

      setPreviewItems(res.items || []);
      setUploadStats({
        total: res.totalRows || 0,
        matched: res.matchedCount || 0,
        unmatched: res.unmatchedCount || 0,
        invalid: res.invalidDobCount || 0,
      });
    } catch {
      setIsUploading(false);
      setCommitMessage("An error occurred while uploading.");
    }
  };

  // Commit Bulk Upload
  const handleCommitBulk = async () => {
    if (!previewItems) return;
    setIsCommitting(true);

    const validItems = previewItems
      .filter((i) => i.status === "MATCHED")
      .map((i) => ({
        personId: i.personId,
        role: i.role,
        newDob: i.newDob,
      }));

    const res = await commitBulkDobUpdatesAction(validItems);
    setIsCommitting(false);

    if (res.success) {
      setCommitMessage(`Successfully updated ${res.updatedCount} Date of Birth records!`);
      // Update local state by removing matched IDs
      const updatedIds = new Set(validItems.map((v) => v.personId));
      setData((prev) => {
        const nextPeople = prev.people.filter((p) => !updatedIds.has(p.id));
        const added = prev.people.length - nextPeople.length;
        const nextCompleted = prev.completedCount + added;
        const nextMissing = Math.max(0, prev.totalMissing - added);
        return {
          ...prev,
          people: nextPeople,
          completedCount: nextCompleted,
          totalMissing: nextMissing,
          percentage: prev.totalPeople > 0 ? Math.round((nextCompleted / prev.totalPeople) * 100) : 100,
        };
      });

      setTimeout(() => {
        setShowUploadModal(false);
        setPreviewItems(null);
        setSelectedFile(null);
        setCommitMessage(null);
      }, 2000);
    } else {
      setCommitMessage(res.error || "Failed to commit changes.");
    }
  };

  // Download Sample CSV template for DOB
  const handleDownloadDobTemplate = () => {
    const csvContent = "identifier,dateOfBirth\nADM101,2012-05-15\n102,15/06/2013\nteacher@srtschool.com,1988-11-20\nparent@srtschool.com,1985-04-12\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "dob_update_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const roleBadge = (role: string) => {
    switch (role) {
      case "STUDENT":
        return <span className={`${styles.badge} ${styles.badgeStudent}`}>Student</span>;
      case "TEACHER":
        return <span className={`${styles.badge} ${styles.badgeTeacher}`}>Teacher</span>;
      case "STAFF":
        return <span className={`${styles.badge} ${styles.badgeStaff}`}>Staff</span>;
      case "ADMIN":
        return <span className={`${styles.badge} ${styles.badgeAdmin}`}>Admin</span>;
      case "PARENT":
        return <span className={`${styles.badge} ${styles.badgeParent}`}>Parent</span>;
      case "DRIVER":
        return <span className={`${styles.badge} ${styles.badgeDriver}`}>Bus Driver</span>;
      default:
        return <span className={styles.badge}>{role}</span>;
    }
  };

  return (
    <div className={styles.container}>
      {/* Header and Action Buttons */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>
            <Calendar size={24} style={{ color: "var(--primary)" }} />
            <span>Missing Date of Birth Records</span>
          </h1>
          <p className={styles.subtitle}>
            Ensure every student, teacher, staff, admin, parent, and bus driver has their Date of Birth recorded for accurate automated birthday wishes.
          </p>
        </div>

        <div className={styles.btnGroup}>
          <button
            onClick={handleDownloadDobTemplate}
            className={styles.btnSecondary}
          >
            <Download size={15} />
            <span>Template</span>
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className={styles.btnPrimary}
          >
            <Upload size={15} />
            <span>Update DOB from Excel</span>
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>Total People</span>
            <Users size={16} style={{ color: "var(--text-muted)" }} />
          </div>
          <div className={styles.statValue}>{data.totalPeople}</div>
          <div className={styles.statCaption}>Students, staff, parents &amp; fleet</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statLabel} style={{ color: "#10b981" }}>DOB Completed</span>
            <CheckCircle2 size={16} style={{ color: "#10b981" }} />
          </div>
          <div className={styles.statValue} style={{ color: "#10b981" }}>{data.completedCount}</div>
          <div className={styles.statCaption} style={{ color: "#10b981" }}>{data.percentage}% recorded</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statLabel} style={{ color: "#f59e0b" }}>Missing DOB</span>
            <AlertCircle size={16} style={{ color: "#f59e0b" }} />
          </div>
          <div className={styles.statValue} style={{ color: "#f59e0b" }}>{data.totalMissing}</div>
          <div className={styles.statCaption} style={{ color: "#f59e0b" }}>Require entry</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>Completion Progress</span>
            <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--primary)" }}>{data.percentage}%</span>
          </div>
          <div className={styles.progressBarTrack}>
            <div
              className={styles.progressBarFill}
              style={{ width: `${Math.min(100, Math.max(2, data.percentage))}%` }}
            />
          </div>
          <div className={styles.statCaption}>Target: 100% coverage</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.filterToolbar}>
        <div className={styles.filterRow}>
          {/* Search box */}
          <div className={styles.searchBox}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, roll number, admission no, email, or bus number..."
              className={styles.searchInput}
            />
          </div>

          {/* Class Filter (active when student role is selected or all) */}
          {(roleFilter === "ALL" || roleFilter === "STUDENT") && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Filter size={15} style={{ color: "var(--text-muted)" }} />
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className={styles.classSelect}
              >
                <option value="ALL">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} - {c.section}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Role Filter Tabs */}
        <div className={styles.roleTabs}>
          {[
            { key: "ALL", label: "All Roles" },
            { key: "STUDENT", label: "Students" },
            { key: "TEACHER", label: "Teachers" },
            { key: "STAFF", label: "Staff" },
            { key: "ADMIN", label: "Admins" },
            { key: "PARENT", label: "Parents" },
            { key: "DRIVER", label: "Drivers" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setRoleFilter(tab.key)}
              className={`${styles.roleTabBtn} ${roleFilter === tab.key ? styles.roleTabBtnActive : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <div className={styles.tableCard}>
        {filteredPeople.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 1.5rem" }}>
            <CheckCircle2 size={44} style={{ color: "#10b981", margin: "0 auto 0.75rem" }} />
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
              {data.totalMissing === 0 ? "All Records Complete!" : "No Missing Records Match Your Filter"}
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: "400px", margin: "0.35rem auto 0" }}>
              {data.totalMissing === 0
                ? "Every person in the system has a valid Date of Birth. Automatic birthday wishes will reach everyone."
                : "Try clearing search filters or selecting a different role."}
            </p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.th}>Person Name</th>
                  <th scope="col" className={styles.th}>Role</th>
                  <th scope="col" className={styles.th}>Identifier / Details</th>
                  <th scope="col" className={styles.th}>Enter Date of Birth</th>
                  <th scope="col" className={styles.th} style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeople.map((person) => {
                  const isSaving = savingId === person.id;
                  const isSuccess = successIds.has(person.id);
                  const errorMsg = rowErrors[person.id];
                  const currentVal = editingDates[person.id] || "";

                  return (
                    <tr
                      key={person.id}
                      className={styles.tr}
                      style={{
                        background: isSuccess ? "rgba(16, 185, 129, 0.08)" : undefined,
                      }}
                    >
                      <td className={styles.td}>
                        <div className={styles.personCell}>
                          <div className={styles.avatarMini}>
                            {person.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className={styles.personName}>{person.name}</div>
                            {person.className && (
                              <div className={styles.personMeta} style={{ color: "var(--primary)", fontWeight: 600 }}>
                                {person.className}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={styles.td}>{roleBadge(person.role)}</td>
                      <td className={styles.td} style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                        {person.identifier}
                        {!person.hasPortalAccount && person.role === "DRIVER" && (
                          <span style={{ display: "block", fontSize: "0.7rem", color: "#f59e0b", fontFamily: "sans-serif" }}>
                            (Fleet record - no login)
                          </span>
                        )}
                      </td>
                      <td className={styles.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxWidth: "180px" }}>
                          <input
                            type="date"
                            value={currentVal}
                            onChange={(e) =>
                              setEditingDates((prev) => ({ ...prev, [person.id]: e.target.value }))
                            }
                            max={new Date().toISOString().split("T")[0]}
                            disabled={isSaving || isSuccess}
                            className={styles.dateInput}
                          />
                          {errorMsg && <p style={{ fontSize: "0.75rem", color: "#ef4444", margin: 0 }}>{errorMsg}</p>}
                        </div>
                      </td>
                      <td className={styles.td} style={{ textAlign: "right" }}>
                        {isSuccess ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              color: wishedIds.has(person.id) ? "#d97706" : "#10b981",
                            }}
                          >
                            <Check size={16} />
                            <span>{wishedIds.has(person.id) ? "Saved & Wished 🎉" : "Saved"}</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSaveDob(person)}
                            disabled={isSaving || !currentVal}
                            className={`${styles.actionBtn} ${styles.actionBtnSave}`}
                          >
                            {isSaving ? (
                              <>
                                <Loader2 size={14} className={styles.spin} />
                                <span>Saving...</span>
                              </>
                            ) : (
                              <>
                                <Save size={14} />
                                <span>Save</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Upload Modal */}
      {showUploadModal && (
        <div className={styles.modalOverlay} onClick={() => {
          setShowUploadModal(false);
          setPreviewItems(null);
          setSelectedFile(null);
          setCommitMessage(null);
        }}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <FileSpreadsheet size={20} style={{ color: "var(--primary)" }} />
                <h3 className={styles.modalTitle}>Update Date of Birth from Excel / CSV</h3>
              </div>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setPreviewItems(null);
                  setSelectedFile(null);
                  setCommitMessage(null);
                }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {commitMessage && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "10px",
                    fontSize: "0.85rem",
                    background: commitMessage.includes("Successfully") ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                    color: commitMessage.includes("Successfully") ? "#059669" : "#dc2626",
                    fontWeight: 600,
                  }}
                >
                  {commitMessage}
                </div>
              )}

              {/* Upload Dropzone */}
              {!previewItems && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div
                    style={{
                      border: "2px dashed var(--border-color)",
                      borderRadius: "16px",
                      padding: "2rem 1.5rem",
                      textAlign: "center",
                      background: "rgba(0, 0, 0, 0.015)",
                    }}
                  >
                    <Upload size={36} style={{ color: "var(--text-muted)", margin: "0 auto 0.75rem" }} />
                    <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                      Upload .xlsx, .xls, or .csv file
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.35rem 0 0" }}>
                      Columns recognized: <code>identifier</code> (Roll No / Admission No / Email) and <code>dateOfBirth</code>.
                    </p>
                    <input
                      type="file"
                      accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                      onChange={handleFileChange}
                      style={{ display: "none" }}
                      id="bulk-dob-upload"
                      disabled={isUploading}
                    />
                    <label
                      htmlFor="bulk-dob-upload"
                      className={styles.btnPrimary}
                      style={{ marginTop: "1rem", cursor: "pointer" }}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 size={15} className={styles.spin} />
                          <span>Processing file...</span>
                        </>
                      ) : (
                        <span>Browse File</span>
                      )}
                    </label>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    <span>Need a sample template?</span>
                    <button
                      type="button"
                      onClick={handleDownloadDobTemplate}
                      style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                    >
                      Download CSV Template
                    </button>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {previewItems && uploadStats && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", textAlign: "center" }}>
                    <div style={{ padding: "0.6rem", borderRadius: "10px", background: "var(--background)", border: "1px solid var(--border-color)" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Rows</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--foreground)" }}>{uploadStats.total}</div>
                    </div>
                    <div style={{ padding: "0.6rem", borderRadius: "10px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
                      <div style={{ fontSize: "0.7rem", color: "#059669" }}>Matched</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#059669" }}>{uploadStats.matched}</div>
                    </div>
                    <div style={{ padding: "0.6rem", borderRadius: "10px", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                      <div style={{ fontSize: "0.7rem", color: "#d97706" }}>Unmatched</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#d97706" }}>{uploadStats.unmatched}</div>
                    </div>
                    <div style={{ padding: "0.6rem", borderRadius: "10px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.25)" }}>
                      <div style={{ fontSize: "0.7rem", color: "#dc2626" }}>Invalid</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#dc2626" }}>{uploadStats.invalid}</div>
                    </div>
                  </div>

                  <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "12px" }}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.th}>Identifier</th>
                          <th className={styles.th}>Name</th>
                          <th className={styles.th}>Role</th>
                          <th className={styles.th}>New DOB</th>
                          <th className={styles.th}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.map((item, idx) => (
                          <tr key={idx} className={styles.tr}>
                            <td className={styles.td} style={{ fontFamily: "monospace" }}>{item.identifier}</td>
                            <td className={styles.td} style={{ fontWeight: 600 }}>{item.personName || "—"}</td>
                            <td className={styles.td}>{item.role ? roleBadge(item.role) : "—"}</td>
                            <td className={styles.td} style={{ fontFamily: "monospace" }}>{item.newDob}</td>
                            <td className={styles.td}>
                              {item.status === "MATCHED" ? (
                                <span style={{ color: "#10b981", fontWeight: 700 }}>✓ Ready</span>
                              ) : item.status === "INVALID_DOB" ? (
                                <span style={{ color: "#ef4444", fontWeight: 600 }}>Invalid Date</span>
                              ) : (
                                <span style={{ color: "#f59e0b", fontWeight: 600 }}>Not Found</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => {
                  setShowUploadModal(false);
                  setPreviewItems(null);
                  setSelectedFile(null);
                  setCommitMessage(null);
                }}
                className={styles.btnSecondary}
              >
                Cancel
              </button>
              {previewItems && uploadStats && uploadStats.matched > 0 && (
                <button
                  type="button"
                  onClick={handleCommitBulk}
                  disabled={isCommitting}
                  className={styles.btnPrimary}
                >
                  {isCommitting ? (
                    <>
                      <Loader2 size={15} className={styles.spin} />
                      <span>Applying {uploadStats.matched} updates...</span>
                    </>
                  ) : (
                    <span>Apply {uploadStats.matched} Updates</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

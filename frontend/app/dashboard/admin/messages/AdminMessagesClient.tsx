"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Users, UserCheck, Search, MessageSquare, Mail, Phone, 
  GraduationCap, BookOpen, ArrowRight, Bell, Filter
} from "lucide-react";
import { Class } from "@prisma/client";

export type TeacherContact = {
  id: string;
  name: string;
  email: string;
  role: string;
  teacher?: {
    classes?: ClassItem[];
    subjects?: { id: string; name: string }[];
  } | null;
  unreadCount?: number;
  lastMessageSnippet?: string;
  lastMessageAt?: string;
};

export type ParentContact = {
  id: string;
  name: string;
  email: string;
  role: string;
  parent?: {
    children?: {
      student: {
        id: string;
        firstName: string;
        lastName: string;
        class?: { id: string; name: string; section: string } | null;
      };
    }[];
  } | null;
  unreadCount?: number;
  lastMessageSnippet?: string;
  lastMessageAt?: string;
};

export type ClassItem = {
  id: string;
  name: string;
  section: string;
};

interface AdminMessagesClientProps {
  teachers: TeacherContact[];
  parents: ParentContact[];
  classes: ClassItem[];
  totalUnreadCount: number;
}

export default function AdminMessagesClient({
  teachers,
  parents,
  classes,
  totalUnreadCount
}: AdminMessagesClientProps) {
  const [activeTab, setActiveTab] = useState<"TEACHERS" | "PARENTS">("TEACHERS");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<string>("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Filter Teachers
  const filteredTeachers = teachers.filter(t => {
    if (unreadOnly && (!t.unreadCount || t.unreadCount === 0)) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = t.name.toLowerCase().includes(q);
    const emailMatch = t.email.toLowerCase().includes(q);
    const subjectMatch = t.teacher?.subjects?.some(s => s.name.toLowerCase().includes(q));
    const classMatch = t.teacher?.classes?.some(c => `${c.name} ${c.section}`.toLowerCase().includes(q));
    return nameMatch || emailMatch || subjectMatch || classMatch;
  });

  // Filter Parents
  const filteredParents = parents.filter(p => {
    if (unreadOnly && (!p.unreadCount || p.unreadCount === 0)) return false;

    // Filter by class if selected
    if (selectedClassId !== "ALL") {
      const hasChildInClass = p.parent?.children?.some(c => c.student.class?.id === selectedClassId);
      if (!hasChildInClass) return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = p.name.toLowerCase().includes(q);
    const emailMatch = p.email.toLowerCase().includes(q);
    const childMatch = p.parent?.children?.some(c => 
      `${c.student.firstName} ${c.student.lastName}`.toLowerCase().includes(q) ||
      (c.student.class && `${c.student.class.name} ${c.student.class.section}`.toLowerCase().includes(q))
    );
    return nameMatch || emailMatch || childMatch;
  });

  const teacherUnreadTotal = teachers.reduce((acc, t) => acc + (t.unreadCount || 0), 0);
  const parentUnreadTotal = parents.reduce((acc, p) => acc + (p.unreadCount || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* ======================================================== */}
      {/* SUMMARY STATS BAR */}
      {/* ======================================================== */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "1rem"
      }}>
        {/* Total Directory */}
        <div style={{
          padding: "1.25rem",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--card-bg, #ffffff)",
          display: "flex",
          alignItems: "center",
          gap: "1rem"
        }}>
          <div style={{
            padding: "0.75rem",
            borderRadius: "10px",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            color: "var(--primary, #6366f1)"
          }}>
            <MessageSquare size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>Total Contacts</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--foreground)" }}>
              {teachers.length + parents.length}
            </div>
          </div>
        </div>

        {/* Faculty Teachers */}
        <div style={{
          padding: "1.25rem",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--card-bg, #ffffff)",
          display: "flex",
          alignItems: "center",
          gap: "1rem"
        }}>
          <div style={{
            padding: "0.75rem",
            borderRadius: "10px",
            backgroundColor: "rgba(99, 102, 241, 0.12)",
            color: "var(--primary, #6366f1)"
          }}>
            <UserCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>Faculty Members</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--foreground)" }}>
              {teachers.length}
              {teacherUnreadTotal > 0 && (
                <span style={{ fontSize: "0.8rem", color: "#ef4444", marginLeft: "0.4rem", fontWeight: 700 }}>
                  ({teacherUnreadTotal} unread)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Parents & Guardians */}
        <div style={{
          padding: "1.25rem",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--card-bg, #ffffff)",
          display: "flex",
          alignItems: "center",
          gap: "1rem"
        }}>
          <div style={{
            padding: "0.75rem",
            borderRadius: "10px",
            backgroundColor: "rgba(139, 92, 246, 0.12)",
            color: "#8b5cf6"
          }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>Student Parents</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--foreground)" }}>
              {parents.length}
              {parentUnreadTotal > 0 && (
                <span style={{ fontSize: "0.8rem", color: "#ef4444", marginLeft: "0.4rem", fontWeight: 700 }}>
                  ({parentUnreadTotal} unread)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Unread Messages Alert */}
        <div style={{
          padding: "1.25rem",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--card-bg, #ffffff)",
          display: "flex",
          alignItems: "center",
          gap: "1rem"
        }}>
          <div style={{
            padding: "0.75rem",
            borderRadius: "10px",
            backgroundColor: totalUnreadCount > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)",
            color: totalUnreadCount > 0 ? "#ef4444" : "#10b981"
          }}>
            <Bell size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>Unread Alerts</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: totalUnreadCount > 0 ? "#ef4444" : "#10b981" }}>
              {totalUnreadCount}
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TABS: FACULTY TEACHERS vs STUDENT PARENTS */}
      {/* ======================================================== */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        borderBottom: "2px solid var(--border-color)",
        paddingBottom: "0.25rem"
      }}>
        <button
          type="button"
          onClick={() => setActiveTab("TEACHERS")}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "10px 10px 0 0",
            border: "none",
            backgroundColor: activeTab === "TEACHERS" ? "rgba(99, 102, 241, 0.12)" : "transparent",
            color: activeTab === "TEACHERS" ? "var(--primary, #6366f1)" : "var(--text-secondary)",
            fontWeight: 800,
            fontSize: "1rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            borderBottom: activeTab === "TEACHERS" ? "3px solid var(--primary, #6366f1)" : "3px solid transparent",
            marginBottom: "-2px",
            transition: "all 0.2s ease"
          }}
        >
          <UserCheck size={18} /> Teacher Messages ({teachers.length})
          {teacherUnreadTotal > 0 && (
            <span style={{
              padding: "0.15rem 0.5rem",
              borderRadius: "10px",
              backgroundColor: "#ef4444",
              color: "#ffffff",
              fontSize: "0.725rem",
              fontWeight: 800
            }}>
              {teacherUnreadTotal}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("PARENTS")}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "10px 10px 0 0",
            border: "none",
            backgroundColor: activeTab === "PARENTS" ? "rgba(139, 92, 246, 0.12)" : "transparent",
            color: activeTab === "PARENTS" ? "#8b5cf6" : "var(--text-secondary)",
            fontWeight: 800,
            fontSize: "1rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            borderBottom: activeTab === "PARENTS" ? "3px solid #8b5cf6" : "3px solid transparent",
            marginBottom: "-2px",
            transition: "all 0.2s ease"
          }}
        >
          <Users size={18} /> Parent Messages ({parents.length})
          {parentUnreadTotal > 0 && (
            <span style={{
              padding: "0.15rem 0.5rem",
              borderRadius: "10px",
              backgroundColor: "#ef4444",
              color: "#ffffff",
              fontSize: "0.725rem",
              fontWeight: 800
            }}>
              {parentUnreadTotal}
            </span>
          )}
        </button>
      </div>

      {/* ======================================================== */}
      {/* CONTROLS: SEARCH & CLASS FILTER & UNREAD TOGGLE */}
      {/* ======================================================== */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "1rem"
      }}>
        {/* Search Input */}
        <div style={{
          position: "relative",
          minWidth: "260px",
          flex: "1 1 320px",
          maxWidth: "460px"
        }}>
          <Search size={16} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input
            type="text"
            placeholder={activeTab === "TEACHERS" ? "Search faculty by name, email, subject, or class..." : "Search parents by name, email, student, or grade..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "0.65rem 0.85rem 0.65rem 2.4rem",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--card-bg, #ffffff)",
              color: "var(--foreground)",
              fontSize: "0.875rem",
              outline: "none"
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          {/* Class Filter (Only shown on Parents tab) */}
          {activeTab === "PARENTS" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Filter size={15} color="var(--text-secondary)" />
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                style={{
                  padding: "0.6rem 0.85rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--card-bg, #ffffff)",
                  color: "var(--foreground)",
                  fontSize: "0.85rem",
                  cursor: "pointer"
                }}
              >
                <option value="ALL">All Classes / Grades</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} - {c.section}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Unread Only Toggle */}
          <button
            type="button"
            onClick={() => setUnreadOnly(!unreadOnly)}
            style={{
              padding: "0.6rem 1rem",
              borderRadius: "8px",
              border: unreadOnly ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
              backgroundColor: unreadOnly ? "rgba(239, 68, 68, 0.1)" : "var(--card-bg, #ffffff)",
              color: unreadOnly ? "#ef4444" : "var(--foreground)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem"
            }}
          >
            <Bell size={14} color={unreadOnly ? "#ef4444" : "var(--text-secondary)"} />
            Unread Only
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* DIRECTORY CONTENT */}
      {/* ======================================================== */}
      {activeTab === "TEACHERS" ? (
        /* TEACHERS LIST */
        filteredTeachers.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "3.5rem 1rem",
            borderRadius: "14px",
            border: "1px dashed var(--border-color)",
            backgroundColor: "var(--card-bg, #ffffff)"
          }}>
            <UserCheck size={38} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>No faculty teachers found</h3>
            <p style={{ margin: "0.35rem 0 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              {searchQuery ? "Try refining your search terms." : "Active faculty members will appear here."}
            </p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "1rem"
          }}>
            {filteredTeachers.map(teacher => {
              const subjects = teacher.teacher?.subjects?.map(s => s.name).join(", ") || "";
              const classesTaught = teacher.teacher?.classes?.map(c => `${c.name}-${c.section}`).join(", ") || "";

              return (
                <div
                  key={teacher.id}
                  style={{
                    padding: "1.25rem",
                    borderRadius: "14px",
                    border: teacher.unreadCount && teacher.unreadCount > 0 ? "2px solid rgba(99, 102, 241, 0.5)" : "1px solid var(--border-color)",
                    backgroundColor: "var(--card-bg, #ffffff)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "1rem",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    transition: "all 0.2s ease"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem" }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      backgroundColor: "rgba(99, 102, 241, 0.12)",
                      color: "var(--primary, #6366f1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: "1rem",
                      flexShrink: 0
                    }}>
                      {teacher.name.charAt(0).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                        <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {teacher.name}
                        </h4>
                        {teacher.unreadCount && teacher.unreadCount > 0 && (
                          <span style={{
                            padding: "0.15rem 0.5rem",
                            borderRadius: "10px",
                            backgroundColor: "#ef4444",
                            color: "#ffffff",
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            flexShrink: 0
                          }}>
                            {teacher.unreadCount} new
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                        <Mail size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "0.3rem" }} />
                        {teacher.email}
                      </div>

                      {/* Subjects & Classes */}
                      <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.785rem" }}>
                        {subjects && (
                          <div style={{ color: "var(--primary, #6366f1)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <BookOpen size={13} />
                            <span style={{ fontWeight: 600 }}>{subjects}</span>
                          </div>
                        )}
                        {classesTaught && (
                          <div style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <Users size={13} />
                            <span>Classes: {classesTaught}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Link */}
                  <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem", display: "flex", justifyContent: "flex-end" }}>
                    <Link
                      href={`/dashboard/admin/messages/${teacher.id}`}
                      style={{
                        padding: "0.5rem 1rem",
                        borderRadius: "8px",
                        backgroundColor: "rgba(99, 102, 241, 0.1)",
                        color: "var(--primary, #6366f1)",
                        fontSize: "0.825rem",
                        fontWeight: 700,
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem"
                      }}
                    >
                      <MessageSquare size={14} /> Message Teacher <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* PARENTS LIST */
        filteredParents.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "3.5rem 1rem",
            borderRadius: "14px",
            border: "1px dashed var(--border-color)",
            backgroundColor: "var(--card-bg, #ffffff)"
          }}>
            <Users size={38} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>No student parents found</h3>
            <p style={{ margin: "0.35rem 0 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              {searchQuery || selectedClassId !== "ALL" ? "Try adjusting your filter or search query." : "Registered parents will appear here."}
            </p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "1rem"
          }}>
            {filteredParents.map(parent => {
              const children = parent.parent?.children || [];

              return (
                <div
                  key={parent.id}
                  style={{
                    padding: "1.25rem",
                    borderRadius: "14px",
                    border: parent.unreadCount && parent.unreadCount > 0 ? "2px solid rgba(139, 92, 246, 0.5)" : "1px solid var(--border-color)",
                    backgroundColor: "var(--card-bg, #ffffff)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "1rem",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    transition: "all 0.2s ease"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem" }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      backgroundColor: "rgba(139, 92, 246, 0.12)",
                      color: "#8b5cf6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: "1rem",
                      flexShrink: 0
                    }}>
                      {parent.name.charAt(0).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                        <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {parent.name}
                        </h4>
                        {parent.unreadCount && parent.unreadCount > 0 && (
                          <span style={{
                            padding: "0.15rem 0.5rem",
                            borderRadius: "10px",
                            backgroundColor: "#ef4444",
                            color: "#ffffff",
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            flexShrink: 0
                          }}>
                            {parent.unreadCount} new
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                        <Mail size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "0.3rem" }} />
                        {parent.email}
                      </div>

                      {/* Associated Children & Grades */}
                      <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.785rem" }}>
                        {children.length > 0 ? (
                          children.map(ch => (
                            <div key={ch.student.id} style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#8b5cf6", fontWeight: 600 }}>
                              <GraduationCap size={14} />
                              <span>
                                {ch.student.firstName} {ch.student.lastName}
                                {ch.student.class && (
                                  <span style={{ color: "var(--text-secondary)", fontWeight: 500, marginLeft: "0.3rem" }}>
                                    ({ch.student.class.name} - {ch.student.class.section})
                                  </span>
                                )}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                            No student enrolled
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Link */}
                  <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem", display: "flex", justifyContent: "flex-end" }}>
                    <Link
                      href={`/dashboard/admin/messages/${parent.id}`}
                      style={{
                        padding: "0.5rem 1rem",
                        borderRadius: "8px",
                        backgroundColor: "rgba(139, 92, 246, 0.1)",
                        color: "#8b5cf6",
                        fontSize: "0.825rem",
                        fontWeight: 700,
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem"
                      }}
                    >
                      <MessageSquare size={14} /> Message Parent <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

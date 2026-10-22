"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { 
  Building2, Home, GraduationCap, Clock, 
  ArrowLeftRight, ChevronDown, Check, User, LayoutDashboard, Sparkles
} from "lucide-react";

export type BannerChildData = {
  id: string;
  firstName: string;
  lastName: string;
  rollNumber?: string;
  admissionNo?: string;
  residenceType?: string | null;
  classId?: string | null;
  class?: {
    id: string;
    name: string;
    section: string;
  } | null;
};

function setChildCookie(childId: string) {
  if (typeof document !== "undefined") {
    document.cookie = `selectedChildId=${encodeURIComponent(childId)}; path=/; max-age=31536000; SameSite=Lax`;
  }
}

export default function ParentChildBanner({
  selectedChild,
  studentList,
  activePage = "dashboard"
}: {
  selectedChild: BannerChildData;
  studentList: BannerChildData[];
  activePage?: "dashboard" | "classes" | "timetable" | "other";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (childId: string) => {
    setIsDropdownOpen(false);
    if (childId === selectedChild.id) return;

    setChildCookie(childId);

    const params = new URLSearchParams(searchParams.toString());
    params.set("childId", childId);

    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  };

  const hasMultipleChildren = studentList && studentList.length > 1;
  const childClass = selectedChild.class;
  const isHostel = selectedChild.residenceType?.toUpperCase().includes("HOSTEL");

  return (
    <div
      style={{
        background: "linear-gradient(135deg, rgba(99, 102, 241, 0.09) 0%, rgba(236, 72, 153, 0.06) 50%, rgba(59, 130, 246, 0.08) 100%)",
        border: "1px solid rgba(99, 102, 241, 0.25)",
        borderRadius: "16px",
        padding: "1.35rem 1.6rem",
        marginBottom: "1.75rem",
        boxShadow: "0 4px 20px -2px rgba(99, 102, 241, 0.08)",
        backdropFilter: "blur(8px)",
        position: "relative"
      }}
    >
      {/* Multi-Child Quick Switching Bar inside the Banner (visible when parent has 2+ children) */}
      {hasMultipleChildren && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.6rem",
            paddingBottom: "0.85rem",
            marginBottom: "1rem",
            borderBottom: "1px dashed rgba(99, 102, 241, 0.2)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                backgroundColor: "rgba(99, 102, 241, 0.15)",
                color: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <ArrowLeftRight size={13} />
            </div>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--primary)", letterSpacing: "0.02em" }}>
              SWITCH REGISTERED CHILD ({studentList.length} CHILDREN LINKED)
            </span>
          </div>

          {/* Quick-switch pills right in banner */}
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {studentList.map((child) => {
              const isSelected = child.id === selectedChild.id;
              const childIsHostel = child.residenceType?.toUpperCase().includes("HOSTEL");

              return (
                <button
                  key={child.id}
                  onClick={() => handleSelect(child.id)}
                  type="button"
                  title={`Switch to ${child.firstName} ${child.lastName}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.35rem 0.75rem",
                    borderRadius: "8px",
                    border: isSelected ? "1.5px solid var(--primary)" : "1px solid var(--border-color)",
                    backgroundColor: isSelected ? "var(--primary)" : "var(--card-bg)",
                    color: isSelected ? "var(--primary-fg)" : "var(--foreground)",
                    fontSize: "0.8rem",
                    fontWeight: isSelected ? 700 : 500,
                    cursor: "pointer",
                    boxShadow: isSelected ? "0 2px 8px rgba(99, 102, 241, 0.3)" : "none",
                    transition: "all 0.15s ease-in-out"
                  }}
                >
                  <span
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      backgroundColor: isSelected ? "rgba(255, 255, 255, 0.25)" : "rgba(99, 102, 241, 0.15)",
                      color: isSelected ? "#ffffff" : "var(--primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.7rem",
                      fontWeight: 800
                    }}
                  >
                    {child.firstName[0]}
                  </span>
                  <span>{child.firstName} {child.lastName}</span>
                  {child.class && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.1rem 0.35rem",
                        borderRadius: "4px",
                        backgroundColor: isSelected ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.05)",
                        opacity: isSelected ? 1 : 0.85
                      }}
                    >
                      {child.class.name}
                    </span>
                  )}
                  {isSelected ? (
                    <Check size={13} style={{ strokeWidth: 3 }} />
                  ) : (
                    <span style={{ fontSize: "0.7rem", color: "var(--primary)", fontWeight: 600 }}>Switch ➔</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Banner Content */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1.25rem"
        }}
      >
        {/* Child Information Section */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div
            style={{
              width: "54px",
              height: "54px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--primary) 0%, #4338ca 100%)",
              color: "var(--primary-fg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.45rem",
              fontWeight: 800,
              boxShadow: "0 6px 14px rgba(99, 102, 241, 0.35)",
              border: "2px solid rgba(255, 255, 255, 0.2)"
            }}
          >
            {selectedChild.firstName[0]}
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
                {selectedChild.firstName} {selectedChild.lastName}
              </h2>

              {/* Residence Badge */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  padding: "0.22rem 0.6rem",
                  borderRadius: "999px",
                  backgroundColor: isHostel ? "rgba(245, 158, 11, 0.15)" : "rgba(59, 130, 246, 0.15)",
                  color: isHostel ? "var(--warning)" : "var(--primary)",
                  border: isHostel ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(59, 130, 246, 0.3)"
                }}
              >
                {isHostel ? <Building2 size={13} /> : <Home size={13} />}
                {isHostel ? "Hostel Student" : "Dayscholar"}
              </span>

              {/* Multiple Children Badge if registered */}
              {hasMultipleChildren && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "0.18rem 0.5rem",
                    borderRadius: "6px",
                    backgroundColor: "rgba(16, 185, 129, 0.12)",
                    color: "var(--success)",
                    border: "1px solid rgba(16, 185, 129, 0.25)"
                  }}
                >
                  <Sparkles size={11} /> 2 Children Registered
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                marginTop: "0.35rem",
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
                flexWrap: "wrap",
                alignItems: "center"
              }}
            >
              <span>
                Class: <strong style={{ color: "var(--foreground)" }}>{childClass ? `${childClass.name} - Section ${childClass.section}` : "Not assigned"}</strong>
              </span>
              <span>•</span>
              <span>
                Roll: <strong style={{ color: "var(--foreground)" }}>{selectedChild.rollNumber || "N/A"}</strong>
              </span>
              <span>•</span>
              <span>
                Admission No: <strong style={{ color: "var(--foreground)" }}>{selectedChild.admissionNo || "N/A"}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons & Dropdown Switcher */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          {/* Child Switcher Dropdown (visible when parent has 2+ children) */}
          {hasMultipleChildren && (
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                style={{
                  padding: "0.55rem 1rem",
                  backgroundColor: "var(--card-bg)",
                  border: "1.5px solid var(--primary)",
                  color: "var(--primary)",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(99, 102, 241, 0.15)",
                  transition: "all 0.2s ease"
                }}
              >
                <ArrowLeftRight size={15} />
                <span>Switch Child</span>
                <ChevronDown
                  size={14}
                  style={{
                    transform: isDropdownOpen ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s"
                  }}
                />
              </button>

              {/* Floating Child Switcher Dropdown Menu */}
              {isDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    minWidth: "290px",
                    backgroundColor: "var(--card-bg)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "12px",
                    boxShadow: "0 12px 30px rgba(0, 0, 0, 0.18)",
                    padding: "0.6rem",
                    zIndex: 100,
                    animation: "fadeIn 0.15s ease-out"
                  }}
                >
                  <div
                    style={{
                      padding: "0.4rem 0.6rem 0.6rem 0.6rem",
                      borderBottom: "1px solid var(--border-color)",
                      marginBottom: "0.4rem"
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                      Select Child Profile
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                      Switch active academic records
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {studentList.map((child) => {
                      const isSelected = child.id === selectedChild.id;
                      const childIsHostel = child.residenceType?.toUpperCase().includes("HOSTEL");

                      return (
                        <div
                          key={child.id}
                          onClick={() => handleSelect(child.id)}
                          style={{
                            padding: "0.65rem 0.75rem",
                            borderRadius: "8px",
                            backgroundColor: isSelected ? "rgba(99, 102, 241, 0.1)" : "transparent",
                            border: isSelected ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid transparent",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.75rem",
                            transition: "background-color 0.15s ease"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                backgroundColor: isSelected ? "var(--primary)" : "rgba(99, 102, 241, 0.15)",
                                color: isSelected ? "var(--primary-fg)" : "var(--primary)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "0.85rem"
                              }}
                            >
                              {child.firstName[0]}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--foreground)" }}>
                                {child.firstName} {child.lastName}
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                                {child.class ? `${child.class.name} - Sec ${child.class.section}` : "No Class"}
                                {child.rollNumber ? ` • ${child.rollNumber}` : ""}
                              </div>
                            </div>
                          </div>

                          <div>
                            {isSelected ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  color: "var(--success)",
                                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "999px"
                                }}
                              >
                                <Check size={12} /> Active
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--primary)",
                                  fontWeight: 600,
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "6px",
                                  backgroundColor: "rgba(99, 102, 241, 0.08)"
                                }}
                              >
                                Switch ➔
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation Action Buttons based on current page */}
          {activePage !== "classes" && (
            <Link
              href={`/dashboard/parent/classes?childId=${selectedChild.id}`}
              style={{
                padding: "0.55rem 1rem",
                backgroundColor: "var(--background)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                color: "var(--foreground)",
                textDecoration: "none",
                fontSize: "0.85rem",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
              }}
            >
              <GraduationCap size={16} /> Child Class Details
            </Link>
          )}

          {activePage !== "timetable" && (
            <Link
              href={`/dashboard/parent/timetable?childId=${selectedChild.id}`}
              style={{
                padding: "0.55rem 1rem",
                backgroundColor: "var(--primary)",
                color: "var(--primary-fg)",
                border: "none",
                borderRadius: "8px",
                textDecoration: "none",
                fontSize: "0.85rem",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                boxShadow: "0 2px 6px rgba(99, 102, 241, 0.25)"
              }}
            >
              <Clock size={16} /> Timetable
            </Link>
          )}

          {activePage !== "dashboard" && (
            <Link
              href={`/dashboard/parent?childId=${selectedChild.id}`}
              style={{
                padding: "0.55rem 1rem",
                backgroundColor: "var(--background)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                color: "var(--foreground)",
                textDecoration: "none",
                fontSize: "0.85rem",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
              }}
            >
              <LayoutDashboard size={16} /> Dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { 
  Building2, Home, GraduationCap, Clock, 
  ArrowLeftRight, ChevronDown, Check, LayoutDashboard, Sparkles, X
} from "lucide-react";
import styles from "./ParentChildBanner.module.css";

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
  const [dropdownAlign, setDropdownAlign] = useState<"left" | "right">("left");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Smart bounds detection so the dropdown never overflows left or right on any screen
  useEffect(() => {
    if (isDropdownOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      // If opening from the left would exceed viewport, align to right
      if (rect.left + 320 > viewportWidth - 20) {
        setDropdownAlign("right");
      } else {
        setDropdownAlign("left");
      }
    }
  }, [isDropdownOpen]);

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
    <div className={styles.banner}>
      {/* Multi-Child Quick Switching Bar inside the Banner (visible when parent has 2+ children) */}
      {hasMultipleChildren && (
        <div className={styles.switchHeader}>
          <div className={styles.switchHeaderTitle}>
            <ArrowLeftRight size={14} />
            <span>Switch Registered Child ({studentList.length} Children Linked)</span>
          </div>

          {/* Quick-switch pills right in banner */}
          <div className={styles.switchPillGroup}>
            {studentList.map((child) => {
              const isSelected = child.id === selectedChild.id;

              return (
                <button
                  key={child.id}
                  onClick={() => handleSelect(child.id)}
                  type="button"
                  title={`Switch to ${child.firstName} ${child.lastName}`}
                  className={`${styles.switchPill} ${isSelected ? styles.switchPillActive : ""}`}
                >
                  <span className={`${styles.pillInitial} ${isSelected ? styles.pillInitialActive : styles.pillInitialInactive}`}>
                    {child.firstName[0]}
                  </span>
                  <span>{child.firstName} {child.lastName}</span>
                  {child.class && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.1rem 0.35rem",
                        borderRadius: "4px",
                        backgroundColor: isSelected ? "rgba(255, 255, 255, 0.22)" : "rgba(0, 0, 0, 0.05)",
                        opacity: isSelected ? 1 : 0.85
                      }}
                    >
                      {child.class.name}
                    </span>
                  )}
                  {isSelected ? (
                    <Check size={13} style={{ strokeWidth: 3 }} />
                  ) : (
                    <span style={{ fontSize: "0.7rem", color: "var(--primary)", fontWeight: 700 }}>Switch ➔</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Banner Content */}
      <div className={styles.mainLayout}>
        {/* Child Information Section */}
        <div className={styles.profileIdentity}>
          <div className={styles.avatar}>
            {selectedChild.firstName[0]}
          </div>

          <div>
            <div className={styles.nameRow}>
              <h2 className={styles.childName}>
                {selectedChild.firstName} {selectedChild.lastName}
              </h2>

              {/* Residence Badge */}
              <span
                className={styles.residenceBadge}
                style={{
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

            <div className={styles.metaRow}>
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
        <div className={styles.actionGroup}>
          {/* Child Switcher Dropdown (visible when parent has 2+ children) */}
          {hasMultipleChildren && (
            <div ref={dropdownRef} className={styles.dropdownTriggerWrapper}>
              <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={styles.dropdownTriggerButton}
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

              {/* Mobile Backdrop for full-screen touch dismiss */}
              {isDropdownOpen && (
                <div
                  className={styles.mobileBackdrop}
                  onClick={() => setIsDropdownOpen(false)}
                />
              )}

              {/* Child Switcher Dropdown Menu (intelligent bounds for PC and bottom-sheet for Mobile) */}
              {isDropdownOpen && (
                <div
                  className={styles.dropdownMenu}
                  style={{
                    left: dropdownAlign === "left" ? 0 : "auto",
                    right: dropdownAlign === "right" ? 0 : "auto"
                  }}
                >
                  <div className={styles.dropdownHeader}>
                    <div>
                      <div style={{ fontSize: "0.76rem", fontWeight: 700, textTransform: "uppercase", color: "var(--primary)", letterSpacing: "0.04em" }}>
                        Select Child Profile
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                        Viewing records for active student
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(false)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        padding: "0.2rem",
                        display: "flex",
                        alignItems: "center",
                        borderRadius: "4px"
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {studentList.map((child) => {
                      const isSelected = child.id === selectedChild.id;

                      return (
                        <div
                          key={child.id}
                          onClick={() => handleSelect(child.id)}
                          className={`${styles.childCardItem} ${isSelected ? styles.childCardItemActive : ""}`}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", minWidth: 0 }}>
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                backgroundColor: isSelected ? "var(--primary)" : "rgba(99, 102, 241, 0.15)",
                                color: isSelected ? "var(--primary-fg, #ffffff)" : "var(--primary)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                flexShrink: 0
                              }}
                            >
                              {child.firstName[0]}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {child.firstName} {child.lastName}
                              </div>
                              <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                                {child.class ? `${child.class.name} - Sec ${child.class.section}` : "No Class"}
                                {child.rollNumber ? ` • ${child.rollNumber}` : ""}
                              </div>
                            </div>
                          </div>

                          <div style={{ flexShrink: 0 }}>
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
                                  fontSize: "0.74rem",
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
              className={`${styles.actionButton} ${styles.actionButtonSecondary}`}
            >
              <GraduationCap size={16} />
              <span>Child Class Details</span>
            </Link>
          )}

          {activePage !== "timetable" && (
            <Link
              href={`/dashboard/parent/timetable?childId=${selectedChild.id}`}
              className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
            >
              <Clock size={16} />
              <span>Timetable</span>
            </Link>
          )}

          {activePage !== "dashboard" && (
            <Link
              href={`/dashboard/parent?childId=${selectedChild.id}`}
              className={`${styles.actionButton} ${styles.actionButtonSecondary}`}
            >
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

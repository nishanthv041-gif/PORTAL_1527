"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { 
  Building2, Home, GraduationCap, Clock, 
  ArrowLeftRight, Check, LayoutDashboard
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

  const handleSelect = (childId: string) => {
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
      {/* 1-Tap Multi-Child Switcher Tabs (Shown only when parent has 2+ registered children) */}
      {hasMultipleChildren && (
        <div className={styles.switchSection}>
          <div className={styles.switchHeaderRow}>
            <span className={styles.switchLabel}>
              <ArrowLeftRight size={13} />
              <span>Switch Child Profile ({studentList.length} Registered)</span>
            </span>
          </div>

          <div className={styles.segmentedTabGroup}>
            {studentList.map((child) => {
              const isSelected = child.id === selectedChild.id;

              return (
                <button
                  key={child.id}
                  onClick={() => handleSelect(child.id)}
                  type="button"
                  title={`Switch to ${child.firstName} ${child.lastName}`}
                  className={`${styles.segmentedTab} ${isSelected ? styles.segmentedTabActive : ""}`}
                >
                  <span className={`${styles.tabInitial} ${isSelected ? styles.tabInitialActive : styles.tabInitialInactive}`}>
                    {child.firstName[0]}
                  </span>
                  
                  <div className={styles.tabInfo}>
                    <div className={styles.tabNameRow}>
                      <span className={styles.tabName}>
                        {child.firstName} {child.lastName}
                      </span>
                      {isSelected && (
                        <span className={styles.activePill}>
                          <Check size={11} strokeWidth={3} /> Active
                        </span>
                      )}
                    </div>
                    <div className={styles.tabSubText}>
                      {child.class ? `${child.class.name} • Sec ${child.class.section}` : "No Class"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Student Profile Card */}
      <div className={styles.profileSection}>
        {/* Left: Avatar & Identity Details */}
        <div className={styles.profileIdentity}>
          <div className={styles.avatar}>
            {selectedChild.firstName[0]}
          </div>

          <div className={styles.identityText}>
            <div className={styles.nameRow}>
              <h2 className={styles.childName}>
                {selectedChild.firstName} {selectedChild.lastName}
              </h2>

              <span
                className={styles.residenceBadge}
                style={{
                  backgroundColor: isHostel ? "rgba(245, 158, 11, 0.15)" : "rgba(59, 130, 246, 0.15)",
                  color: isHostel ? "var(--warning)" : "var(--primary)",
                  border: isHostel ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(59, 130, 246, 0.3)"
                }}
              >
                {isHostel ? <Building2 size={12} /> : <Home size={12} />}
                {isHostel ? "Hostel" : "Dayscholar"}
              </span>
            </div>

            {/* Meta badges - structured micro-pills for clean mobile fit */}
            <div className={styles.metaBadges}>
              <div className={styles.metaPill}>
                <span className={styles.metaPillLabel}>Class</span>
                <span className={styles.metaPillValue}>
                  {childClass ? `${childClass.name} - ${childClass.section}` : "N/A"}
                </span>
              </div>
              <div className={styles.metaPill}>
                <span className={styles.metaPillLabel}>Roll</span>
                <span className={styles.metaPillValue}>
                  {selectedChild.rollNumber || "N/A"}
                </span>
              </div>
              <div className={styles.metaPill}>
                <span className={styles.metaPillLabel}>Adm No</span>
                <span className={styles.metaPillValue}>
                  {selectedChild.admissionNo || "N/A"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right / Bottom: Action Navigation Buttons */}
        <div className={styles.actionGroup}>
          {activePage !== "classes" && (
            <Link
              href={`/dashboard/parent/classes?childId=${selectedChild.id}`}
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
            >
              <GraduationCap size={16} />
              <span>Class Details</span>
            </Link>
          )}

          {activePage !== "timetable" && (
            <Link
              href={`/dashboard/parent/timetable?childId=${selectedChild.id}`}
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            >
              <Clock size={16} />
              <span>Timetable</span>
            </Link>
          )}

          {activePage !== "dashboard" && (
            <Link
              href={`/dashboard/parent?childId=${selectedChild.id}`}
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
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

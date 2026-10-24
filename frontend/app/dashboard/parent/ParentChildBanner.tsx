"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { 
  Building2, Home, GraduationCap, 
  ArrowLeftRight, Check, LayoutDashboard, Loader2
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

  // Optimistic active child state for 0ms instantaneous feedback
  const [activeChildId, setActiveChildId] = useState(selectedChild.id);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setActiveChildId(selectedChild.id);
  }, [selectedChild.id]);

  // Current display child (instantaneous local state)
  const currentChild = studentList.find(c => c.id === activeChildId) || selectedChild;

  const handleSelect = (childId: string) => {
    if (childId === activeChildId) return;

    // 1. Instant 0ms visual switch
    setActiveChildId(childId);
    setChildCookie(childId);

    // 2. Fast transition without redundant router.refresh()
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("childId", childId);
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const hasMultipleChildren = studentList && studentList.length > 1;
  const childClass = currentChild.class;
  const isHostel = currentChild.residenceType?.toUpperCase().includes("HOSTEL");

  return (
    <div className={styles.banner}>
      {/* 1-Tap Multi-Child Switcher Tabs (Shown ONLY for parents with 2+ registered children) */}
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
              const isSelected = child.id === activeChildId;

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
                          {isPending ? (
                            <Loader2 size={11} className={styles.spinner} />
                          ) : (
                            <Check size={11} strokeWidth={3} />
                          )}
                          {isPending ? "Loading..." : "Active"}
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
            {currentChild.firstName[0]}
          </div>

          <div className={styles.identityText}>
            <div className={styles.nameRow}>
              <h2 className={styles.childName}>
                {currentChild.firstName} {currentChild.lastName}
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
                  {currentChild.rollNumber || "N/A"}
                </span>
              </div>
              <div className={styles.metaPill}>
                <span className={styles.metaPillLabel}>Adm No</span>
                <span className={styles.metaPillValue}>
                  {currentChild.admissionNo || "N/A"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right / Bottom: Action Navigation Buttons */}
        <div className={styles.actionGroup}>
          {activePage !== "classes" && (
            <Link
              href={`/dashboard/parent/classes?childId=${currentChild.id}`}
              prefetch={true}
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            >
              <GraduationCap size={16} />
              <span>Class Details</span>
            </Link>
          )}

          {activePage !== "dashboard" && (
            <Link
              href={`/dashboard/parent?childId=${currentChild.id}`}
              prefetch={true}
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

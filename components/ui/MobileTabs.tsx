"use client";

import React, { useRef, useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import styles from "./MobileTabs.module.css";

export interface MobileTabItem {
  id: string;
  label: string;
  mobileLabel?: string;
  icon?: React.ReactNode;
  badge?: string | number;
  onClick?: () => void;
  title?: string;
}

interface MobileTabsProps {
  tabs: MobileTabItem[];
  activeTab: string;
  onChange?: (tabId: string) => void;
  syncWithUrl?: boolean;
  queryParamName?: string;
  className?: string;
  ariaLabel?: string;
}

function MobileTabsInner({
  tabs,
  activeTab,
  onChange,
  syncWithUrl = false,
  queryParamName = "tab",
  className = "",
  ariaLabel = "Page navigation tabs",
}: MobileTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const containerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check scroll positions to show/hide gradient fades
  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll]);

  // Center active tab smoothly on change
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        inline: "center",
        behavior: "smooth",
        block: "nearest",
      });
    }
    checkScroll();
  }, [activeTab, checkScroll]);

  // Sync tab with URL param if enabled
  useEffect(() => {
    if (!syncWithUrl || !searchParams) return;
    const tabParam = searchParams.get(queryParamName);
    if (tabParam && tabParam !== activeTab) {
      const match = tabs.find(
        (t) => t.id.toLowerCase() === tabParam.toLowerCase()
      );
      if (match && onChange) {
        onChange(match.id);
      }
    }
  }, [syncWithUrl, searchParams, queryParamName, tabs, activeTab, onChange]);

  const handleTabClick = (tab: MobileTabItem) => {
    if (tab.onClick) {
      tab.onClick();
      return;
    }
    if (onChange) {
      onChange(tab.id);
    }
    if (syncWithUrl && pathname) {
      const params = new URLSearchParams(searchParams ? searchParams.toString() : "");
      params.set(queryParamName, tab.id.toLowerCase());
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (currentIndex === -1) return;

    let targetIndex: number | null = null;
    if (e.key === "ArrowRight") {
      targetIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      targetIndex = 0;
    } else if (e.key === "End") {
      targetIndex = tabs.length - 1;
    }

    if (targetIndex !== null) {
      e.preventDefault();
      handleTabClick(tabs[targetIndex]);
    }
  };

  return (
    <div className={`${styles.tabsWrapper} ${className}`}>
      {canScrollLeft && <div className={styles.fadeLeft} aria-hidden="true" />}
      <div
        ref={containerRef}
        className={styles.scrollContainer}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={isActive ? activeTabRef : null}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              id={`tab-${tab.id}`}
              aria-controls={`panel-${tab.id}`}
              className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ""}`}
              onClick={() => handleTabClick(tab)}
              title={tab.title || tab.label}
            >
              {tab.icon}
              <span className={styles.tabLabelMobile}>
                {tab.mobileLabel || tab.label}
              </span>
              <span className={styles.tabLabelDesktop}>{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== null && tab.badge !== "" && (
                <span className={styles.tabBadge}>{tab.badge}</span>
              )}
            </button>
          );
        })}
      </div>
      {canScrollRight && <div className={styles.fadeRight} aria-hidden="true" />}
    </div>
  );
}

export function MobileTabs(props: MobileTabsProps) {
  return (
    <Suspense fallback={null}>
      <MobileTabsInner {...props} />
    </Suspense>
  );
}

export default MobileTabs;

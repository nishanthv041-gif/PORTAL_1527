"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./ClassSelector.module.css";
import { Search, X, Loader2 } from "lucide-react";

interface ClassItem {
  id: string;
  name: string;
  section: string;
}

interface ClassSelectorProps {
  classes: ClassItem[];
}

export default function ClassSelector({ classes }: ClassSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentClassId = searchParams.get("classId");

  const [searchTerm, setSearchTerm] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingClassId, setPendingClassId] = useState<string | null>(null);

  // Memoize grouped classes to eliminate unnecessary recalculations
  const groupedClasses = useMemo(() => {
    return classes.reduce((acc, curr) => {
      if (!acc[curr.name]) acc[curr.name] = [];
      acc[curr.name].push(curr);
      return acc;
    }, {} as Record<string, ClassItem[]>);
  }, [classes]);

  const handleSelect = (id: string) => {
    if (id === currentClassId) return;
    setPendingClassId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("classId", id);
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
    });
  };

  const handleClear = () => {
    setPendingClassId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("classId");
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
    });
  };

  const filteredNames = useMemo(() => {
    if (!searchTerm.trim()) return Object.keys(groupedClasses);
    const q = searchTerm.toLowerCase();
    return Object.keys(groupedClasses).filter(name =>
      name.toLowerCase().includes(q)
    );
  }, [groupedClasses, searchTerm]);

  return (
    <div className={styles.selectorContainer}>
      <div className={styles.searchBar}>
        <Search size={20} className={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search classes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
        {(searchTerm || currentClassId) && (
          <button
            onClick={() => { setSearchTerm(""); handleClear(); }}
            className={styles.clearBtn}
            title="Clear class filter"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className={styles.dropdownGrid}>
        {filteredNames.map(name => (
          <div key={name} className={styles.classGroup}>
            <h4 className={styles.groupTitle}>{name}</h4>
            <div className={styles.sectionButtons}>
              {groupedClasses[name].sort((a, b) => a.section.localeCompare(b.section)).map(cls => {
                const isActive = currentClassId === cls.id;
                const isLoading = isPending && pendingClassId === cls.id;

                return (
                  <button
                    key={cls.id}
                    onClick={() => handleSelect(cls.id)}
                    disabled={isPending && pendingClassId === cls.id}
                    className={`${styles.sectionBtn} ${isActive ? styles.activeBtn : ""} ${isLoading ? styles.loadingBtn : ""}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    {isLoading && <Loader2 size={12} className="animate-spin" />}
                    <span>Section {cls.section}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

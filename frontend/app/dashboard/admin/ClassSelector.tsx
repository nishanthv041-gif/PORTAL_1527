"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./ClassSelector.module.css";
import { Search, X } from "lucide-react";

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
  
  // Group classes by name
  const groupedClasses = classes.reduce((acc, curr) => {
    if (!acc[curr.name]) acc[curr.name] = [];
    acc[curr.name].push(curr);
    return acc;
  }, {} as Record<string, ClassItem[]>);

  const handleSelect = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("classId", id);
    router.push(`?${params.toString()}`);
  };

  const handleClear = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("classId");
    router.push(`?${params.toString()}`);
  };

  const filteredNames = Object.keys(groupedClasses).filter(name => 
    name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <button onClick={() => { setSearchTerm(""); handleClear(); }} className={styles.clearBtn}>
            <X size={20} />
          </button>
        )}
      </div>
      
      <div className={styles.dropdownGrid}>
        {filteredNames.map(name => (
          <div key={name} className={styles.classGroup}>
            <h4 className={styles.groupTitle}>{name}</h4>
            <div className={styles.sectionButtons}>
              {groupedClasses[name].sort((a, b) => a.section.localeCompare(b.section)).map(cls => (
                <button
                  key={cls.id}
                  onClick={() => handleSelect(cls.id)}
                  className={`${styles.sectionBtn} ${currentClassId === cls.id ? styles.activeBtn : ""}`}
                >
                  Section {cls.section}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

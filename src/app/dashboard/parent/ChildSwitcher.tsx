"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type ChildData = {
  id: string;
  firstName: string;
  lastName: string;
};

export default function ChildSwitcher({ studentList, selectedChildId }: { studentList: ChildData[], selectedChildId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const childId = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set('childId', childId);
    
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--card)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--foreground)', opacity: 0.8 }}>Viewing:</span>
      <select 
        value={selectedChildId} 
        onChange={handleSelect}
        style={{ 
          padding: '0.25rem 0.5rem',
          borderRadius: '4px',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--background)',
          color: 'var(--foreground)',
          fontWeight: 600,
          outline: 'none',
          cursor: 'pointer'
        }}
      >
        {studentList.map(child => (
          <option key={child.id} value={child.id}>
            {child.firstName} {child.lastName}
          </option>
        ))}
      </select>
    </div>
  );
}

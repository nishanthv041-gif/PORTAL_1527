"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Users, Home, Building2 } from "lucide-react";

function setChildCookie(childId: string) {
  if (typeof document !== "undefined") {
    document.cookie = `selectedChildId=${encodeURIComponent(childId)}; path=/; max-age=31536000; SameSite=Lax`;
  }
}

export type ChildData = {
  id: string;
  firstName: string;
  lastName: string;
  rollNumber?: string;
  residenceType?: string | null;
  class?: {
    id: string;
    name: string;
    section: string;
  } | null;
};

export default function ChildSwitcher({ 
  studentList, 
  selectedChildId 
}: { 
  studentList: ChildData[]; 
  selectedChildId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSelect = (childId: string) => {
    setChildCookie(childId);
    
    // Update URL query params
    const params = new URLSearchParams(searchParams.toString());
    params.set('childId', childId);
    
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  };

  if (!studentList || studentList.length === 0) {
    return null;
  }

  // If parent only has 1 child, display active child tag
  if (studentList.length === 1) {
    const child = studentList[0];
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.65rem',
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        padding: '0.45rem 0.9rem',
        fontSize: '0.85rem'
      }}>
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          backgroundColor: 'rgba(99, 102, 241, 0.12)',
          color: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '0.75rem'
        }}>
          {child.firstName[0]}
        </div>
        <div>
          <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>
            {child.firstName} {child.lastName}
          </span>
          {child.class && (
            <span style={{ marginLeft: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
              ({child.class.name} - {child.class.section})
            </span>
          )}
        </div>
      </div>
    );
  }

  // Multiple children: Interactive pill buttons
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.4rem',
      backgroundColor: 'var(--card-bg)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '0.3rem 0.45rem',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      maxWidth: '100%',
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0 0.35rem',
        color: 'var(--text-secondary)',
        fontSize: '0.78rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flexShrink: 0
      }}>
        <Users size={14} />
        <span>Select Child:</span>
      </div>

      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'nowrap' }}>
        {studentList.map(child => {
          const isSelected = child.id === selectedChildId;
          const isHostel = child.residenceType?.toUpperCase().includes("HOSTEL");

          return (
            <button
              key={child.id}
              onClick={() => handleSelect(child.id)}
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                backgroundColor: isSelected ? 'var(--primary)' : 'rgba(0,0,0,0.04)',
                color: isSelected ? '#ffffff' : 'var(--foreground)',
                cursor: 'pointer',
                fontWeight: isSelected ? 700 : 500,
                fontSize: '0.82rem',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s ease-in-out'
              }}
            >
              <div style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(99, 102, 241, 0.15)',
                color: isSelected ? '#fff' : 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 700,
                flexShrink: 0
              }}>
                {child.firstName[0]}
              </div>

              <span style={{ whiteSpace: 'nowrap' }}>{child.firstName}</span>

              {child.class && (
                <span style={{
                  fontSize: '0.7rem',
                  padding: '0.1rem 0.4rem',
                  borderRadius: '4px',
                  backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                  color: isSelected ? '#fff' : 'var(--text-secondary)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}>
                  {child.class.name} - {child.class.section}
                </span>
              )}

              {child.residenceType && (
                <span 
                  title={isHostel ? "Hostel Resident" : "Dayscholar"}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    opacity: isSelected ? 0.9 : 0.7
                  }}
                >
                  {isHostel ? <Building2 size={13} /> : <Home size={13} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

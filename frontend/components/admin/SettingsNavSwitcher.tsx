"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Users, GraduationCap } from "lucide-react";

export default function SettingsNavSwitcher() {
  const pathname = usePathname();

  const tabs = [
    {
      href: "/dashboard/admin/settings",
      label: "School Information",
      icon: <Building2 size={18} />,
    },
    {
      href: "/dashboard/admin/teachers",
      label: "Teacher Management",
      icon: <Users size={18} />,
    },
    {
      href: "/dashboard/admin/students",
      label: "Parent & Student",
      icon: <GraduationCap size={18} />,
    },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        background: "var(--card-bg, #0f172a)",
        padding: "0.35rem",
        borderRadius: "12px",
        border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
        marginBottom: "1.5rem",
        flexWrap: "wrap",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.55rem 1rem",
              borderRadius: "8px",
              fontSize: "0.875rem",
              fontWeight: isActive ? 700 : 500,
              textDecoration: "none",
              color: isActive ? "#ffffff" : "var(--text-secondary, #94a3b8)",
              background: isActive ? "var(--primary, #3b82f6)" : "transparent",
              transition: "all 0.15s ease",
              boxShadow: isActive ? "0 2px 8px rgba(59, 130, 246, 0.35)" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}


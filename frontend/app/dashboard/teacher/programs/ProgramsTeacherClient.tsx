"use client";

import { useState } from "react";
import { 
  Calendar as CalendarIcon, MapPin, Clock, 
  Search, Star, ChevronDown, ChevronUp, History, Sparkles, User, Filter, GraduationCap, CheckCircle2
} from "lucide-react";
import { CalendarEvent } from "@prisma/client";

interface TeacherClass {
  id: string;
  name: string;
  section: string;
}

export default function ProgramsTeacherClient({ 
  programs,
  teacherClasses = []
}: { 
  programs: CalendarEvent[];
  teacherClasses?: TeacherClass[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "UPCOMING" | "PREVIOUS">("ALL");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter programs by search query and class filter
  const filtered = programs.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      p.title.toLowerCase().includes(q) ||
      (p.location && p.location.toLowerCase().includes(q)) ||
      (p.organizer && p.organizer.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.targetClass && p.targetClass.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (selectedClassFilter === "ALL") return true;
    if (selectedClassFilter === "SCHOOL_WIDE") {
      return !p.targetClass || p.targetClass === "ALL";
    }
    return p.targetClass === selectedClassFilter;
  });

  const isToday = (date: Date) => {
    const d = new Date(date);
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  const upcomingPrograms = filtered.filter(p => new Date(p.date) >= today);
  const previousPrograms = filtered.filter(p => new Date(p.date) < today);

  const displayedPrograms = 
    activeTab === "UPCOMING" ? upcomingPrograms :
    activeTab === "PREVIOUS" ? previousPrograms :
    filtered;

  const schoolWideCount = programs.filter(p => !p.targetClass || p.targetClass === "ALL").length;
  const upcomingTotal = programs.filter(p => new Date(p.date) >= today).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      {/* Top Highlights Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.08) 50%, rgba(59, 130, 246, 0.1) 100%)",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          borderRadius: "18px",
          padding: "1.5rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "1.5rem",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              boxShadow: "0 8px 20px rgba(99, 102, 241, 0.3)"
            }}
          >
            <Sparkles size={26} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--foreground)" }}>
              Teacher School Programs Hub
            </h2>
          </div>
        </div>

        {/* Quick Metrics */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div
            style={{
              padding: "0.6rem 1.1rem",
              background: "var(--card-bg, rgba(255, 255, 255, 0.8))",
              border: "1px solid var(--border-color, #e5e7eb)",
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}
          >
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--foreground)" }}>{programs.length}</span>
          </div>

          <div
            style={{
              padding: "0.6rem 1.1rem",
              background: "var(--card-bg, rgba(255, 255, 255, 0.8))",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}
          >
            <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 600 }}>Upcoming</span>
            <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#059669" }}>{upcomingTotal}</span>
          </div>

          <div
            style={{
              padding: "0.6rem 1.1rem",
              background: "var(--card-bg, rgba(255, 255, 255, 0.8))",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}
          >
            <span style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 600 }}>School-Wide</span>
            <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--primary)" }}>{schoolWideCount}</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        {/* Search Input */}
        <div
          style={{
            position: "relative",
            flex: "1 1 280px",
            maxWidth: "480px"
          }}
        >
          <Search
            size={18}
            style={{
              position: "absolute",
              left: "1rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-secondary)"
            }}
          />
          <input
            type="text"
            placeholder="Search programs by title, venue, organizer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "0.75rem 1rem 0.75rem 2.75rem",
              borderRadius: "12px",
              border: "1px solid var(--border-color, #e5e7eb)",
              background: "var(--card-bg, #ffffff)",
              color: "var(--foreground)",
              fontSize: "0.92rem",
              outline: "none",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
            }}
          />
        </div>

        {/* Class Filter & Tab Selector */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          {/* Class Filter Dropdown */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Filter size={16} style={{ position: "absolute", left: "0.75rem", color: "var(--text-secondary)", pointerEvents: "none" }} />
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              style={{
                padding: "0.65rem 1rem 0.65rem 2.25rem",
                borderRadius: "10px",
                border: "1px solid var(--border-color, #e5e7eb)",
                background: "var(--card-bg, #ffffff)",
                color: "var(--foreground)",
                fontSize: "0.85rem",
                fontWeight: 600,
                outline: "none",
                cursor: "pointer"
              }}
            >
              <option value="ALL">All Target Classes</option>
              <option value="SCHOOL_WIDE">🌐 School-Wide Only</option>
              {teacherClasses.map(c => (
                <option key={c.id} value={`Class ${c.name} - ${c.section}`}>
                  🏫 Class {c.name} - {c.section}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation Tabs */}
          <div
            style={{
              display: "flex",
              background: "var(--border-color, rgba(107, 114, 128, 0.15))",
              padding: "3px",
              borderRadius: "10px",
              gap: "2px"
            }}
          >
            {(["ALL", "UPCOMING", "PREVIOUS"] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "0.55rem 0.95rem",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: activeTab === tab ? "var(--card-bg, #ffffff)" : "transparent",
                  color: activeTab === tab ? "var(--primary, #6366f1)" : "var(--text-secondary)",
                  boxShadow: activeTab === tab ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                {tab === "ALL" ? `All (${filtered.length})` : 
                 tab === "UPCOMING" ? `Upcoming (${upcomingPrograms.length})` : 
                 `Previous (${previousPrograms.length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Programs List */}
      {displayedPrograms.length === 0 ? (
        <div
          style={{
            padding: "3.5rem 1.5rem",
            textAlign: "center",
            background: "var(--card-bg, #ffffff)",
            borderRadius: "16px",
            border: "1px dashed var(--border-color, #e5e7eb)",
            color: "var(--text-secondary)"
          }}
        >
          <CalendarIcon size={48} style={{ opacity: 0.3, margin: "0 auto 1rem" }} />
          <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--foreground)" }}>No Programs Found</h3>
          <p style={{ margin: 0, fontSize: "0.875rem" }}>
            {searchQuery 
              ? `No school programs matched "${searchQuery}". Try a different keyword.` 
              : "There are no school programs matching the selected filter."}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
            gap: "1.25rem",
            width: "100%",
            minWidth: 0
          }}
        >
          {displayedPrograms.map(prog => {
            const eventDate = new Date(prog.date);
            const isPast = eventDate < today;
            const happeningToday = isToday(prog.date);
            const dayName = eventDate.toLocaleDateString(undefined, { weekday: "short" });
            const dayNum = eventDate.getDate();
            const monthName = eventDate.toLocaleDateString(undefined, { month: "short" });
            const yearNum = eventDate.getFullYear();
            const isExpanded = expandedId === prog.id;

            return (
              <div
                key={prog.id}
                style={{
                  background: "var(--card-bg, #ffffff)",
                  borderRadius: "16px",
                  border: happeningToday 
                    ? "2px solid #f59e0b" 
                    : isPast 
                      ? "1px solid var(--border-color, #e5e7eb)" 
                      : "1px solid rgba(99, 102, 241, 0.25)",
                  boxShadow: happeningToday 
                    ? "0 4px 20px rgba(245, 158, 11, 0.15)"
                    : isPast 
                      ? "none" 
                      : "0 4px 16px rgba(99, 102, 241, 0.05)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease"
                }}
              >
                {/* Card Header with Date Badge & Title */}
                <div style={{ padding: "1.25rem 1.25rem 0.75rem 1.25rem", display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                  {/* Calendar Date Badge */}
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "12px",
                      background: happeningToday
                        ? "linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.15))"
                        : isPast 
                          ? "rgba(107, 114, 128, 0.08)" 
                          : "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))",
                      border: happeningToday
                        ? "1px solid rgba(245, 158, 11, 0.4)"
                        : `1px solid ${isPast ? "var(--border-color, #e5e7eb)" : "rgba(99, 102, 241, 0.3)"}`,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    <span 
                      style={{ 
                        fontSize: "0.65rem", 
                        fontWeight: 700, 
                        textTransform: "uppercase", 
                        color: happeningToday ? "#b45309" : isPast ? "var(--text-secondary)" : "var(--primary)" 
                      }}
                    >
                      {monthName}
                    </span>
                    <span 
                      style={{ 
                        fontSize: "1.25rem", 
                        fontWeight: 800, 
                        color: happeningToday ? "#b45309" : "var(--foreground)", 
                        lineHeight: 1.1 
                      }}
                    >
                      {dayNum}
                    </span>
                    <span style={{ fontSize: "0.6rem", opacity: 0.7 }}>
                      {dayName}
                    </span>
                  </div>

                  {/* Title & Status */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                      <h3 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 700, color: "var(--foreground)", wordBreak: "break-word" }}>
                        {prog.title}
                      </h3>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          padding: "0.2rem 0.55rem",
                          borderRadius: "12px",
                          background: happeningToday
                            ? "rgba(245, 158, 11, 0.15)"
                            : isPast
                              ? "rgba(107, 114, 128, 0.1)"
                              : "rgba(16, 185, 129, 0.12)",
                          color: happeningToday
                            ? "#b45309"
                            : isPast
                              ? "var(--text-secondary)"
                              : "#059669",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                          flexShrink: 0
                        }}
                      >
                        {happeningToday ? "Happening Today" : isPast ? "Completed" : "Upcoming"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
                      {/* Target Class Badge */}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "0.2rem 0.55rem",
                          borderRadius: "6px",
                          background: (!prog.targetClass || prog.targetClass === "ALL")
                            ? "rgba(99, 102, 241, 0.1)"
                            : "rgba(59, 130, 246, 0.12)",
                          color: (!prog.targetClass || prog.targetClass === "ALL")
                            ? "var(--primary)"
                            : "#2563eb",
                          border: (!prog.targetClass || prog.targetClass === "ALL")
                            ? "1px solid rgba(99, 102, 241, 0.2)"
                            : "1px solid rgba(59, 130, 246, 0.25)"
                        }}
                      >
                        {(!prog.targetClass || prog.targetClass === "ALL") ? "🌐 All Classes" : `🏫 ${prog.targetClass}`}
                      </span>

                      {/* Year tag */}
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          padding: "0.2rem 0.45rem",
                          borderRadius: "6px",
                          background: "var(--background)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-color, #e5e7eb)"
                        }}
                      >
                        {yearNum}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Event Details Grid */}
                <div
                  style={{
                    padding: "0.75rem 1.25rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                    background: "rgba(0,0,0,0.015)",
                    borderTop: "1px solid var(--border-color, #e5e7eb)",
                    borderBottom: "1px solid var(--border-color, #e5e7eb)"
                  }}
                >
                  {/* Time */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Clock size={15} style={{ color: "var(--primary)", flexShrink: 0 }} />
                    <span>
                      {prog.startTime && prog.endTime ? (
                        <><strong>Time:</strong> {prog.startTime} - {prog.endTime}</>
                      ) : (
                        <span><strong>Time:</strong> Full Day Schedule</span>
                      )}
                    </span>
                  </div>

                  {/* Venue / Location */}
                  {prog.location && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <MapPin size={15} style={{ color: "#ef4444", flexShrink: 0 }} />
                      <span><strong>Venue:</strong> {prog.location}</span>
                    </div>
                  )}

                  {/* Organizer */}
                  {prog.organizer && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <User size={15} style={{ color: "#10b981", flexShrink: 0 }} />
                      <span><strong>Organizer:</strong> {prog.organizer}</span>
                    </div>
                  )}
                </div>

                {/* Description & Expansion */}
                {prog.description && (
                  <div style={{ padding: "0.9rem 1.25rem", flex: 1 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.875rem",
                        lineHeight: 1.55,
                        color: "var(--foreground)",
                        display: isExpanded ? "block" : "-webkit-box",
                        WebkitLineClamp: isExpanded ? "unset" : 3,
                        WebkitBoxOrient: "vertical",
                        overflow: isExpanded ? "visible" : "hidden"
                      }}
                    >
                      {prog.description}
                    </p>

                    {prog.description.length > 120 && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : prog.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--primary)",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          marginTop: "0.4rem",
                          padding: 0
                        }}
                      >
                        {isExpanded ? (
                          <>Show less <ChevronUp size={14} /></>
                        ) : (
                          <>Read details <ChevronDown size={14} /></>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

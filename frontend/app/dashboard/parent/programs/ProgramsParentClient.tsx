"use client";

import { useState } from "react";
import { 
  Calendar as CalendarIcon, MapPin, Clock, 
  Search, Star, ChevronDown, ChevronUp, History, Sparkles, User
} from "lucide-react";
import { CalendarEvent } from "@prisma/client";

export default function ProgramsParentClient({ programs }: { programs: CalendarEvent[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "UPCOMING" | "PREVIOUS">("ALL");
  const [showPrevious, setShowPrevious] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter by search query
  const filtered = programs.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      p.title.toLowerCase().includes(q) ||
      (p.location && p.location.toLowerCase().includes(q)) ||
      (p.organizer && p.organizer.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q));
    return matchesSearch;
  });

  const upcomingPrograms = filtered.filter(p => new Date(p.date) >= today);
  const previousPrograms = filtered.filter(p => new Date(p.date) < today);

  const ProgramCard = ({ prog, isPast }: { prog: CalendarEvent; isPast?: boolean }) => {
    const eventDate = new Date(prog.date);
    const dayName = eventDate.toLocaleDateString(undefined, { weekday: "short" });
    const dayNum = eventDate.getDate();
    const monthName = eventDate.toLocaleDateString(undefined, { month: "short" });
    const yearNum = eventDate.getFullYear();

    return (
      <div
        style={{
          background: "var(--card-bg, #ffffff)",
          borderRadius: "14px",
          border: `1px solid ${isPast ? "var(--border-color, #e5e7eb)" : "rgba(99, 102, 241, 0.25)"}`,
          boxShadow: isPast ? "none" : "0 4px 16px rgba(99, 102, 241, 0.05)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          position: "relative"
        }}
      >
        {/* Top Header Row with Date Badge & Title */}
        <div style={{ padding: "1.25rem 1.25rem 0.75rem 1.25rem", display: "flex", gap: "1rem", alignItems: "flex-start" }}>
          {/* Calendar Badge */}
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "12px",
              background: isPast ? "rgba(107, 114, 128, 0.08)" : "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))",
              border: `1px solid ${isPast ? "var(--border-color, #e5e7eb)" : "rgba(99, 102, 241, 0.3)"}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", color: isPast ? "var(--text-secondary)" : "var(--primary)" }}>
              {monthName}
            </span>
            <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--foreground)", lineHeight: 1.1 }}>
              {dayNum}
            </span>
            <span style={{ fontSize: "0.6rem", opacity: 0.7 }}>
              {dayName}
            </span>
          </div>

          {/* Title & Status */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)", wordBreak: "break-word" }}>
                {prog.title}
              </h3>
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "0.2rem 0.55rem",
                  borderRadius: "12px",
                  background: isPast
                    ? "rgba(107, 114, 128, 0.1)"
                    : "rgba(16, 185, 129, 0.12)",
                  color: isPast
                    ? "var(--text-secondary)"
                    : "#059669",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  flexShrink: 0
                }}
              >
                {isPast ? "Concluded" : "Upcoming"}
              </span>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              {eventDate.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </div>

            {/* Target Class Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
              <span style={{
                fontSize: '0.72rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '6px',
                background: (!prog.targetClass || prog.targetClass === 'ALL') ? 'rgba(99, 102, 241, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                color: (!prog.targetClass || prog.targetClass === 'ALL') ? 'var(--primary)' : '#10b981',
                border: `1px solid ${(!prog.targetClass || prog.targetClass === 'ALL') ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}>
                {(!prog.targetClass || prog.targetClass === 'ALL') ? '🌐 All Classes' : `🏫 ${prog.targetClass}`}
              </span>
            </div>
          </div>
        </div>

        {/* Event Details: Time, Location, Organizer */}
        <div style={{ padding: "0 1.25rem 1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            <Clock size={15} style={{ color: "var(--primary)", flexShrink: 0 }} />
            <span>{prog.startTime} {prog.endTime ? `– ${prog.endTime}` : ""}</span>
          </div>

          {prog.location && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              <MapPin size={15} style={{ color: "#ef4444", flexShrink: 0 }} />
              <span>{prog.location}</span>
            </div>
          )}

          {prog.organizer && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              <User size={15} style={{ color: "#8b5cf6", flexShrink: 0 }} />
              <span>Organized by: <strong>{prog.organizer}</strong></span>
            </div>
          )}

          {/* Intimation & Description Box */}
          {prog.description && (
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.85rem 1rem",
                borderRadius: "10px",
                backgroundColor: isPast ? "rgba(0, 0, 0, 0.02)" : "rgba(99, 102, 241, 0.04)",
                border: `1px solid ${isPast ? "var(--border-color, #e5e7eb)" : "rgba(99, 102, 241, 0.12)"}`,
                fontSize: "0.875rem",
                lineHeight: 1.55,
                color: "var(--foreground)"
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--primary)", marginBottom: "0.25rem" }}>
                Program Details &amp; Intimation
              </div>
              {prog.description}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Search and Filter Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "2rem"
        }}
      >
        {/* Search Input */}
        <div style={{ position: "relative", minWidth: "280px", flex: 1, maxWidth: "450px" }}>
          <Search size={17} style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input
            type="text"
            placeholder="Search programs by name, venue, organizer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "0.65rem 1rem 0.65rem 2.6rem",
              borderRadius: "10px",
              border: "1px solid var(--border-color, #e5e7eb)",
              backgroundColor: "var(--card-bg, #ffffff)",
              color: "var(--foreground)",
              fontSize: "0.9rem",
              outline: "none"
            }}
          />
        </div>

        {/* Tab Filters */}
        <div style={{ display: "flex", gap: "0.5rem", background: "var(--card-bg)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
          <button
            onClick={() => setActiveTab("ALL")}
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "7px",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              background: activeTab === "ALL" ? "var(--primary)" : "transparent",
              color: activeTab === "ALL" ? "var(--primary-fg)" : "var(--text-secondary)",
              transition: "all 0.15s ease"
            }}
          >
            All ({filtered.length})
          </button>
          <button
            onClick={() => setActiveTab("UPCOMING")}
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "7px",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              background: activeTab === "UPCOMING" ? "var(--primary)" : "transparent",
              color: activeTab === "UPCOMING" ? "var(--primary-fg)" : "var(--text-secondary)",
              transition: "all 0.15s ease"
            }}
          >
            Upcoming ({upcomingPrograms.length})
          </button>
          <button
            onClick={() => setActiveTab("PREVIOUS")}
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "7px",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              background: activeTab === "PREVIOUS" ? "var(--primary)" : "transparent",
              color: activeTab === "PREVIOUS" ? "var(--primary-fg)" : "var(--text-secondary)",
              transition: "all 0.15s ease"
            }}
          >
            Previous ({previousPrograms.length})
          </button>
        </div>
      </div>

      {/* Main Content Sections */}
      {(activeTab === "ALL" || activeTab === "UPCOMING") && (
        <section style={{ marginBottom: "2.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
            <Sparkles size={20} style={{ color: "var(--primary)" }} />
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
              Upcoming Programs ({upcomingPrograms.length})
            </h2>
          </div>

          {upcomingPrograms.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "1.5rem" }}>
              {upcomingPrograms.map(prog => (
                <ProgramCard key={prog.id} prog={prog} />
              ))}
            </div>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "3rem 1.5rem",
                background: "var(--card-bg)",
                border: "1px dashed var(--border-color)",
                borderRadius: "14px",
                color: "var(--text-secondary)"
              }}
            >
              <CalendarIcon size={40} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No upcoming school programs scheduled at this time.</p>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", opacity: 0.8 }}>Check back soon for new school functions and event notifications.</p>
            </div>
          )}
        </section>
      )}

      {(activeTab === "ALL" || activeTab === "PREVIOUS") && previousPrograms.length > 0 && (
        <section style={{ marginTop: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <History size={19} style={{ color: "var(--text-secondary)" }} />
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-secondary)" }}>
                Previous Programs ({previousPrograms.length})
              </h2>
            </div>
            {activeTab === "ALL" && (
              <button
                type="button"
                onClick={() => setShowPrevious(!showPrevious)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  padding: "0.35rem 0.75rem",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem"
                }}
              >
                {showPrevious ? <><ChevronUp size={14} /> Hide Past</> : <><ChevronDown size={14} /> Show Past</>}
              </button>
            )}
          </div>

          {(activeTab === "PREVIOUS" || showPrevious) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "1.5rem" }}>
              {previousPrograms.map(prog => (
                <ProgramCard key={prog.id} prog={prog} isPast={true} />
              ))}
            </div>
          )}
        </section>
      )}

      {filtered.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "4rem 1.5rem",
            background: "var(--card-bg)",
            border: "1px dashed var(--border-color)",
            borderRadius: "14px",
            color: "var(--text-secondary)"
          }}
        >
          <Star size={44} style={{ opacity: 0.25, margin: "0 auto 1rem" }} />
          <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>No school programs match your search.</p>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem" }}>Try clearing your search query to see all programs.</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useTransition } from "react";
import { 
  Upload, FileText, Image as ImageIcon, FileSpreadsheet, 
  FileCheck, AlertTriangle, X, Check, RefreshCw, Trash2, Plus, 
  Clock, MapPin, Loader2, Sparkles, AlertCircle
} from "lucide-react";
import { scanTimetableAction } from "@/backend/api/actions/dashboard/admin/timetable/scanTimetableAction";
import type { ScannedSlot } from "@/backend/api/actions/dashboard/admin/timetable/scanTimetableTypes";
import { bulkCreateTimetableSlotsAction } from "@/backend/api/actions/dashboard/admin/timetable/actions";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

const DEFAULT_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: "08:00", end: "08:45" },
  2: { start: "08:45", end: "09:30" },
  3: { start: "09:30", end: "10:15" },
  4: { start: "10:30", end: "11:15" },
  5: { start: "11:15", end: "12:00" },
  6: { start: "12:45", end: "13:30" },
  7: { start: "13:30", end: "14:15" },
  8: { start: "14:15", end: "15:00" },
};

interface TimetableScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClassId: string;
  selectedClassName: string;
  availableSubjects: Array<{ id: string; name: string }>;
  onSaveSuccess: () => void;
}

export default function TimetableScanModal({
  isOpen,
  onClose,
  selectedClassId,
  selectedClassName,
  availableSubjects,
  onSaveSuccess,
}: TimetableScanModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [scannedSlots, setScannedSlots] = useState<ScannedSlot[]>([]);
  const [fileDetails, setFileDetails] = useState<{ name: string; type: string } | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [activeDayFilter, setActiveDayFilter] = useState<string>("ALL");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setScanError(null);
      // Automatically trigger scan on selection
      triggerScan(file);
    }
  };

  const triggerScan = async (fileToScan: File) => {
    setIsScanning(true);
    setScanError(null);
    setWarnings([]);

    try {
      const formData = new FormData();
      formData.set("classId", selectedClassId);
      formData.set("file", fileToScan);

      const result = await scanTimetableAction(formData);

      if (result.error) {
        setScanError(result.error);
        if (result.fileName && result.fileType) {
          setFileDetails({ name: result.fileName, type: result.fileType });
        }
      } else if (result.scannedSlots) {
        setScannedSlots(result.scannedSlots);
        setWarnings(result.warnings || []);
        setFileDetails({
          name: result.fileName || fileToScan.name,
          type: result.fileType || "Document"
        });
      }
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : "An unexpected error occurred while scanning.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleRescan = () => {
    // Reset file and state so user can pick another file or re-upload
    setSelectedFile(null);
    setScannedSlots([]);
    setScanError(null);
    setWarnings([]);
    setFileDetails(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleSlotChange = (slotId: string, field: keyof ScannedSlot, value: any) => {
    setScannedSlots(prev => prev.map(slot => {
      if (slot.id === slotId) {
        if (field === "isBreak") {
          const isBreak = Boolean(value);
          return {
            ...slot,
            isBreak,
            subjectId: isBreak ? "" : (availableSubjects[0]?.id || ""),
            subjectName: isBreak ? "Break / Recess" : (availableSubjects[0]?.name || "")
          };
        }
        if (field === "subjectId") {
          const sub = availableSubjects.find(s => s.id === value);
          return {
            ...slot,
            subjectId: value,
            subjectName: sub ? sub.name : slot.subjectName
          };
        }
        return { ...slot, [field]: value };
      }
      return slot;
    }));
  };

  const handleDeleteSlot = (slotId: string) => {
    setScannedSlots(prev => prev.filter(s => s.id !== slotId));
  };

  const handleAddSlot = () => {
    const dayToUse = activeDayFilter !== "ALL" ? activeDayFilter : "MONDAY";
    // Find next available period for this day
    const existingPeriods = scannedSlots.filter(s => s.dayOfWeek === dayToUse).map(s => s.period);
    let nextPeriod = 1;
    for (let p = 1; p <= 8; p++) {
      if (!existingPeriods.includes(p)) {
        nextPeriod = p;
        break;
      }
    }

    const newSlot: ScannedSlot = {
      id: `manual-${dayToUse}-${nextPeriod}-${Date.now()}`,
      dayOfWeek: dayToUse,
      period: nextPeriod,
      subjectId: availableSubjects[0]?.id || "",
      subjectName: availableSubjects[0]?.name || "Subject",
      startTime: DEFAULT_TIMES[nextPeriod]?.start || "08:00",
      endTime: DEFAULT_TIMES[nextPeriod]?.end || "08:45",
      classroom: "",
      isBreak: false
    };

    setScannedSlots(prev => [...prev, newSlot]);
  };

  const handleSaveToTimetable = () => {
    if (scannedSlots.length === 0) {
      alert("No timetable slots to save.");
      return;
    }

    // Format for bulkCreateTimetableSlotsAction
    const slotsPayload = scannedSlots.map(s => ({
      dayOfWeek: s.dayOfWeek,
      period: s.period,
      subjectId: s.isBreak ? null : (s.subjectId || null),
      startTime: s.startTime || DEFAULT_TIMES[s.period]?.start || "08:00",
      endTime: s.endTime || DEFAULT_TIMES[s.period]?.end || "08:45",
      classroom: s.classroom || "",
      isBreak: Boolean(s.isBreak)
    }));

    startSaveTransition(async () => {
      const res = await bulkCreateTimetableSlotsAction(selectedClassId, slotsPayload);
      if (res.error) {
        alert("Failed to update timetable: " + res.error);
      } else {
        alert(`✅ Timetable updated successfully with ${slotsPayload.length} slots for ${selectedClassName}!`);
        onSaveSuccess();
        onClose();
      }
    });
  };

  // Filter slots for table view
  const visibleSlots = activeDayFilter === "ALL" 
    ? scannedSlots 
    : scannedSlots.filter(s => s.dayOfWeek === activeDayFilter);

  // Sort visible slots by day, then period
  visibleSlots.sort((a, b) => {
    const dayA = DAYS.indexOf(a.dayOfWeek);
    const dayB = DAYS.indexOf(b.dayOfWeek);
    if (dayA !== dayB) return dayA - dayB;
    return a.period - b.period;
  });

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem"
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isScanning && !isSaving) onClose(); }}
    >
      <div
        style={{
          background: "var(--card-bg, #ffffff)",
          borderRadius: "18px",
          border: "1px solid var(--border-color)",
          padding: "2rem",
          maxWidth: "1050px",
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 60px rgba(0,0,0,0.25)",
          position: "relative"
        }}
      >
        {/* Hidden File Input supporting Photo, PDF, Spreadsheet/Excel, Word doc */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.bmp,image/*,.pdf,application/pdf,.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />

        {/* Modal Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "var(--primary-bg)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={20} />
              </div>
              <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700 }}>
                Scan &amp; Update Timetable
              </h2>
            </div>
            <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              Upload any file (<strong>Photo, PDF, Excel sheet, Spreadsheet, or Word doc</strong>) to scan, edit, and update the schedule for <strong>{selectedClassName}</strong>.
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={isScanning || isSaving}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.35rem", borderRadius: "6px" }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: "260px" }}>
          {/* 1. INITIAL UPLOAD STATE */}
          {!selectedFile && !isScanning && scannedSlots.length === 0 && (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed var(--border-color)",
                borderRadius: "14px",
                padding: "3.5rem 1.5rem",
                textAlign: "center",
                cursor: "pointer",
                background: "rgba(99, 102, 241, 0.02)",
                transition: "all 0.2s ease"
              }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.backgroundColor = "rgba(99, 102, 241, 0.05)"; }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.backgroundColor = "rgba(99, 102, 241, 0.02)"; }}
            >
              <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginBottom: "1rem" }}>
                <div style={{ padding: "0.75rem", borderRadius: "12px", background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6" }} title="Images / Photos"><ImageIcon size={26} /></div>
                <div style={{ padding: "0.75rem", borderRadius: "12px", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444" }} title="PDF Documents"><FileText size={26} /></div>
                <div style={{ padding: "0.75rem", borderRadius: "12px", background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }} title="Excel / Spreadsheets"><FileSpreadsheet size={26} /></div>
                <div style={{ padding: "0.75rem", borderRadius: "12px", background: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6" }} title="Word Documents"><FileCheck size={26} /></div>
              </div>

              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                Click to browse or drop your Timetable file here
              </h3>
              <p style={{ margin: "0.5rem 0 1.25rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                Supports <strong>Photos (PNG, JPG), PDF documents, Excel spreadsheets (.xlsx, .csv), and Word documents (.docx)</strong>
              </p>

              <button
                type="button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.65rem 1.5rem",
                  borderRadius: "8px",
                  background: "var(--primary)",
                  color: "var(--primary-fg)",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: "pointer"
                }}
              >
                <Upload size={17} /> Browse Document
              </button>
            </div>
          )}

          {/* 2. SCANNING LOADER STATE */}
          {isScanning && (
            <div style={{ textAlign: "center", padding: "4rem 2rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ position: "relative", width: "64px", height: "64px", marginBottom: "1.5rem" }}>
                <Loader2 size={64} style={{ color: "var(--primary)", animation: "spin 1.2s linear infinite" }} />
              </div>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
                Scanning Timetable Details...
              </h3>
              <p style={{ margin: "0.5rem 0 0 0", color: "var(--text-secondary)", fontSize: "0.875rem", maxWidth: "450px" }}>
                Detecting days, periods, subjects, and timings from <strong>{selectedFile?.name}</strong>.
              </p>
            </div>
          )}

          {/* 3. ERROR DURING SCANNING */}
          {scanError && !isScanning && (
            <div style={{ padding: "1.5rem", borderRadius: "12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", color: "#b91c1c", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                <AlertCircle size={22} style={{ flexShrink: 0, marginTop: "2px" }} />
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Scanning Issue Detected</h4>
                  <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.875rem", lineHeight: 1.5 }}>
                    {scanError}
                  </p>
                  <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <button
                      onClick={handleRescan}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.45rem 0.9rem",
                        borderRadius: "6px",
                        border: "1px solid #ef4444",
                        background: "#ef4444",
                        color: "#ffffff",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        fontWeight: 600
                      }}
                    >
                      <RefreshCw size={14} /> Scan Another File
                    </button>
                    <button
                      onClick={() => {
                        setScanError(null);
                        // Start with manual empty slots for editing
                        handleAddSlot();
                      }}
                      style={{
                        padding: "0.45rem 0.9rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        background: "var(--card-bg)",
                        color: "var(--foreground)",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        fontWeight: 500
                      }}
                    >
                      + Add Slots Manually
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. SCANNED RESULTS WITH INTERACTIVE EDITING TABLE */}
          {!isScanning && scannedSlots.length > 0 && (
            <div>
              {/* Scan summary banner */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", padding: "0.85rem 1.25rem", borderRadius: "10px", background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)", marginBottom: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <FileCheck size={20} color="var(--primary)" />
                  <div>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                      Scanned {scannedSlots.length} Timetable Slots
                    </span>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
                      from <strong>{fileDetails?.name || selectedFile?.name}</strong> ({fileDetails?.type})
                    </span>
                  </div>
                </div>

                {/* Rescan / Scan Again button */}
                <button
                  type="button"
                  onClick={handleRescan}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.4rem 0.85rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    background: "var(--card-bg)",
                    color: "var(--foreground)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                  title="Upload another file or re-scan"
                >
                  <RefreshCw size={14} /> Scan Again / Re-upload
                </button>
              </div>

              {/* Warnings alert if any */}
              {warnings.length > 0 && (
                <div style={{ padding: "0.75rem 1rem", borderRadius: "8px", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.25)", color: "#b45309", marginBottom: "1rem", fontSize: "0.85rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                    <AlertTriangle size={15} /> Scan Warnings ({warnings.length})
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                    {warnings.slice(0, 3).map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                    {warnings.length > 3 && <li>...and {warnings.length - 3} more items. You can review and edit all fields below.</li>}
                  </ul>
                </div>
              )}

              {/* Day filter pills & Add Slot button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  <button
                    onClick={() => setActiveDayFilter("ALL")}
                    style={{
                      padding: "0.35rem 0.75rem",
                      borderRadius: "6px",
                      border: "none",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      background: activeDayFilter === "ALL" ? "var(--primary)" : "rgba(0,0,0,0.05)",
                      color: activeDayFilter === "ALL" ? "var(--primary-fg)" : "var(--text-secondary)"
                    }}
                  >
                    All Days ({scannedSlots.length})
                  </button>
                  {DAYS.map(d => {
                    const count = scannedSlots.filter(s => s.dayOfWeek === d).length;
                    return (
                      <button
                        key={d}
                        onClick={() => setActiveDayFilter(d)}
                        style={{
                          padding: "0.35rem 0.65rem",
                          borderRadius: "6px",
                          border: "none",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          background: activeDayFilter === d ? "var(--primary)" : "rgba(0,0,0,0.05)",
                          color: activeDayFilter === d ? "var(--primary-fg)" : "var(--text-secondary)"
                        }}
                      >
                        {d.slice(0, 3)} ({count})
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleAddSlot}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.35rem 0.75rem",
                    borderRadius: "6px",
                    border: "1px dashed var(--primary)",
                    background: "rgba(99, 102, 241, 0.05)",
                    color: "var(--primary)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  <Plus size={14} /> Add Slot
                </button>
              </div>

              {/* Editable Slots Table */}
              <div style={{ border: "1px solid var(--border-color)", borderRadius: "10px", overflow: "hidden", maxHeight: "380px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--card-bg)", zIndex: 10, borderBottom: "1px solid var(--border-color)" }}>
                    <tr style={{ background: "rgba(0,0,0,0.02)" }}>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Day</th>
                      <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600, width: "90px" }}>Period</th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Subject</th>
                      <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600, width: "160px" }}>Time (Start – End)</th>
                      <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600, width: "110px" }}>Classroom</th>
                      <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600, width: "80px", textAlign: "center" }}>Break?</th>
                      <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600, width: "50px", textAlign: "center" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSlots.map((slot) => (
                      <tr key={slot.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        {/* Day */}
                        <td style={{ padding: "0.5rem 1rem" }}>
                          <select
                            value={slot.dayOfWeek}
                            onChange={(e) => handleSlotChange(slot.id, "dayOfWeek", e.target.value)}
                            style={{ padding: "0.4rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit", fontWeight: 600, fontSize: "0.8rem" }}
                          >
                            {DAYS.map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </td>

                        {/* Period */}
                        <td style={{ padding: "0.5rem 0.5rem" }}>
                          <select
                            value={slot.period}
                            onChange={(e) => {
                              const p = parseInt(e.target.value, 10);
                              handleSlotChange(slot.id, "period", p);
                              if (DEFAULT_TIMES[p]) {
                                handleSlotChange(slot.id, "startTime", DEFAULT_TIMES[p].start);
                                handleSlotChange(slot.id, "endTime", DEFAULT_TIMES[p].end);
                              }
                            }}
                            style={{ padding: "0.4rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit", fontSize: "0.8rem" }}
                          >
                            {PERIODS.map(p => (
                              <option key={p} value={p}>P{p}</option>
                            ))}
                          </select>
                        </td>

                        {/* Subject */}
                        <td style={{ padding: "0.5rem 1rem" }}>
                          {slot.isBreak ? (
                            <span style={{ fontSize: "0.85rem", fontStyle: "italic", color: "var(--text-secondary)" }}>
                              Break / Lunch Recess
                            </span>
                          ) : (
                            <select
                              value={slot.subjectId}
                              onChange={(e) => handleSlotChange(slot.id, "subjectId", e.target.value)}
                              style={{ width: "100%", padding: "0.4rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit", fontSize: "0.85rem" }}
                            >
                              <option value="">-- Choose Subject --</option>
                              {availableSubjects.map(sub => (
                                <option key={sub.id} value={sub.id}>{sub.name}</option>
                              ))}
                            </select>
                          )}
                        </td>

                        {/* Time Start & End */}
                        <td style={{ padding: "0.5rem 0.5rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <input
                              type="time"
                              value={slot.startTime}
                              onChange={(e) => handleSlotChange(slot.id, "startTime", e.target.value)}
                              style={{ width: "70px", padding: "0.3rem", borderRadius: "4px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", fontSize: "0.78rem" }}
                            />
                            <span>–</span>
                            <input
                              type="time"
                              value={slot.endTime}
                              onChange={(e) => handleSlotChange(slot.id, "endTime", e.target.value)}
                              style={{ width: "70px", padding: "0.3rem", borderRadius: "4px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", fontSize: "0.78rem" }}
                            />
                          </div>
                        </td>

                        {/* Classroom */}
                        <td style={{ padding: "0.5rem 0.5rem" }}>
                          <input
                            type="text"
                            placeholder="Room"
                            value={slot.classroom}
                            onChange={(e) => handleSlotChange(slot.id, "classroom", e.target.value)}
                            style={{ width: "100%", padding: "0.35rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", fontSize: "0.8rem" }}
                          />
                        </td>

                        {/* Is Break */}
                        <td style={{ padding: "0.5rem 0.5rem", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={slot.isBreak}
                            onChange={(e) => handleSlotChange(slot.id, "isBreak", e.target.checked)}
                            style={{ width: "1rem", height: "1rem", cursor: "pointer" }}
                          />
                        </td>

                        {/* Delete Slot */}
                        <td style={{ padding: "0.5rem 0.5rem", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteSlot(slot.id)}
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--danger)", padding: "0.25rem" }}
                            title="Remove slot"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            {scannedSlots.length > 0 && (
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Ready to apply <strong>{scannedSlots.length} slots</strong> to <strong>{selectedClassName}</strong>.
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: "0.65rem 1.25rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "0.875rem"
              }}
            >
              Cancel
            </button>

            {scannedSlots.length > 0 && (
              <button
                type="button"
                onClick={handleSaveToTimetable}
                disabled={isSaving}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.65rem 1.75rem",
                  borderRadius: "8px",
                  border: "none",
                  background: "var(--primary)",
                  color: "var(--primary-fg)",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  boxShadow: "0 4px 14px rgba(99, 102, 241, 0.3)"
                }}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    <span>Updating Timetable...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Update Timetable</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

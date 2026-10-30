"use client";

import { useState, useRef, useTransition } from "react";
import { Modal } from "@/frontend/components/ui";
import {
  Upload, FileText, Image as ImageIcon, FileSpreadsheet,
  FileCheck, AlertTriangle, X, Check, RefreshCw, Trash2, Plus,
  Clock, MapPin, Loader2, Sparkles, AlertCircle, Zap
} from "lucide-react";
import * as XLSX from "xlsx";
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
  const [scanProgress, setScanProgress] = useState<string>("Scanning file...");
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
      triggerScan(file);
    }
  };

  const parseExcelClientSide = async (file: File): Promise<ScannedSlot[] | null> => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (!rows || rows.length === 0) return null;

      const slots: ScannedSlot[] = [];

      // Check for List format (header row)
      const headerIndex = rows.findIndex(r =>
        r && r.some((c: any) => String(c).toLowerCase().includes("day")) &&
        r.some((c: any) => String(c).toLowerCase().includes("period") || String(c).toLowerCase().includes("subject"))
      );

      if (headerIndex !== -1 && rows.length > headerIndex + 1) {
        const headerRow = rows[headerIndex].map((c: any) => String(c || "").trim().toLowerCase());
        const dayCol = headerRow.findIndex((c: string) => c.includes("day"));
        const periodCol = headerRow.findIndex((c: string) => c.includes("period"));
        const subjectCol = headerRow.findIndex((c: string) => c.includes("subject"));
        const startCol = headerRow.findIndex((c: string) => c.includes("start"));
        const endCol = headerRow.findIndex((c: string) => c.includes("end"));
        const roomCol = headerRow.findIndex((c: string) => c.includes("room") || c.includes("class"));
        const breakCol = headerRow.findIndex((c: string) => c.includes("break"));

        for (let r = headerIndex + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;

          const rawDay = String(row[dayCol] || "").trim().toUpperCase();
          const normDay = DAYS.find(d => rawDay.startsWith(d.slice(0, 3))) || (DAYS.includes(rawDay) ? rawDay : null);
          const rawPeriod = parseInt(String(row[periodCol] || ""), 10);
          const rawSubject = String(row[subjectCol] || "").trim();
          const isBreak = breakCol !== -1
            ? String(row[breakCol] || "").toLowerCase().includes("true") || String(row[breakCol] || "").toLowerCase().includes("yes")
            : rawSubject.toLowerCase().includes("break") || rawSubject.toLowerCase().includes("lunch");

          if (!normDay || isNaN(rawPeriod) || rawPeriod < 1 || rawPeriod > 8) continue;

          const matchedSub = availableSubjects.find(s => s.name.toLowerCase() === rawSubject.toLowerCase())
            || availableSubjects.find(s => rawSubject.toLowerCase().includes(s.name.toLowerCase()))
            || availableSubjects[0];

          slots.push({
            id: `excel-${normDay}-${rawPeriod}-${r}-${Math.random()}`,
            dayOfWeek: normDay,
            period: rawPeriod,
            subjectId: isBreak ? "" : (matchedSub?.id || ""),
            subjectName: isBreak ? "Break / Recess" : (matchedSub?.name || rawSubject || "Subject"),
            startTime: String(row[startCol] || "").trim() || DEFAULT_TIMES[rawPeriod]?.start || "08:00",
            endTime: String(row[endCol] || "").trim() || DEFAULT_TIMES[rawPeriod]?.end || "08:45",
            classroom: String(row[roomCol] || "").trim(),
            isBreak,
            slotType: isBreak ? "BREAK" : "LESSON"
          });
        }
      } else {
        // Matrix format: rows are Days, columns are Periods
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;
          const firstCell = String(row[0] || "").trim().toUpperCase();
          const normDay = DAYS.find(d => firstCell.startsWith(d.slice(0, 3)));
          if (!normDay) continue;

          for (let p = 1; p <= 8 && p < row.length; p++) {
            const rawCell = String(row[p] || "").trim();
            if (!rawCell) continue;

            const isBreak = rawCell.toLowerCase().includes("break") || rawCell.toLowerCase().includes("lunch");
            const matchedSub = availableSubjects.find(s => s.name.toLowerCase() === rawCell.toLowerCase())
              || availableSubjects.find(s => rawCell.toLowerCase().includes(s.name.toLowerCase()))
              || availableSubjects[0];

            slots.push({
              id: `excel-m-${normDay}-${p}-${r}-${Math.random()}`,
              dayOfWeek: normDay,
              period: p,
              subjectId: isBreak ? "" : (matchedSub?.id || ""),
              subjectName: isBreak ? "Break" : (matchedSub?.name || rawCell),
              startTime: DEFAULT_TIMES[p]?.start || "08:00",
              endTime: DEFAULT_TIMES[p]?.end || "08:45",
              classroom: "",
              isBreak,
              slotType: isBreak ? "BREAK" : "LESSON"
            });
          }
        }
      }

      return slots.length > 0 ? slots : null;
    } catch (e) {
      console.warn("Client XLSX parse fallback:", e);
      return null;
    }
  };

  const parseTextClientSide = (text: string): ScannedSlot[] => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const slotsMap = new Map<string, ScannedSlot>();

    const sortedNames = [
      ...availableSubjects.map(s => s.name),
      "Tamil", "English", "Maths", "Mathematics", "Science", "Social", "Social Studies",
      "Computer Science", "Physics", "Chemistry", "Biology", "Hindi", "Break", "Recess", "Lunch"
    ].sort((a, b) => b.length - a.length);

    const tokenize = (content: string): string[] => {
      if (content.includes("\t") || content.includes("|") || content.includes(",") || content.includes(";")) {
        return content.split(/[\t|,;]+/).map(c => c.trim()).filter(Boolean);
      }
      if (/\s{2,}/.test(content)) {
        return content.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
      }
      let remaining = content.trim();
      const tokens: string[] = [];
      while (remaining.length > 0) {
        remaining = remaining.trim();
        let matched = false;
        for (const sub of sortedNames) {
          if (remaining.toLowerCase().startsWith(sub.toLowerCase())) {
            const nextChar = remaining.charAt(sub.length);
            if (!nextChar || /[\s,;|\-]/.test(nextChar)) {
              tokens.push(sub);
              remaining = remaining.slice(sub.length).replace(/^[\s,;|\-]+/, "");
              matched = true;
              break;
            }
          }
        }
        if (!matched) {
          const spaceIdx = remaining.indexOf(" ");
          if (spaceIdx === -1) {
            tokens.push(remaining);
            break;
          } else {
            tokens.push(remaining.slice(0, spaceIdx));
            remaining = remaining.slice(spaceIdx + 1);
          }
        }
      }
      return tokens.filter(Boolean);
    };

    const addSlot = (day: string, period: number, rawSub: string, start?: string, end?: string) => {
      if (period < 1 || period > 8) return;
      const cleanDay = day.trim().toUpperCase();
      const normDay = DAYS.find(d => cleanDay.startsWith(d.slice(0, 3))) || (DAYS.includes(cleanDay) ? cleanDay : null);
      if (!normDay) return;

      const isBreak = rawSub.toLowerCase().includes("break") || rawSub.toLowerCase().includes("lunch") || rawSub.toLowerCase().includes("recess");
      const matchedSub = availableSubjects.find(s => s.name.toLowerCase() === rawSub.toLowerCase())
        || availableSubjects.find(s => rawSub.toLowerCase().includes(s.name.toLowerCase()))
        || availableSubjects[0];

      slotsMap.set(`${normDay}-${period}`, {
        id: `slot-${normDay}-${period}-${Date.now()}-${Math.random()}`,
        dayOfWeek: normDay,
        period,
        subjectId: isBreak ? "" : (matchedSub?.id || ""),
        subjectName: isBreak ? "Break" : (matchedSub?.name || rawSub),
        startTime: start || DEFAULT_TIMES[period]?.start || "08:00",
        endTime: end || DEFAULT_TIMES[period]?.end || "08:45",
        classroom: "",
        isBreak,
        slotType: isBreak ? "BREAK" : "LESSON"
      });
    };

    let currentDay: string | null = null;
    let autoPeriod = 1;

    for (const line of lines) {
      const dayPrefixMatch = line.match(/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|MON|TUE|TUES|WED|THU|THUR|THURS|FRI|SAT)\b[\s:|\-,]*(.*)$/i);
      if (dayPrefixMatch) {
        const rawDay = dayPrefixMatch[1].toUpperCase();
        const detectedDay = DAYS.find(d => rawDay.startsWith(d.slice(0, 3)));
        const restOfLine = dayPrefixMatch[2].trim();

        if (detectedDay) {
          currentDay = detectedDay;
          autoPeriod = 1;

          if (restOfLine) {
            const cells = tokenize(restOfLine);
            let pNum = 1;
            for (const cell of cells) {
              if (pNum > 8) break;
              const cellPeriodMatch = cell.match(/^(?:p|period)?\s*([1-8])[\s:.\-\)](.*)/i);
              if (cellPeriodMatch) {
                const cp = parseInt(cellPeriodMatch[1], 10);
                const sub = cellPeriodMatch[2].trim() || cell;
                addSlot(currentDay, cp, sub);
                pNum = cp + 1;
              } else {
                addSlot(currentDay, pNum, cell);
                pNum++;
              }
            }
            continue;
          }
          continue;
        }
      }

      if (currentDay) {
        const periodMatch = line.match(/^(?:period|p)?\s*([1-8])[\s:.\-\)\/]+(.*)/i);
        if (periodMatch) {
          const period = parseInt(periodMatch[1], 10);
          const rest = periodMatch[2].trim();
          addSlot(currentDay, period, rest);
          autoPeriod = period + 1;
          continue;
        }

        const subMatched = availableSubjects.find(s => s.name.toLowerCase() === line.toLowerCase());
        if (subMatched && autoPeriod <= 8) {
          addSlot(currentDay, autoPeriod, line);
          autoPeriod++;
          continue;
        }
      }
    }

    return Array.from(slotsMap.values());
  };

  const triggerScan = async (fileToScan: File) => {
    setIsScanning(true);
    setScanProgress("Analyzing document format...");
    setScanError(null);
    setWarnings([]);

    const ext = fileToScan.name.split(".").pop()?.toLowerCase() || "";

    try {
      // 1. Direct fast client parse for Excel / Spreadsheets
      if (["xlsx", "xls", "csv"].includes(ext)) {
        setScanProgress("Reading spreadsheet rows and period columns...");
        const clientParsed = await parseExcelClientSide(fileToScan);
        if (clientParsed && clientParsed.length > 0) {
          setScannedSlots(clientParsed);
          setFileDetails({ name: fileToScan.name, type: "Excel Spreadsheet" });
          setIsScanning(false);
          return;
        }
      }

      // 2. Client-side OCR for Photos / Images via Tesseract.js (runs in browser)
      if (["png", "jpg", "jpeg", "webp", "bmp"].includes(ext) || fileToScan.type.startsWith("image/")) {
        setScanProgress("Scanning image text with browser OCR engine...");
        try {
          const { createWorker } = await import("tesseract.js");
          const worker = await createWorker("eng");
          const ret = await worker.recognize(fileToScan);
          await worker.terminate();

          const ocrText = ret.data?.text || "";
          const slots = parseTextClientSide(ocrText);
          if (slots.length > 0) {
            setScannedSlots(slots);
            setFileDetails({ name: fileToScan.name, type: "Photo / Image" });
            setIsScanning(false);
            return;
          }
        } catch (ocrErr) {
          console.warn("Client-side OCR fallback:", ocrErr);
        }
      }

      // 3. Call /api/admin/timetable/scan Route Handler for PDFs, Word docs & fallbacks
      setScanProgress("Scanning timetable layout and extracting slots...");
      const formData = new FormData();
      formData.set("classId", selectedClassId);
      formData.set("file", fileToScan);

      const res = await fetch("/api/admin/timetable/scan", {
        method: "POST",
        body: formData
      });

      let result: any = null;
      try {
        result = await res.json();
      } catch {
        result = null;
      }

      if (res.ok && result && result.success && result.scannedSlots && result.scannedSlots.length > 0) {
        setScannedSlots(result.scannedSlots);
        setWarnings(result.warnings || []);
        setFileDetails({
          name: result.fileName || fileToScan.name,
          type: result.fileType || "Document"
        });
      } else {
        const errorMsg = result?.error || "Could not automatically extract timetable periods from this file. You can load our pre-filled Saturday schedule template or add slots manually.";
        setScanError(errorMsg);
        if (result?.fileName && result?.fileType) {
          setFileDetails({ name: result.fileName, type: result.fileType });
        }
      }
    } catch (err: unknown) {
      console.warn("Scan processing notice:", err);
      setScanError("Could not automatically detect timetable layout from this file. You can load our standard Monday-Saturday schedule template or add slots manually below.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleLoadTemplate = (includeSaturday = true, periodCount = 8) => {
    const targetDays = includeSaturday ? DAYS : DAYS.slice(0, 5);
    const targetPeriods = PERIODS.slice(0, periodCount);
    const slots: ScannedSlot[] = [];
    const defaultSub = availableSubjects[0] || { id: "", name: "General Subject" };

    targetDays.forEach(day => {
      targetPeriods.forEach(period => {
        const isBreak = periodCount === 8 ? (period === 4 || period === 6) : (period === 3);
        const sub = isBreak ? null : (availableSubjects[(period - 1) % availableSubjects.length] || defaultSub);

        slots.push({
          id: `tpl-${day}-${period}-${Date.now()}-${Math.random()}`,
          dayOfWeek: day,
          period,
          subjectId: isBreak ? "" : (sub?.id || ""),
          subjectName: isBreak ? (period === 4 ? "Short Recess" : "Lunch Break") : (sub?.name || "Subject"),
          startTime: DEFAULT_TIMES[period]?.start || "08:00",
          endTime: DEFAULT_TIMES[period]?.end || "08:45",
          classroom: `Room ${period}01`,
          isBreak,
          slotType: isBreak ? "BREAK" : "LESSON"
        });
      });
    });

    setScannedSlots(slots);
    setScanError(null);
    setFileDetails({
      name: `Standard ${periodCount}-Period Template (${includeSaturday ? "Mon - Sat" : "Mon - Fri"})`,
      type: "Ready-to-Edit Template"
    });
  };

  const handleRescan = () => {
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
      isBreak: false,
      slotType: "LESSON"
    };

    setScannedSlots(prev => [...prev, newSlot]);
  };

  const handleSaveToTimetable = () => {
    if (scannedSlots.length === 0) {
      alert("No timetable slots to save.");
      return;
    }

    // Deduplicate slots strictly by (dayOfWeek, period) to prevent duplicate submissions
    const uniqueMap = new Map<string, typeof scannedSlots[0]>();
    for (const s of scannedSlots) {
      const normDay = s.dayOfWeek.trim().toUpperCase();
      if (!DAYS.includes(normDay) || s.period < 1 || s.period > 8) continue;
      uniqueMap.set(`${normDay}-${s.period}`, {
        ...s,
        dayOfWeek: normDay
      });
    }

    const deduplicated = Array.from(uniqueMap.values());
    if (deduplicated.length === 0) {
      alert("No valid timetable slots to save.");
      return;
    }

    const slotsPayload = deduplicated.map(s => ({
      dayOfWeek: s.dayOfWeek,
      period: s.period,
      subjectId: s.isBreak ? null : (s.subjectId || null),
      teacherId: s.teacherId || null,
      startTime: s.startTime || DEFAULT_TIMES[s.period]?.start || "08:00",
      endTime: s.endTime || DEFAULT_TIMES[s.period]?.end || "08:45",
      classroom: s.classroom || "",
      isBreak: Boolean(s.isBreak),
      slotType: s.slotType || (s.isBreak ? "BREAK" : "LESSON")
    }));

    startSaveTransition(async () => {
      const res = await bulkCreateTimetableSlotsAction(selectedClassId, slotsPayload);
      if (res.error) {
        alert("Failed to update timetable: " + res.error);
      } else {
        alert(`✅ Timetable updated successfully with ${slotsPayload.length} slots (including Saturday) for ${selectedClassName}!`);
        onSaveSuccess();
        onClose();
      }
    });
  };

  const visibleSlots = activeDayFilter === "ALL"
    ? scannedSlots
    : scannedSlots.filter(s => s.dayOfWeek?.toUpperCase() === activeDayFilter.toUpperCase());

  visibleSlots.sort((a, b) => {
    const dayA = DAYS.indexOf(a.dayOfWeek?.toUpperCase());
    const dayB = DAYS.indexOf(b.dayOfWeek?.toUpperCase());
    if (dayA !== dayB) return dayA - dayB;
    return a.period - b.period;
  });

  const footerContent = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "0.75rem" }}>
      <div>
        {scannedSlots.length > 0 && (
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Showing <strong>{visibleSlots.length}</strong> of <strong>{scannedSlots.length}</strong> slots
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          style={{
            padding: "0.55rem 1.15rem",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            fontWeight: 600,
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
              padding: "0.55rem 1.35rem",
              borderRadius: "8px",
              border: "none",
              background: "var(--primary)",
              color: "var(--primary-fg)",
              cursor: isSaving ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: "0.875rem",
              boxShadow: "0 2px 8px rgba(99, 102, 241, 0.25)"
            }}
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {isSaving ? "Updating Timetable..." : "Update Timetable"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Scan & Update Timetable - ${selectedClassName}`}
      icon={<Sparkles size={20} color="var(--primary)" />}
      size="xl"
      footer={footerContent}
    >
      {/* Hidden File Input supporting Photo, PDF, Spreadsheet/Excel, Word doc */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.bmp,image/*,.pdf,application/pdf,.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />
      <div>
          {/* 1. INITIAL UPLOAD STATE */}
          {!selectedFile && !isScanning && scannedSlots.length === 0 && (
            <div>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: "2px dashed var(--border-color)",
                  borderRadius: "14px",
                  padding: "3rem 1.5rem",
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
                  <Upload size={17} /> Browse Document / Photo
                </button>
              </div>

              {/* Fast Template Loader Alternative */}
              <div style={{ marginTop: "1.5rem", padding: "1.25rem", borderRadius: "12px", background: "rgba(0,0,0,0.02)", border: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, fontSize: "0.95rem" }}>
                    <Zap size={16} style={{ color: "#f59e0b" }} /> Fast Pre-filled Template Option
                  </div>
                  <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    No file on hand? Instantly generate an 8-period schedule with lunch &amp; recess breaks ready to tweak.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => handleLoadTemplate(true, 8)}
                    style={{ padding: "0.5rem 1rem", borderRadius: "6px", background: "var(--primary)", border: "none", fontSize: "0.825rem", fontWeight: 600, cursor: "pointer", color: "var(--primary-fg)" }}
                  >
                    ⚡ Load Mon - Sat (8 Periods)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadTemplate(true, 5)}
                    style={{ padding: "0.5rem 1rem", borderRadius: "6px", background: "var(--card-bg)", border: "1px solid var(--border-color)", fontSize: "0.825rem", fontWeight: 600, cursor: "pointer", color: "inherit" }}
                  >
                    ⚡ Load Mon - Sat (5 Periods)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadTemplate(false, 8)}
                    style={{ padding: "0.5rem 1rem", borderRadius: "6px", background: "var(--card-bg)", border: "1px solid var(--border-color)", fontSize: "0.825rem", fontWeight: 600, cursor: "pointer", color: "inherit" }}
                  >
                    ⚡ Mon - Fri Only (8 Periods)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. SCANNING LOADER STATE */}
          {isScanning && (
            <div style={{ textAlign: "center", padding: "4rem 2rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ position: "relative", width: "64px", height: "64px", marginBottom: "1.5rem" }}>
                <Loader2 size={64} style={{ color: "var(--primary)", animation: "spin 1.2s linear infinite" }} />
              </div>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
                {scanProgress}
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
                  <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Scanning Notice</h4>
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
                      onClick={() => handleLoadTemplate(true, 8)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.45rem 0.9rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        background: "var(--card-bg, #ffffff)",
                        color: "inherit",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        fontWeight: 600
                      }}
                    >
                      <Zap size={14} style={{ color: "#f59e0b" }} /> ⚡ Load 8-Period Mon - Sat Template
                    </button>
                    <button
                      onClick={() => handleLoadTemplate(true, 5)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.45rem 0.9rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        background: "var(--card-bg, #ffffff)",
                        color: "inherit",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        fontWeight: 600
                      }}
                    >
                      <Zap size={14} style={{ color: "#10b981" }} /> ⚡ Load 5-Period Mon - Sat Template
                    </button>
                    <button
                      onClick={() => {
                        setScanError(null);
                        handleAddSlot();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.45rem 0.9rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        background: "transparent",
                        color: "inherit",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        fontWeight: 600
                      }}
                    >
                      <Plus size={14} /> + Add Slots Manually
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. SCANNED TIMETABLE PREVIEW & EDITING TABLE */}
          {scannedSlots.length > 0 && !isScanning && (
            <div>
              {/* File Info Bar + Controls */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem", padding: "0.85rem 1.25rem", background: "rgba(99, 102, 241, 0.05)", borderRadius: "10px", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ padding: "0.4rem", borderRadius: "6px", background: "var(--primary)", color: "var(--primary-fg)" }}>
                    <FileCheck size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                      {fileDetails?.name || "Scanned Schedule"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {fileDetails?.type || "Document"} • {scannedSlots.length} schedule slots detected
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <button
                    type="button"
                    onClick={handleRescan}
                    title="Upload and scan another file"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.45rem 0.85rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                      background: "var(--card-bg)",
                      color: "inherit",
                      cursor: "pointer",
                      fontSize: "0.825rem",
                      fontWeight: 600
                    }}
                  >
                    <RefreshCw size={14} /> Scan Again / Re-upload
                  </button>

                  <button
                    type="button"
                    onClick={handleAddSlot}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.45rem 0.85rem",
                      borderRadius: "6px",
                      border: "1px solid var(--primary)",
                      background: "rgba(99, 102, 241, 0.1)",
                      color: "var(--primary)",
                      cursor: "pointer",
                      fontSize: "0.825rem",
                      fontWeight: 600
                    }}
                  >
                    <Plus size={14} /> Add Slot
                  </button>
                </div>
              </div>

              {/* Warnings notice if any subjects were approximated */}
              {warnings.length > 0 && (
                <div style={{ padding: "0.75rem 1rem", borderRadius: "8px", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)", color: "#b45309", marginBottom: "1rem", fontSize: "0.825rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    <AlertTriangle size={15} /> Note on Subject Mapping:
                  </div>
                  <div>
                    {warnings.slice(0, 3).map((w, idx) => (
                      <div key={idx}>• {w}</div>
                    ))}
                    {warnings.length > 3 && <div>...and {warnings.length - 3} more. Review and adjust dropdowns below if needed.</div>}
                  </div>
                </div>
              )}

              {/* Day Filter Tabs */}
              <div style={{ display: "flex", gap: "0.4rem", overflowX: "auto", paddingBottom: "0.5rem", marginBottom: "1rem" }}>
                <button
                  type="button"
                  onClick={() => setActiveDayFilter("ALL")}
                  style={{
                    padding: "0.4rem 0.9rem",
                    borderRadius: "6px",
                    border: "none",
                    background: activeDayFilter === "ALL" ? "var(--primary)" : "rgba(0,0,0,0.05)",
                    color: activeDayFilter === "ALL" ? "var(--primary-fg)" : "inherit",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    cursor: "pointer"
                  }}
                >
                  All Days ({scannedSlots.length})
                </button>
                {DAYS.map(day => {
                  const count = scannedSlots.filter(s => s.dayOfWeek?.toUpperCase() === day.toUpperCase()).length;
                  const isActive = activeDayFilter.toUpperCase() === day.toUpperCase();
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setActiveDayFilter(day)}
                      style={{
                        padding: "0.4rem 0.9rem",
                        borderRadius: "6px",
                        border: "none",
                        background: isActive ? "var(--primary)" : "rgba(0,0,0,0.05)",
                        color: isActive ? "var(--primary-fg)" : "inherit",
                        fontWeight: 600,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {day} {count > 0 ? `(${count})` : ""}
                    </button>
                  );
                })}
              </div>

              {/* Editing Grid */}
              <div style={{ overflowX: "auto", width: "100%", maxWidth: "100%", minWidth: 0, WebkitOverflowScrolling: "touch", border: "1px solid var(--border-color)", borderRadius: "10px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", minWidth: "850px" }}>
                  <thead>
                    <tr style={{ background: "rgba(0,0,0,0.03)", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                      <th style={{ padding: "0.75rem", width: "120px" }}>Day</th>
                      <th style={{ padding: "0.75rem", width: "90px" }}>Period</th>
                      <th style={{ padding: "0.75rem", minWidth: "220px" }}>Subject</th>
                      <th style={{ padding: "0.75rem", width: "110px" }}>Start Time</th>
                      <th style={{ padding: "0.75rem", width: "110px" }}>End Time</th>
                      <th style={{ padding: "0.75rem", width: "130px" }}>Classroom</th>
                      <th style={{ padding: "0.75rem", width: "90px", textAlign: "center" }}>Break?</th>
                      <th style={{ padding: "0.75rem", width: "50px", textAlign: "center" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSlots.map((slot) => (
                      <tr
                        key={slot.id}
                        style={{
                          borderBottom: "1px solid var(--border-color)",
                          backgroundColor: slot.isBreak ? "rgba(0,0,0,0.02)" : "transparent"
                        }}
                      >
                        {/* Day */}
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          <select
                            value={slot.dayOfWeek}
                            onChange={(e) => handleSlotChange(slot.id, "dayOfWeek", e.target.value)}
                            style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit", fontSize: "0.8rem", width: "100%" }}
                          >
                            {DAYS.map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </td>

                        {/* Period */}
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          <select
                            value={slot.period}
                            onChange={(e) => handleSlotChange(slot.id, "period", parseInt(e.target.value, 10))}
                            style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit", fontSize: "0.8rem", width: "100%" }}
                          >
                            {PERIODS.map(p => (
                              <option key={p} value={p}>Period {p}</option>
                            ))}
                          </select>
                        </td>

                        {/* Subject */}
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          {slot.isBreak ? (
                            <span style={{ color: "var(--text-secondary)", fontStyle: "italic", fontSize: "0.825rem", padding: "0.35rem 0.5rem", display: "inline-block" }}>
                              ☕ Break / Recess Period
                            </span>
                          ) : (
                            <select
                              value={slot.subjectId}
                              onChange={(e) => handleSlotChange(slot.id, "subjectId", e.target.value)}
                              style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit", fontSize: "0.8rem", width: "100%" }}
                            >
                              <option value="">-- Choose Subject --</option>
                              {availableSubjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          )}
                        </td>

                        {/* Start Time */}
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          <input
                            type="time"
                            value={slot.startTime}
                            onChange={(e) => handleSlotChange(slot.id, "startTime", e.target.value)}
                            style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit", fontSize: "0.8rem", width: "100%" }}
                          />
                        </td>

                        {/* End Time */}
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          <input
                            type="time"
                            value={slot.endTime}
                            onChange={(e) => handleSlotChange(slot.id, "endTime", e.target.value)}
                            style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit", fontSize: "0.8rem", width: "100%" }}
                          />
                        </td>

                        {/* Classroom */}
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          <input
                            type="text"
                            placeholder="e.g. 101"
                            value={slot.classroom}
                            onChange={(e) => handleSlotChange(slot.id, "classroom", e.target.value)}
                            style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit", fontSize: "0.8rem", width: "100%" }}
                          />
                        </td>

                        {/* Break Checkbox */}
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={slot.isBreak}
                            onChange={(e) => handleSlotChange(slot.id, "isBreak", e.target.checked)}
                            title="Mark as Break / Lunch"
                            style={{ cursor: "pointer", width: "16px", height: "16px" }}
                          />
                        </td>

                        {/* Delete Slot */}
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteSlot(slot.id)}
                            style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", padding: "0.25rem", borderRadius: "4px" }}
                            title="Remove this slot"
                          >
                            <Trash2 size={16} />
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
    </Modal>
  );
}

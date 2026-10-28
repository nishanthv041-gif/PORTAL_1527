"use client";

import type { TeacherClass, HistoryItem } from "./TeacherReportCardsClient";
import ReportCardDocumentStudio from "./ReportCardDocumentStudio";

interface ReportCardDocumentScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: TeacherClass[];
  selectedClassId: string;
  onReportCardCreated: (newCard: HistoryItem, recipients: string[]) => void;
}

export default function ReportCardDocumentScanModal({
  isOpen,
  onClose,
  classes,
  selectedClassId,
  onReportCardCreated
}: ReportCardDocumentScanModalProps) {
  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(0.25rem, 1.5vw, 1rem)",
        overflowY: "auto",
        width: "100vw",
        maxWidth: "100%",
        boxSizing: "border-box"
      }}
    >
      <div style={{
        background: "var(--card-bg, #1e293b)",
        border: "1.5px solid var(--border-color, #334155)",
        borderRadius: "clamp(12px, 2vw, 20px)",
        width: "100%",
        maxWidth: "1150px",
        maxHeight: "96vh",
        overflowY: "auto",
        overflowX: "hidden",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        padding: "clamp(0.75rem, 2vw, 1.5rem)",
        boxSizing: "border-box"
      }}>
        <ReportCardDocumentStudio
          classes={classes}
          selectedClassId={selectedClassId}
          onReportCardCreated={onReportCardCreated}
          onCloseModal={onClose}
          isModalView={true}
        />
      </div>
    </div>
  );
}

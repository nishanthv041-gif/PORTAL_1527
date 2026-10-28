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
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(15, 23, 42, 0.8)",
      backdropFilter: "blur(8px)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
      overflowY: "auto"
    }}>
      <div style={{
        background: "var(--card-bg, #1e293b)",
        border: "1.5px solid var(--border-color, #334155)",
        borderRadius: "20px",
        width: "100%",
        maxWidth: "1150px",
        maxHeight: "92vh",
        overflowY: "auto",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        padding: "1.5rem"
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

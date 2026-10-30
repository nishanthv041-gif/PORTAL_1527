"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/frontend/components/ui";
import { 
  X, Check, AlertTriangle, ArrowRight, Loader2, Sparkles, 
  GraduationCap, Users, RefreshCw, ChevronDown, ChevronUp,
  ShieldCheck, AlertCircle
} from "lucide-react";
import { 
  simulateBatchPromotionAction, 
  executeBatchPromotionAction 
} from "@/backend/api/actions/dashboard/admin/batches/actions";
import { PromotionSimulationResult } from "@/backend/lib/services/batchPromotionEngine";

interface BatchItem {
  id: string;
  name: string;
  status: string;
  isCurrent: boolean;
}

interface PromotionWizardModalProps {
  batches: BatchItem[];
  currentBatch: BatchItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PromotionWizardModal({
  batches,
  currentBatch,
  onClose,
  onSuccess
}: PromotionWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceBatchId, setSourceBatchId] = useState<string>(currentBatch?.id || batches[0]?.id || "");
  const [targetBatchId, setTargetBatchId] = useState<string>("");
  const [terminalGrade, setTerminalGrade] = useState<number>(12);
  
  const [simulation, setSimulation] = useState<PromotionSimulationResult | null>(null);
  const [studentOverrides, setStudentOverrides] = useState<Record<string, "PROMOTE" | "GRADUATE" | "RETAIN" | "TRANSFER">>({});
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<{
    promotedCount: number;
    graduatedCount: number;
    retainedCount: number;
    transferredCount: number;
  } | null>(null);

  // Available candidate target batches (excluding source batch)
  const availableTargetBatches = batches.filter(b => b.id !== sourceBatchId);

  // Step 1: Simulate Promotion
  const handleSimulate = () => {
    if (!sourceBatchId || !targetBatchId) {
      setError("Please select both a Source Batch and a Target Batch.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const res = await simulateBatchPromotionAction(sourceBatchId, targetBatchId, terminalGrade);
      if (res.success && res.simulation) {
        setSimulation(res.simulation);
        // Pre-fill default overrides
        const initialOverrides: Record<string, "PROMOTE" | "GRADUATE" | "RETAIN" | "TRANSFER"> = {};
        res.simulation.classMappings.forEach(mapping => {
          mapping.students.forEach(s => {
            initialOverrides[s.id] = s.defaultAction;
          });
        });
        setStudentOverrides(initialOverrides);
        setStep(2);
      } else {
        setError(res.error || "Failed to generate promotion simulation.");
      }
    });
  };

  // Toggle class expand/collapse in review
  const toggleClassExpand = (classId: string) => {
    setExpandedClasses(prev => ({
      ...prev,
      [classId]: !prev[classId]
    }));
  };

  // Set individual student override
  const handleSetStudentAction = (studentId: string, action: "PROMOTE" | "GRADUATE" | "RETAIN" | "TRANSFER") => {
    setStudentOverrides(prev => ({
      ...prev,
      [studentId]: action
    }));
  };

  // Step 3: Execute Promotion Transaction
  const handleExecute = () => {
    setError(null);
    startTransition(async () => {
      const res = await executeBatchPromotionAction({
        sourceBatchId,
        targetBatchId,
        studentOverrides,
        terminalGrade
      });

      if (res.success && res.result) {
        setExecutionResult(res.result);
        setStep(3);
      } else {
        setError(res.error || "Failed to execute batch promotion.");
      }
    });
  };

  // Recalculate summary totals considering student overrides
  const effectiveTotals = simulation ? (() => {
    let promote = 0;
    let graduate = 0;
    let retain = 0;
    let transfer = 0;

    simulation.classMappings.forEach(m => {
      m.students.forEach(s => {
        const act = studentOverrides[s.id] || s.defaultAction;
        if (act === "PROMOTE") promote++;
        else if (act === "GRADUATE") graduate++;
        else if (act === "RETAIN") retain++;
        else if (act === "TRANSFER") transfer++;
      });
    });

    return { promote, graduate, retain, transfer, total: simulation.totalStudents };
  })() : null;

  const footerContent = (
    <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
      {step === 1 && (
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: "0.55rem 1.15rem",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              backgroundColor: "transparent",
              color: "var(--foreground)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSimulate}
            disabled={isPending || !sourceBatchId || !targetBatchId}
            style={{
              padding: "0.55rem 1.35rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "var(--primary, #6366f1)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              boxShadow: "0 2px 6px rgba(99, 102, 241, 0.3)"
            }}
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            Generate Promotion Preview
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={isPending}
            style={{
              padding: "0.55rem 1.15rem",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              backgroundColor: "transparent",
              color: "var(--foreground)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer"
            }}
          >
            Back to Selection
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={isPending}
            style={{
              padding: "0.55rem 1.5rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#10b981",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              boxShadow: "0 2px 8px rgba(16, 185, 129, 0.4)"
            }}
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            Confirm &amp; Execute ({effectiveTotals?.total} Students)
          </button>
        </>
      )}

      {step === 3 && (
        <button
          type="button"
          onClick={() => {
            onSuccess();
            onClose();
          }}
          style={{
            padding: "0.55rem 1.35rem",
            borderRadius: "8px",
            border: "none",
            backgroundColor: "var(--primary, #6366f1)",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer"
          }}
        >
          Done &amp; Return to Batches
        </button>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Batch Promotion & Rollover Wizard"
      icon={<GraduationCap size={22} color="#6366f1" />}
      size="xl"
      footer={footerContent}
    >

        {/* Wizard Step Progress Indicator */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "2rem",
          padding: "0.85rem 1.75rem",
          backgroundColor: "rgba(0, 0, 0, 0.15)",
          borderBottom: "1px solid var(--border-color, #374151)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              backgroundColor: step >= 1 ? "var(--primary, #6366f1)" : "rgba(255,255,255,0.1)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 700
            }}>1</span>
            <span style={{ fontSize: "0.8125rem", fontWeight: step === 1 ? 700 : 500, color: step === 1 ? "var(--foreground)" : "var(--text-secondary)" }}>
              Select Batches
            </span>
          </div>
          <ArrowRight size={14} color="var(--text-secondary)" />
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              backgroundColor: step >= 2 ? "var(--primary, #6366f1)" : "rgba(255,255,255,0.1)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 700
            }}>2</span>
            <span style={{ fontSize: "0.8125rem", fontWeight: step === 2 ? 700 : 500, color: step === 2 ? "var(--foreground)" : "var(--text-secondary)" }}>
              Review & Customize
            </span>
          </div>
          <ArrowRight size={14} color="var(--text-secondary)" />
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              backgroundColor: step === 3 ? "#10b981" : "rgba(255,255,255,0.1)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 700
            }}>3</span>
            <span style={{ fontSize: "0.8125rem", fontWeight: step === 3 ? 700 : 500, color: step === 3 ? "#10b981" : "var(--text-secondary)" }}>
              Rollover Complete
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            margin: "1rem 1.75rem 0",
            padding: "0.75rem 1rem",
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: "8px",
            color: "#ef4444",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 1: SELECT BATCHES & CONFIGURE */}
        {/* ======================================================== */}
        {step === 1 && (
          <div style={{ padding: "1.75rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: "1.25rem",
              padding: "1.5rem",
              backgroundColor: "rgba(0, 0, 0, 0.2)",
              border: "1px solid var(--border-color, #374151)",
              borderRadius: "14px"
            }}>
              {/* Source Batch Select */}
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--foreground)" }}>
                  Current Source Batch (From) *
                </label>
                <select
                  value={sourceBatchId}
                  onChange={(e) => setSourceBatchId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    borderRadius: "10px",
                    border: "1px solid var(--border-color, #374151)",
                    backgroundColor: "var(--card-bg, #1f2937)",
                    color: "var(--foreground)",
                    fontSize: "0.9375rem",
                    fontWeight: 600
                  }}
                >
                  <option value="">-- Select Source Batch --</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.isCurrent ? "★ (Active Session)" : ""}
                    </option>
                  ))}
                </select>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  The existing batch containing current classes to be promoted.
                </p>
              </div>

              {/* Arrow Icon */}
              <div style={{ display: "flex", justifyContent: "center", paddingTop: "0.5rem" }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(99, 102, 241, 0.2)",
                  color: "#6366f1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <ArrowRight size={18} />
                </div>
              </div>

              {/* Target Batch Select */}
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--foreground)" }}>
                  Target Batch (To) *
                </label>
                <select
                  value={targetBatchId}
                  onChange={(e) => setTargetBatchId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    borderRadius: "10px",
                    border: "1px solid var(--border-color, #374151)",
                    backgroundColor: "var(--card-bg, #1f2937)",
                    color: "var(--foreground)",
                    fontSize: "0.9375rem",
                    fontWeight: 600
                  }}
                >
                  <option value="">-- Select Target Batch --</option>
                  {availableTargetBatches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.status})
                    </option>
                  ))}
                </select>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  The new academic batch that students and incremented classes will advance to.
                </p>
              </div>
            </div>

            {/* Terminal Class Configuration */}
            <div style={{
              padding: "1.25rem 1.5rem",
              backgroundColor: "rgba(99, 102, 241, 0.05)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem"
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--foreground)" }}>
                  🎓 Final Graduation Class (Terminal Class)
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                  Students in this grade will be marked as <strong>Graduated Alumni</strong> rather than advancing to a higher grade.
                </div>
              </div>
              <div style={{ minWidth: "160px" }}>
                <select
                  value={terminalGrade}
                  onChange={(e) => setTerminalGrade(parseInt(e.target.value, 10))}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #374151)",
                    backgroundColor: "var(--card-bg, #1f2937)",
                    color: "var(--foreground)",
                    fontWeight: 600,
                    fontSize: "0.875rem"
                  }}
                >
                  <option value={12}>Class 12th / XII</option>
                  <option value={10}>Class 10th / X</option>
                  <option value={8}>Class 8th / VIII</option>
                  <option value={5}>Class 5th / V</option>
                </select>
              </div>
            </div>

            {/* Explanation card */}
            <div style={{
              display: "flex",
              gap: "0.75rem",
              padding: "1rem 1.25rem",
              backgroundColor: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              borderRadius: "10px",
              color: "var(--foreground)",
              fontSize: "0.8125rem"
            }}>
              <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>How the automated promotion works:</strong>
                <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.2rem", lineHeight: "1.5" }}>
                  <li>Every class is incremented by 1 level (e.g. <code>Class 1</code> ➔ <code>Class 2</code>, <code>Class V</code> ➔ <code>Class VI</code>).</li>
                  <li>Class 12th students are automatically assigned to <strong>Alumni / Graduated</strong> status.</li>
                  <li>In the next step, you can review every class and retain specific students if needed.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 2: PREVIEW & CUSTOMIZE CLASS & STUDENT MAPPING */}
        {/* ======================================================== */}
        {step === 2 && simulation && (
          <div style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Impact Metric Bar */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "0.75rem"
            }}>
              <div style={{ padding: "0.85rem", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 700 }}>Total Students</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 800, marginTop: "0.2rem" }}>{effectiveTotals?.total}</div>
              </div>
              <div style={{ padding: "0.85rem", borderRadius: "10px", backgroundColor: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
                <div style={{ fontSize: "0.75rem", color: "#10b981", textTransform: "uppercase", fontWeight: 700 }}>Advancing (+1 Class)</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#10b981", marginTop: "0.2rem" }}>{effectiveTotals?.promote}</div>
              </div>
              <div style={{ padding: "0.85rem", borderRadius: "10px", backgroundColor: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                <div style={{ fontSize: "0.75rem", color: "#f59e0b", textTransform: "uppercase", fontWeight: 700 }}>🎓 Graduating (Class 12)</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#f59e0b", marginTop: "0.2rem" }}>{effectiveTotals?.graduate}</div>
              </div>
              <div style={{ padding: "0.85rem", borderRadius: "10px", backgroundColor: "rgba(139, 92, 246, 0.08)", border: "1px solid rgba(139, 92, 246, 0.25)" }}>
                <div style={{ fontSize: "0.75rem", color: "#8b5cf6", textTransform: "uppercase", fontWeight: 700 }}>Retained (Repeat)</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#8b5cf6", marginTop: "0.2rem" }}>{effectiveTotals?.retain}</div>
              </div>
            </div>

            {/* Class Promotion Map List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--foreground)" }}>
                Class Advancement Mapping ({simulation.classMappings.length} classes):
              </div>

              {simulation.classMappings.map((mapping) => {
                const isExpanded = !!expandedClasses[mapping.sourceClassId];
                const isGraduatingClass = mapping.isTerminalClass;

                return (
                  <div
                    key={mapping.sourceClassId}
                    style={{
                      borderRadius: "12px",
                      border: `1px solid ${isGraduatingClass ? "rgba(245, 158, 11, 0.3)" : "var(--border-color, #374151)"}`,
                      backgroundColor: isGraduatingClass ? "rgba(245, 158, 11, 0.03)" : "rgba(255, 255, 255, 0.02)",
                      overflow: "hidden"
                    }}
                  >
                    {/* Class Row Header */}
                    <div
                      style={{
                        padding: "1rem 1.25rem",
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "1rem",
                        cursor: "pointer"
                      }}
                      onClick={() => toggleClassExpand(mapping.sourceClassId)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--foreground)" }}>
                          {mapping.sourceClassName} - Section {mapping.sourceSection}
                        </div>
                        <ArrowRight size={16} color="var(--text-secondary)" />
                        <div style={{
                          fontWeight: 700,
                          fontSize: "0.9375rem",
                          color: isGraduatingClass ? "#f59e0b" : "#10b981",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem"
                        }}>
                          {isGraduatingClass ? <GraduationCap size={16} /> : null}
                          {isGraduatingClass ? "GRADUATED (ALUMNI)" : `${mapping.targetClassName} - ${mapping.targetSection}`}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <span style={{
                          padding: "0.2rem 0.6rem",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          backgroundColor: isGraduatingClass ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)",
                          color: isGraduatingClass ? "#f59e0b" : "#10b981"
                        }}>
                          {mapping.studentCount} Student{mapping.studentCount === 1 ? "" : "s"}
                        </span>
                        <button
                          type="button"
                          style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
                        >
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* Drill-down: Student Exceptions List */}
                    {isExpanded && (
                      <div style={{
                        padding: "0.75rem 1.25rem 1.25rem",
                        borderTop: "1px solid var(--border-color, #374151)",
                        backgroundColor: "rgba(0,0,0,0.15)"
                      }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                          Review Individual Students ({mapping.students.length}):
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                          {[...mapping.students].sort((a, b) => a.name.trim().localeCompare(b.name.trim())).map((st) => {
                            const currentAction = studentOverrides[st.id] || st.defaultAction;

                            return (
                              <div
                                key={st.id}
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "0.5rem 0.75rem",
                                  borderRadius: "6px",
                                  backgroundColor: "rgba(255,255,255,0.02)",
                                  fontSize: "0.8125rem"
                                }}
                              >
                                <div>
                                  <strong>{st.name}</strong> • Roll: {st.rollNumber} • Adm: {st.admissionNo}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                  {!isGraduatingClass && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleSetStudentAction(st.id, "PROMOTE"); }}
                                        style={{
                                          padding: "0.2rem 0.5rem",
                                          borderRadius: "4px",
                                          border: currentAction === "PROMOTE" ? "1px solid #10b981" : "1px solid var(--border-color)",
                                          backgroundColor: currentAction === "PROMOTE" ? "rgba(16, 185, 129, 0.2)" : "transparent",
                                          color: currentAction === "PROMOTE" ? "#10b981" : "var(--text-secondary)",
                                          fontSize: "0.75rem",
                                          fontWeight: 600,
                                          cursor: "pointer"
                                        }}
                                      >
                                        ✓ Promote
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleSetStudentAction(st.id, "RETAIN"); }}
                                        style={{
                                          padding: "0.2rem 0.5rem",
                                          borderRadius: "4px",
                                          border: currentAction === "RETAIN" ? "1px solid #8b5cf6" : "1px solid var(--border-color)",
                                          backgroundColor: currentAction === "RETAIN" ? "rgba(139, 92, 246, 0.2)" : "transparent",
                                          color: currentAction === "RETAIN" ? "#8b5cf6" : "var(--text-secondary)",
                                          fontSize: "0.75rem",
                                          fontWeight: 600,
                                          cursor: "pointer"
                                        }}
                                      >
                                        ↻ Repeat
                                      </button>
                                    </>
                                  )}
                                  {isGraduatingClass && (
                                    <span style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 700 }}>
                                      🎓 Graduating
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 3: EXECUTION SUCCESS REPORT */}
        {/* ======================================================== */}
        {step === 3 && executionResult && (
          <div style={{
            padding: "2.5rem 2rem",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.25rem"
          }}>
            <div style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "rgba(16, 185, 129, 0.2)",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Sparkles size={32} />
            </div>

            <div>
              <h3 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.25rem", color: "var(--foreground)" }}>
                Batch Promotion Successfully Executed!
              </h3>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
                All classes have been incremented and students rolled over into target batch <strong>{simulation?.targetBatch.name}</strong>.
              </p>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1rem",
              width: "100%",
              maxWidth: "600px",
              marginTop: "0.5rem"
            }}>
              <div style={{ padding: "1rem", borderRadius: "10px", backgroundColor: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                <div style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 700 }}>PROMOTED</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#10b981" }}>{executionResult.promotedCount}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Advanced +1 Class</div>
              </div>
              <div style={{ padding: "1rem", borderRadius: "10px", backgroundColor: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                <div style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 700 }}>GRADUATED</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#f59e0b" }}>{executionResult.graduatedCount}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Class 12 Alumni</div>
              </div>
              <div style={{ padding: "1rem", borderRadius: "10px", backgroundColor: "rgba(139, 92, 246, 0.1)", border: "1px solid rgba(139, 92, 246, 0.3)" }}>
                <div style={{ fontSize: "0.75rem", color: "#8b5cf6", fontWeight: 700 }}>RETAINED</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#8b5cf6" }}>{executionResult.retainedCount}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Repeat Grade</div>
              </div>
            </div>

            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", maxWidth: "550px" }}>
              The new academic batch is now set as the active session. Previous attendances, examination marks, and report cards remain permanently preserved.
            </p>
          </div>
        )}

    </Modal>
  );
}

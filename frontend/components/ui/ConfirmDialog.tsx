"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, AlertCircle, HelpCircle, Loader2 } from "lucide-react";

export type ConfirmVariant = "danger" | "warning" | "primary";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  requireText?: string;
  onConfirm?: () => Promise<void> | void;
}

interface DialogQueueItem extends ConfirmOptions {
  id: string;
  resolve: (value: boolean) => void;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmDialogProvider");
  }
  return context.confirm;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [typedInput, setTypedInput] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = queue[0] || null;

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const item: DialogQueueItem = {
        ...options,
        id: Math.random().toString(36).substring(2, 9),
        resolve
      };
      setQueue((prev) => [...prev, item]);
    });
  }, []);

  // Reset local state when current dialog changes
  useEffect(() => {
    if (current) {
      setLoading(false);
      setTypedInput("");
      setErrorText(null);

      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      // Focus management
      const timer = setTimeout(() => {
        if (current.requireText && inputRef.current) {
          inputRef.current.focus();
        } else if (current.variant === "danger" && cancelBtnRef.current) {
          cancelBtnRef.current.focus();
        } else if (confirmBtnRef.current) {
          confirmBtnRef.current.focus();
        }
      }, 50);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [current?.id, current?.variant, current?.requireText]);

  const handleCancel = useCallback(() => {
    if (loading || !current) return;
    current.resolve(false);
    setQueue((prev) => prev.slice(1));
  }, [loading, current]);

  const handleConfirm = useCallback(async () => {
    if (!current || loading) return;

    if (current.requireText && typedInput.trim() !== current.requireText.trim()) {
      setErrorText(`Please type "${current.requireText}" to confirm.`);
      return;
    }

    if (current.onConfirm) {
      setLoading(true);
      setErrorText(null);
      try {
        await current.onConfirm();
        current.resolve(true);
        setQueue((prev) => prev.slice(1));
      } catch (err: any) {
        setErrorText(err?.message || "An unexpected error occurred. Please try again.");
      } finally {
        setLoading(false);
      }
    } else {
      current.resolve(true);
      setQueue((prev) => prev.slice(1));
    }
  }, [current, loading, typedInput]);

  // Keyboard navigation & accessibility focus trap
  useEffect(() => {
    if (!current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
        return;
      }

      if (e.key === "Tab") {
        if (!dialogCardRef.current) return;
        const focusable = dialogCardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, handleCancel]);

  const variant = current?.variant || "danger";
  const confirmText = current?.confirmText || (variant === "danger" ? "Delete" : "Confirm");
  const cancelText = current?.cancelText || "Cancel";

  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return {
          iconBg: "#dbeafe",
          iconColor: "#2563eb",
          btnBg: "#2563eb",
          btnHover: "#1d4ed8",
          Icon: HelpCircle
        };
      case "warning":
        return {
          iconBg: "#fef3c7",
          iconColor: "#d97706",
          btnBg: "#d97706",
          btnHover: "#b45309",
          Icon: AlertCircle
        };
      case "danger":
      default:
        return {
          iconBg: "#fee2e2",
          iconColor: "#dc2626",
          btnBg: "#dc2626",
          btnHover: "#b91c1c",
          Icon: AlertTriangle
        };
    }
  };

  const isConfirmDisabled =
    loading || (Boolean(current?.requireText) && typedInput.trim() !== current?.requireText?.trim());

  const variantStyle = getVariantStyles();
  const IconComponent = variantStyle.Icon;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {mounted &&
        current &&
        createPortal(
          <div
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget && !loading) {
                handleCancel();
              }
            }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(10, 15, 29, 0.65)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
              zIndex: 999999,
              animation: "portalFadeIn 0.15s ease-out"
            }}
          >
            <div
              ref={dialogCardRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-description"
              style={{
                width: "100%",
                maxWidth: "380px",
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(226, 232, 240, 0.8)",
                padding: "24px 20px",
                boxSizing: "border-box",
                color: "#0f172a",
                animation: "portalZoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
              }}
            >
              {/* Top Icon Badge */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    backgroundColor: variantStyle.iconBg,
                    color: variantStyle.iconColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <IconComponent size={24} strokeWidth={2.2} />
                </div>
              </div>

              {/* Title */}
              <h3
                id="confirm-dialog-title"
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  textAlign: "center",
                  color: "#0f172a",
                  lineHeight: 1.3
                }}
              >
                {current.title}
              </h3>

              {/* Message */}
              <p
                id="confirm-dialog-description"
                style={{
                  margin: "0 0 18px 0",
                  fontSize: "0.875rem",
                  color: "#64748b",
                  textAlign: "center",
                  lineHeight: 1.45,
                  wordBreak: "break-word"
                }}
              >
                {current.message}
              </p>

              {/* Optional Text Confirmation Input */}
              {current.requireText && (
                <div style={{ marginBottom: "16px" }}>
                  <label
                    htmlFor="confirm-verification-input"
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: "6px"
                    }}
                  >
                    Type <span style={{ fontWeight: 700, color: "#0f172a" }}>{current.requireText}</span> to continue:
                  </label>
                  <input
                    id="confirm-verification-input"
                    ref={inputRef}
                    type="text"
                    value={typedInput}
                    onChange={(e) => {
                      setTypedInput(e.target.value);
                      if (errorText) setErrorText(null);
                    }}
                    placeholder={current.requireText}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "0.875rem",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      outline: "none",
                      color: "#0f172a",
                      backgroundColor: "#f8fafc",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              )}

              {/* Inline Error Notice */}
              {errorText && (
                <div
                  style={{
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    fontSize: "0.8rem",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    marginBottom: "14px",
                    lineHeight: 1.4
                  }}
                >
                  {errorText}
                </div>
              )}

              {/* Action Buttons: side by side, >= 44px touch targets */}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "stretch"
                }}
              >
                <button
                  ref={cancelBtnRef}
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  style={{
                    flex: 1,
                    minHeight: "44px",
                    padding: "10px 14px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#334155",
                    backgroundColor: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    cursor: loading ? "not-allowed" : "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    outline: "none"
                  }}
                >
                  {cancelText}
                </button>

                <button
                  ref={confirmBtnRef}
                  type="button"
                  onClick={handleConfirm}
                  disabled={isConfirmDisabled}
                  style={{
                    flex: 1,
                    minHeight: "44px",
                    padding: "10px 14px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#ffffff",
                    backgroundColor: variantStyle.btnBg,
                    border: "none",
                    borderRadius: "10px",
                    cursor: isConfirmDisabled ? "not-allowed" : "pointer",
                    opacity: isConfirmDisabled ? 0.6 : 1,
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    outline: "none",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)"
                  }}
                >
                  {loading && <Loader2 size={16} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />}
                  <span>{confirmText}</span>
                </button>
              </div>
            </div>

            <style>{`
              @keyframes portalFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes portalZoomIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
              }
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}

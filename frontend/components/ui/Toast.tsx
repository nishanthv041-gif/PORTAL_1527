"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle2, AlertCircle, X, RotateCcw } from "lucide-react";

export interface ToastOptions {
  id?: string;
  type?: "success" | "error" | "info";
  title?: string;
  message: string;
  durationMs?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastOptions[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const hideToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = options.id || Math.random().toString(36).substring(2, 9);
      const toast: ToastOptions = {
        ...options,
        id,
        durationMs: options.durationMs ?? 4000,
        type: options.type || "info",
      };

      setToasts((prev) => [...prev.filter((t) => t.id !== id), toast]);

      if (toast.durationMs && toast.durationMs > 0) {
        if (timersRef.current.has(id)) {
          clearTimeout(timersRef.current.get(id)!);
        }
        const timer = setTimeout(() => {
          hideToast(id);
        }, toast.durationMs);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [hideToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          maxWidth: "420px",
          width: "calc(100% - 3rem)",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isError = toast.type === "error";

          return (
            <div
              key={toast.id}
              style={{
                pointerEvents: "auto",
                background: isError
                  ? "rgba(30, 15, 15, 0.96)"
                  : isSuccess
                  ? "rgba(15, 30, 20, 0.96)"
                  : "rgba(15, 23, 42, 0.96)",
                border: `1px solid ${
                  isError
                    ? "rgba(239, 68, 68, 0.5)"
                    : isSuccess
                    ? "rgba(34, 197, 94, 0.5)"
                    : "rgba(99, 102, 241, 0.4)"
                }`,
                borderRadius: "12px",
                padding: "0.85rem 1rem",
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5), 0 0 15px rgba(0,0,0,0.3)",
                color: "#f8fafc",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                backdropFilter: "blur(12px)",
                animation: "toastSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <div style={{ flexShrink: 0 }}>
                {isError ? (
                  <AlertCircle size={20} color="#ef4444" />
                ) : isSuccess ? (
                  <CheckCircle2 size={20} color="#22c55e" />
                ) : (
                  <CheckCircle2 size={20} color="#818cf8" />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {toast.title && (
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.15rem" }}>
                    {toast.title}
                  </div>
                )}
                <div style={{ fontSize: "0.825rem", color: "#cbd5e1", lineHeight: 1.35 }}>
                  {toast.message}
                </div>
              </div>

              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    if (toast.id) hideToast(toast.id);
                  }}
                  style={{
                    flexShrink: 0,
                    padding: "0.35rem 0.65rem",
                    borderRadius: "6px",
                    background: "rgba(99, 102, 241, 0.2)",
                    border: "1px solid rgba(99, 102, 241, 0.4)",
                    color: "#a5b4fc",
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                >
                  <RotateCcw size={12} />
                  <span>{toast.action.label}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => toast.id && hideToast(toast.id)}
                aria-label="Close notification"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: "0.2rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "4px",
                }}
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toastSlideUp {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (opts: ToastOptions) => {
        if (opts.type === "error") alert(opts.message);
        else console.log("[Toast]", opts.message);
        return "";
      },
      hideToast: () => {},
    };
  }
  return ctx;
}


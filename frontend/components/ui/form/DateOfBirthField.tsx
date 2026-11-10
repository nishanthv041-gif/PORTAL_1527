"use client";

import React, { useState, useEffect } from "react";
import { Calendar, AlertCircle } from "lucide-react";
import { parseAndValidateDob, RoleType } from "@/lib/validations/dob";

export interface DateOfBirthFieldProps {
  name?: string;
  label?: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (dateStr: string) => void;
  required?: boolean;
  role?: RoleType;
  disabled?: boolean;
  helperText?: string;
  style?: React.CSSProperties;
}

export function DateOfBirthField({
  name = "dateOfBirth",
  label = "Date of Birth (dd-mm-yyyy)",
  defaultValue = "",
  value: controlledValue,
  onChange,
  required = true,
  role = "STUDENT",
  disabled = false,
  helperText,
  style,
}: DateOfBirthFieldProps) {
  const [internalValue, setInternalValue] = useState<string>(() => {
    if (controlledValue !== undefined) return controlledValue || "";
    if (defaultValue) {
      if (defaultValue.includes("T")) return defaultValue.split("T")[0];
      return defaultValue;
    }
    return "";
  });

  const [ageDisplay, setAgeDisplay] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Today in local format for max attribute
  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(controlledValue || "");
    }
  }, [controlledValue]);

  useEffect(() => {
    if (!internalValue) {
      setAgeDisplay(null);
      setWarning(null);
      setError(null);
      return;
    }

    const res = parseAndValidateDob(internalValue, role, required);
    if (!res.isValid) {
      setError(res.error || "Invalid date");
      setAgeDisplay(null);
      setWarning(null);
    } else {
      setError(null);
      if (res.age !== undefined) {
        setAgeDisplay(`Age: ${res.age} ${res.age === 1 ? "year" : "years"}`);
      } else {
        setAgeDisplay(null);
      }
      setWarning(res.warning || null);
    }
  }, [internalValue, role, required]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInternalValue(val);
    if (onChange) {
      onChange(val);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label
          htmlFor={name}
          style={{
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "var(--foreground, #1e293b)",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          {label} {required && <span style={{ color: "var(--danger, #ef4444)" }}>*</span>}
        </label>
        {ageDisplay && (
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              padding: "0.15rem 0.5rem",
              borderRadius: "9999px",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              color: "var(--primary, #3b82f6)",
            }}
          >
            {ageDisplay}
          </span>
        )}
      </div>

      <div style={{ position: "relative", width: "100%" }}>
        <input
          id={name}
          name={name}
          type="date"
          required={required}
          disabled={disabled}
          min="1920-01-01"
          max={todayStr}
          value={internalValue}
          onChange={handleChange}
          style={{
            width: "100%",
            minHeight: "44px", // Touch target standard
            padding: "0.625rem 0.75rem",
            borderRadius: "8px",
            border: error
              ? "1.5px solid var(--danger, #ef4444)"
              : "1px solid var(--border-color, #cbd5e1)",
            backgroundColor: "transparent",
            color: "var(--foreground, #0f172a)",
            fontSize: "0.9375rem",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {helperText && !error && !warning && (
        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #64748b)" }}>
          {helperText}
        </span>
      )}

      {warning && !error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            fontSize: "0.75rem",
            color: "#d97706", // amber-600
          }}
        >
          <AlertCircle size={14} />
          <span>{warning}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            fontSize: "0.75rem",
            color: "var(--danger, #ef4444)",
          }}
        >
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { memo } from "react";
import styles from "./form.module.css";

export interface FormFieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string | null;
  helperText?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
}

export const FormField = memo(function FormField({
  label,
  htmlFor,
  required,
  error,
  helperText,
  children,
  className = "",
  style,
  id,
}: FormFieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : id ? `${id}-error` : undefined;
  const helperId = htmlFor ? `${htmlFor}-helper` : id ? `${id}-helper` : undefined;

  return (
    <div className={`${styles.formField} ${className}`.trim()} style={style}>
      {label && (
        <div className={styles.labelRow}>
          <label htmlFor={htmlFor} className={styles.label}>
            {label}
            {required && <span className={styles.requiredAsterisk} aria-hidden="true">*</span>}
          </label>
        </div>
      )}

      {children}

      {error ? (
        <div id={errorId} className={styles.errorText} role="alert">
          {error}
        </div>
      ) : helperText ? (
        <div id={helperId} className={styles.helperText}>
          {helperText}
        </div>
      ) : null}
    </div>
  );
});

export default FormField;


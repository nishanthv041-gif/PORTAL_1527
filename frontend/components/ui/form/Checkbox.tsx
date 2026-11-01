"use client";

import React, { forwardRef, memo, useId } from "react";
import styles from "./form.module.css";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: string | null;
  containerStyle?: React.CSSProperties;
}

export const Checkbox = memo(
  forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
    {
      id,
      label,
      description,
      error,
      className = "",
      containerStyle,
      ...rest
    },
    ref
  ) {
    const generatedId = useId();
    const checkboxId = id || generatedId;

    return (
      <div style={containerStyle}>
        <label htmlFor={checkboxId} className={styles.checkboxContainer}>
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className={`${styles.checkboxInput} ${className}`.trim()}
            aria-invalid={error ? "true" : "false"}
            {...rest}
          />
          <div className={styles.checkboxText}>
            <span className={styles.checkboxLabel}>{label}</span>
            {description && <span className={styles.checkboxDesc}>{description}</span>}
          </div>
        </label>
        {error && (
          <div className={styles.errorText} style={{ marginTop: "0.25rem" }} role="alert">
            {error}
          </div>
        )}
      </div>
    );
  })
);

Checkbox.displayName = "Checkbox";

export default Checkbox;


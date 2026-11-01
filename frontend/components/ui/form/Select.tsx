"use client";

import React, { forwardRef, memo, useId, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import FormField from "./FormField";
import styles from "./form.module.css";

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  error?: string | null;
  helperText?: string;
  options?: SelectOption[];
  containerStyle?: React.CSSProperties;
  fieldClassName?: string;
  children?: React.ReactNode;
}

export const Select = memo(
  forwardRef<HTMLSelectElement, SelectProps>(function Select(
    {
      id,
      label,
      error,
      helperText,
      required,
      options,
      className = "",
      containerStyle,
      fieldClassName,
      onFocus,
      children,
      ...rest
    },
    ref
  ) {
    const generatedId = useId();
    const selectId = id || generatedId;

    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLSelectElement>) => {
        if (typeof window !== "undefined" && "visualViewport" in window) {
          try {
            e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch {
            // fallback
          }
        }
        if (onFocus) {
          onFocus(e);
        }
      },
      [onFocus]
    );

    const selectClasses = [
      styles.select,
      error ? styles.inputError : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const selectElement = (
      <div className={styles.selectWrapper} style={containerStyle}>
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={
            error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined
          }
          className={selectClasses}
          onFocus={handleFocus}
          {...rest}
        >
          {options
            ? options.map((opt) => (
                <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <div className={styles.selectArrow} aria-hidden="true">
          <ChevronDown size={18} />
        </div>
      </div>
    );

    if (label || error || helperText) {
      return (
        <FormField
          label={label}
          htmlFor={selectId}
          required={required}
          error={error}
          helperText={helperText}
          className={fieldClassName}
        >
          {selectElement}
        </FormField>
      );
    }

    return selectElement;
  })
);

Select.displayName = "Select";

export default Select;


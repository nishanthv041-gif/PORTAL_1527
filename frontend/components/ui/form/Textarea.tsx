"use client";

import React, { forwardRef, memo, useId, useCallback } from "react";
import FormField from "./FormField";
import styles from "./form.module.css";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  error?: string | null;
  helperText?: string;
  containerStyle?: React.CSSProperties;
  fieldClassName?: string;
}

export const Textarea = memo(
  forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
    {
      id,
      label,
      error,
      helperText,
      required,
      className = "",
      containerStyle,
      fieldClassName,
      onFocus,
      rows = 3,
      ...rest
    },
    ref
  ) {
    const generatedId = useId();
    const textareaId = id || generatedId;

    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLTextAreaElement>) => {
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

    const textareaClasses = [
      styles.textarea,
      error ? styles.inputError : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const textareaElement = (
      <div className={styles.inputWrapper} style={containerStyle}>
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          required={required}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={
            error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined
          }
          className={textareaClasses}
          onFocus={handleFocus}
          {...rest}
        />
      </div>
    );

    if (label || error || helperText) {
      return (
        <FormField
          label={label}
          htmlFor={textareaId}
          required={required}
          error={error}
          helperText={helperText}
          className={fieldClassName}
        >
          {textareaElement}
        </FormField>
      );
    }

    return textareaElement;
  })
);

Textarea.displayName = "Textarea";

export default Textarea;


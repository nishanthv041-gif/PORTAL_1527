"use client";

import React, { forwardRef, memo, useId, useCallback } from "react";
import FormField from "./FormField";
import styles from "./form.module.css";

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string | null;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: React.CSSProperties;
  fieldClassName?: string;
}

export const TextInput = memo(
  forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
    {
      id,
      label,
      error,
      helperText,
      required,
      leftIcon,
      rightIcon,
      className = "",
      containerStyle,
      fieldClassName,
      onFocus,
      ...rest
    },
    ref
  ) {
    const generatedId = useId();
    const inputId = id || generatedId;

    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        // Safe auto-scroll to center on mobile/touch screens
        if (typeof window !== "undefined" && "visualViewport" in window) {
          try {
            e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch {
            // Fallback: browser handles standard focus
          }
        }
        if (onFocus) {
          onFocus(e);
        }
      },
      [onFocus]
    );

    const inputClasses = [
      styles.input,
      leftIcon ? styles.inputHasLeftIcon : "",
      rightIcon ? styles.inputHasRightIcon : "",
      error ? styles.inputError : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const inputElement = (
      <div className={styles.inputWrapper} style={containerStyle}>
        {leftIcon && <div className={styles.leftIcon}>{leftIcon}</div>}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={
            error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
          }
          className={inputClasses}
          onFocus={handleFocus}
          {...rest}
        />
        {rightIcon && <div className={styles.rightIcon}>{rightIcon}</div>}
      </div>
    );

    if (label || error || helperText) {
      return (
        <FormField
          label={label}
          htmlFor={inputId}
          required={required}
          error={error}
          helperText={helperText}
          className={fieldClassName}
        >
          {inputElement}
        </FormField>
      );
    }

    return inputElement;
  })
);

TextInput.displayName = "TextInput";

export default TextInput;


"use client";

import React, { forwardRef, memo, useId, useCallback } from "react";
import { Search, X } from "lucide-react";
import styles from "./form.module.css";

export interface SearchInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  containerStyle?: React.CSSProperties;
}

export const SearchInput = memo(
  forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
    {
      id,
      value,
      onChange,
      onClear,
      placeholder = "Search...",
      className = "",
      containerStyle,
      onFocus,
      ...rest
    },
    ref
  ) {
    const generatedId = useId();
    const inputId = id || generatedId;

    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
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

    const hasValue = value !== undefined && value !== null && String(value).length > 0;

    return (
      <div className={styles.inputWrapper} style={containerStyle}>
        <div className={styles.leftIcon}>
          <Search size={18} />
        </div>
        <input
          ref={ref}
          id={inputId}
          type="search"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`${styles.input} ${styles.inputHasLeftIcon} ${
            hasValue && onClear ? styles.inputHasRightIcon : ""
          } ${className}`.trim()}
          onFocus={handleFocus}
          {...rest}
        />
        {hasValue && onClear && (
          <button
            type="button"
            onClick={onClear}
            className={styles.searchClearButton}
            aria-label="Clear search input"
          >
            <X size={16} />
          </button>
        )}
      </div>
    );
  })
);

SearchInput.displayName = "SearchInput";

export default SearchInput;


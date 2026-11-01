"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useId,
  memo,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X, Search, Check } from "lucide-react";
import styles from "./select.module.css";
import { MultiSelectOption } from "./MultiSelect";

export interface SingleSelectProps {
  id?: string;
  name?: string;
  label?: React.ReactNode;
  placeholder?: string;
  options: MultiSelectOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  containerStyle?: React.CSSProperties;
}

export const SingleSelect = memo(function SingleSelect({
  id,
  name,
  label,
  placeholder = "Select an option...",
  options = [],
  value = "",
  onChange,
  error,
  helperText,
  required = false,
  disabled = false,
  allowClear = false,
  searchable = true,
  searchPlaceholder = "Search options...",
  containerStyle,
}: SingleSelectProps) {
  const generatedId = useId();
  const selectId = id || generatedId;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    isAbove: boolean;
  }>({ top: 0, left: 0, width: 0, isAbove: false });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || isMobile) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = 300;
    const spaceBelow = window.innerHeight - rect.bottom;
    const isAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    setDropdownPosition({
      top: isAbove ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      isAbove,
    });
  }, [isMobile]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === "Escape") {
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown" && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  const filteredOptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return options;
    return options.filter((opt) => {
      return (
        opt.label.toLowerCase().includes(q) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q))
      );
    });
  }, [options, searchQuery]);

  const selectedOption = useMemo(() => {
    return options.find((o) => o.value === value);
  }, [options, value]);

  const handleSelect = (val: string, isDisabled?: boolean) => {
    if (isDisabled) return;
    onChange(val);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  const renderPanel = () => {
    if (!isOpen || typeof document === "undefined") return null;

    const content = (
      <>
        {isMobile && <div className={styles.mobileBackdrop} onClick={() => setIsOpen(false)} />}
        <div
          ref={panelRef}
          className={isMobile ? styles.mobileBottomSheet : styles.desktopDropdown}
          style={
            isMobile
              ? {}
              : {
                  top: dropdownPosition.isAbove ? undefined : `${dropdownPosition.top}px`,
                  bottom: dropdownPosition.isAbove
                    ? `${window.innerHeight - dropdownPosition.top}px`
                    : undefined,
                  left: `${dropdownPosition.left}px`,
                  width: `${dropdownPosition.width}px`,
                  minWidth: "240px",
                }
          }
        >
          {isMobile && (
            <div className={styles.mobileHeader}>
              <span className={styles.mobileTitle}>{label ? String(label) : "Select an option"}</span>
              <button
                type="button"
                className={styles.mobileClose}
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          )}

          {searchable && (
            <div className={styles.searchWrapper}>
              <Search size={16} color="var(--text-secondary, #94a3b8)" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className={styles.searchInput}
                aria-label="Search options"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className={styles.clearBtn}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          <div
            id={`${selectId}-listbox`}
            className={styles.optionsList}
            role="listbox"
          >
            {filteredOptions.length === 0 ? (
              <div className={styles.emptyState}>No matching options found.</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.value;

                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    className={`${styles.optionItem} ${isSelected ? styles.optionSelected : ""} ${
                      opt.disabled ? styles.optionDisabled : ""
                    }`}
                    onClick={() => handleSelect(opt.value, opt.disabled)}
                  >
                    <div style={{ width: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isSelected && <Check size={16} color="var(--primary, #2563eb)" />}
                    </div>
                    <div className={styles.optionDetails}>
                      <div className={styles.optionLabelRow}>
                        <span className={styles.optionLabel}>{opt.label}</span>
                        {opt.badge && <span className={styles.optionBadge}>{opt.badge}</span>}
                      </div>
                      {opt.subLabel && <span className={styles.optionSubLabel}>{opt.subLabel}</span>}
                      {opt.disabled && opt.disabledReason && (
                        <span className={styles.disabledReason}>{opt.disabledReason}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </>
    );

    return createPortal(content, document.body);
  };

  return (
    <div className={styles.selectContainer} style={containerStyle}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          <span>{label}</span>
          {required && <span className={styles.requiredAsterisk}>*</span>}
        </label>
      )}

      {name && <input type="hidden" name={name} value={value} />}

      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={`${selectId}-listbox`}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`${styles.trigger} ${disabled ? styles.triggerDisabled : ""} ${
          error ? styles.triggerError : ""
        }`}
      >
        <div className={styles.chipsContainer}>
          {!selectedOption ? (
            <span className={styles.placeholder}>{placeholder}</span>
          ) : (
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>
              {selectedOption.label}
              {selectedOption.badge && (
                <span className={styles.optionBadge} style={{ marginLeft: "6px" }}>
                  {selectedOption.badge}
                </span>
              )}
            </span>
          )}
        </div>

        <div className={styles.triggerRight}>
          {allowClear && value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className={styles.clearBtn}
              aria-label="Clear selection"
            >
              <X size={15} />
            </button>
          )}
          <ChevronDown
            size={16}
            style={{
              transform: isOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
            }}
          />
        </div>
      </button>

      {error && (
        <div className={styles.errorText} role="alert">
          {error}
        </div>
      )}

      {helperText && !error && <div className={styles.helperText}>{helperText}</div>}

      {renderPanel()}
    </div>
  );
});

SingleSelect.displayName = "SingleSelect";

export default SingleSelect;


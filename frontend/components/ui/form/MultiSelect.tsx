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
import {
  ChevronDown,
  X,
  Search,
} from "lucide-react";
import styles from "./select.module.css";

export interface MultiSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  group?: string;
  disabled?: boolean;
  disabledReason?: string;
  badge?: string;
}

export interface MultiSelectProps {
  id?: string;
  name?: string;
  label?: React.ReactNode;
  placeholder?: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (selectedValues: string[]) => void;
  error?: string | null;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  minSelected?: number;
  maxSelected?: number;
  searchPlaceholder?: string;
  containerStyle?: React.CSSProperties;
  maxChipsDisplay?: number;
  selectAllText?: string;
  clearAllText?: string;
  renderOption?: (option: MultiSelectOption, isSelected: boolean) => React.ReactNode;
}

export const MultiSelect = memo(function MultiSelect({
  id,
  name,
  label,
  placeholder = "Select options...",
  options = [],
  value = [],
  onChange,
  error,
  helperText,
  required = false,
  disabled = false,
  minSelected,
  maxSelected,
  searchPlaceholder = "Search name, roll, class...",
  containerStyle,
  maxChipsDisplay = 2,
  selectAllText = "Select all",
  clearAllText = "Clear all",
  renderOption,
}: MultiSelectProps) {
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

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Update floating portal position on desktop
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || isMobile) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = 320;
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

  // Focus search input when opened
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

  // Close when clicking outside
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

  // Keyboard navigation
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

  // Filter options
  const filteredOptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return options;
    return options.filter((opt) => {
      return (
        opt.label.toLowerCase().includes(q) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q)) ||
        (opt.group && opt.group.toLowerCase().includes(q))
      );
    });
  }, [options, searchQuery]);

  // Selected option lookup
  const selectedOptions = useMemo(() => {
    const valSet = new Set(value);
    return options.filter((o) => valSet.has(o.value));
  }, [options, value]);

  // Toggle selection
  const handleToggle = (val: string, isDisabled?: boolean) => {
    if (isDisabled) return;
    const currentSet = new Set(value);

    if (currentSet.has(val)) {
      if (minSelected && currentSet.size <= minSelected) return;
      currentSet.delete(val);
    } else {
      if (maxSelected && maxSelected === 1) {
        // Swap selection for single-select mode
        onChange([val]);
        return;
      }
      if (maxSelected && currentSet.size >= maxSelected) return;
      currentSet.add(val);
    }
    onChange(Array.from(currentSet));
  };

  const handleSelectAllFiltered = () => {
    const currentSet = new Set(value);
    const available = filteredOptions.filter((o) => !o.disabled);
    available.forEach((o) => {
      if (!maxSelected || currentSet.size < maxSelected) {
        currentSet.add(o.value);
      }
    });
    onChange(Array.from(currentSet));
  };

  const handleClearAll = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange([]);
  };

  const handleRemoveChip = (val: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (minSelected && value.length <= minSelected) return;
    onChange(value.filter((v) => v !== val));
  };

  // Render Portal Dropdown / Bottom Sheet
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
                  minWidth: "260px",
                }
          }
        >
          {/* Mobile Sheet Header */}
          {isMobile && (
            <div className={styles.mobileHeader}>
              <span className={styles.mobileTitle}>
                {label ? String(label) : "Select Items"} ({value.length} selected)
              </span>
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

          {/* Search Box */}
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

          {/* Actions Bar */}
          <div className={styles.actionsBar}>
            <span>
              {filteredOptions.length} option{filteredOptions.length === 1 ? "" : "s"}
              {searchQuery && " matched"}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {(!maxSelected || maxSelected > 1) && filteredOptions.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className={styles.actionBtn}
                >
                  {selectAllText}
                </button>
              )}
              {value.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className={styles.actionBtn}
                  style={{ color: "var(--danger, #ef4444)" }}
                >
                  {clearAllText}
                </button>
              )}
            </div>
          </div>

          {/* Option List */}
          <div
            id={`${selectId}-listbox`}
            className={styles.optionsList}
            role="listbox"
            aria-multiselectable="true"
          >
            {filteredOptions.length === 0 ? (
              <div className={styles.emptyState}>No matching options found.</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value.includes(opt.value);

                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    className={`${styles.optionItem} ${isSelected ? styles.optionSelected : ""} ${
                      opt.disabled ? styles.optionDisabled : ""
                    }`}
                    onClick={() => handleToggle(opt.value, opt.disabled)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={opt.disabled}
                      onChange={() => {}} // Handled by optionItem onClick
                      className={styles.checkbox}
                      tabIndex={-1}
                    />
                    {renderOption ? (
                      renderOption(opt, isSelected)
                    ) : (
                      <div className={styles.optionDetails}>
                        <div className={styles.optionLabelRow}>
                          <span className={styles.optionLabel}>{opt.label}</span>
                          {opt.badge && <span className={styles.optionBadge}>{opt.badge}</span>}
                        </div>
                        {opt.subLabel && (
                          <span className={styles.optionSubLabel}>{opt.subLabel}</span>
                        )}
                        {opt.disabled && opt.disabledReason && (
                          <span className={styles.disabledReason}>{opt.disabledReason}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Mobile Footer with Done Button */}
          {isMobile && (
            <div className={styles.mobileFooter}>
              {value.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "8px",
                    backgroundColor: "transparent",
                    color: "var(--danger, #ef4444)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className={styles.doneBtn}
                onClick={() => setIsOpen(false)}
              >
                Done ({value.length} selected)
              </button>
            </div>
          )}
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

      {/* Hidden inputs for native form compatibility */}
      {name &&
        value.map((v) => (
          <input key={v} type="hidden" name={name} value={v} />
        ))}

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
          {value.length === 0 ? (
            <span className={styles.placeholder}>{placeholder}</span>
          ) : (
            <>
              {selectedOptions.slice(0, maxChipsDisplay).map((opt) => (
                <span key={opt.value} className={styles.chip}>
                  <span className={styles.chipText}>{opt.label}</span>
                  {!disabled && (
                    <button
                      type="button"
                      className={styles.chipRemove}
                      onClick={(e) => handleRemoveChip(opt.value, e)}
                      aria-label={`Remove ${opt.label}`}
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}

              {value.length > maxChipsDisplay && (
                <span className={styles.moreBadge}>
                  +{value.length - maxChipsDisplay} more
                </span>
              )}
            </>
          )}
        </div>

        <div className={styles.triggerRight}>
          {value.length > 0 && !disabled && (
            <button
              type="button"
              onClick={handleClearAll}
              className={styles.clearBtn}
              aria-label="Clear all selections"
            >
              <X size={15} />
            </button>
          )}
          {value.length > 0 && (
            <span className={styles.countBadge}>{value.length}</span>
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

      {helperText && !error && (
        <div className={styles.helperText}>{helperText}</div>
      )}

      {renderPanel()}
    </div>
  );
});

MultiSelect.displayName = "MultiSelect";

export default MultiSelect;


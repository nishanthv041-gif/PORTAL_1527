"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import Spinner from "./Spinner";
import styles from "./SearchBar.module.css";

export interface SearchBarProps {
  placeholder?: string;
  paramName?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (val: string) => void;
  onPendingChange?: (isPending: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  clearable?: boolean;
  ariaLabel?: string;
  syncWithUrl?: boolean;
}

export default function SearchBar({
  placeholder = "Search...",
  paramName = "q",
  defaultValue,
  value,
  onChange,
  onPendingChange,
  className = "",
  style,
  autoFocus = false,
  clearable = true,
  ariaLabel = "Search input",
  syncWithUrl = true,
}: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlQuery = searchParams ? searchParams.get(paramName) || "" : "";
  const initialValue = value !== undefined ? value : defaultValue !== undefined ? defaultValue : urlQuery;
  const [query, setQuery] = useState(initialValue);
  const [prevValue, setPrevValue] = useState(value);
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  // Sync state if controlled prop changed
  if (value !== undefined && value !== prevValue) {
    setPrevValue(value);
    setQuery(value);
  }

  // Sync state if URL search query changed externally
  if (value === undefined && syncWithUrl && urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  // Notify parent of isPending changes
  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  // Debounced URL and state push
  useEffect(() => {
    const timer = setTimeout(() => {
      // 1. Trigger parent change callback
      onChangeRef.current?.(query);

      // 2. Sync to URL if enabled
      if (syncWithUrl && searchParams) {
        const currentParam = searchParams.get(paramName) || "";
        const trimmed = query.trim();
        if (currentParam !== trimmed) {
          const params = new URLSearchParams(searchParams.toString());
          if (trimmed) {
            params.set(paramName, trimmed);
          } else {
            params.delete(paramName);
          }
          // Reset pagination page to 1 whenever search query changes
          if (params.has("page")) {
            params.set("page", "1");
          }

          const newQueryString = params.toString();
          const targetUrl = newQueryString ? `${pathname}?${newQueryString}` : pathname;

          startTransition(() => {
            router.replace(targetUrl, { scroll: false });
          });
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, paramName, pathname, searchParams, syncWithUrl]);

  const handleClear = useCallback(() => {
    setQuery("");
    onChange?.("");

    if (syncWithUrl && searchParams) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(paramName);
      if (params.has("page")) {
        params.set("page", "1");
      }
      const newQueryString = params.toString();
      const targetUrl = newQueryString ? `${pathname}?${newQueryString}` : pathname;

      startTransition(() => {
        router.replace(targetUrl, { scroll: false });
      });
    }
  }, [paramName, pathname, searchParams, syncWithUrl, onChange, router]);

  return (
    <div className={`${styles.searchContainer} ${className}`} style={style}>
      <div className={styles.searchIcon}>
        <Search size={18} />
      </div>

      <input
        type="text"
        className={styles.searchInput}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck="false"
      />

      <div className={styles.rightControls}>
        {isPending && (
          <div className={styles.spinnerWrapper} title="Searching...">
            <Spinner size="sm" />
          </div>
        )}

        {clearable && query && !isPending && (
          <button
            type="button"
            onClick={handleClear}
            className={styles.clearBtn}
            title="Clear search"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}


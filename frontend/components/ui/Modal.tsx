"use client";

import React, {
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./Modal.module.css";

// Global body scroll lock counter to support nested/consecutive modals safely
let activeModalCount = 0;
let previousBodyOverflow = "";

function lockBodyScroll() {
  if (typeof document === "undefined") return;
  if (activeModalCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  activeModalCount++;
}

function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  activeModalCount = Math.max(0, activeModalCount - 1);
  if (activeModalCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
  }
}

export type ModalSize = "sm" | "md" | "form" | "lg" | "xl";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  size?: ModalSize;
  children?: ReactNode;
  footer?: ReactNode;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
  className?: string;
  panelStyle?: React.CSSProperties;
  ariaLabel?: string;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  size = "md",
  children,
  footer,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  showCloseButton = true,
  className = "",
  panelStyle,
  ariaLabel,
}: ModalProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  // Handle body scroll lock & Escape key
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElement.current = document.activeElement as HTMLElement;
    lockBodyScroll();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Initial focus into modal
    const focusTimer = setTimeout(() => {
      if (panelRef.current) {
        const firstInputOrBtn = panelRef.current.querySelector<HTMLElement>(
          'input:not([type="hidden"]), select, textarea, button:not([data-close-btn])'
        );
        if (firstInputOrBtn) {
          firstInputOrBtn.focus();
        } else {
          panelRef.current.focus();
        }
      }
    }, 40);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      unlockBodyScroll();

      // Restore previously focused element
      if (previouslyFocusedElement.current && typeof previouslyFocusedElement.current.focus === "function") {
        try {
          previouslyFocusedElement.current.focus();
        } catch {
          // Ignore focus errors
        }
      }
    };
  }, [isOpen, closeOnEsc, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (closeOnOverlayClick && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnOverlayClick, onClose]
  );

  if (!mounted || !isOpen) return null;

  const sizeClass = styles[`size_${size}`] || styles.size_md;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : ariaLabel || "Modal Dialog"}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`${styles.panel} ${sizeClass} ${className}`}
        style={panelStyle}
      >
        {/* Render built-in header if title or icon is supplied */}
        {(title || showCloseButton) && (
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              {icon && <div className={styles.headerIcon}>{icon}</div>}
              <div className={styles.headerTitles}>
                {title && <h3 className={styles.title}>{title}</h3>}
                {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
              </div>
            </div>
            {showCloseButton && (
              <button
                type="button"
                data-close-btn="true"
                onClick={onClose}
                className={styles.closeButton}
                title="Close"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        {/* Scrollable Body */}
        <div className={styles.body}>{children}</div>

        {/* Fixed Footer */}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// Subcomponents for flexible compound composition if needed
Modal.Header = function ModalHeader({
  title,
  subtitle,
  icon,
  onClose,
  showCloseButton = true,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  onClose?: () => void;
  showCloseButton?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      {children || (
        <>
          <div className={styles.headerLeft}>
            {icon && <div className={styles.headerIcon}>{icon}</div>}
            <div className={styles.headerTitles}>
              {title && <h3 className={styles.title}>{title}</h3>}
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
          </div>
          {showCloseButton && onClose && (
            <button
              type="button"
              data-close-btn="true"
              onClick={onClose}
              className={styles.closeButton}
              title="Close"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}
        </>
      )}
    </div>
  );
};

Modal.Body = function ModalBody({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`${styles.body} ${className}`} style={style}>
      {children}
    </div>
  );
};

Modal.Footer = function ModalFooter({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`${styles.footer} ${className}`} style={style}>
      {children}
    </div>
  );
};


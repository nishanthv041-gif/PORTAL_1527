"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/frontend/components/ui/Toast";

export interface OptimisticItem {
  id: string;
  isOptimistic?: boolean;
  [key: string]: any;
}

export interface OptimisticDeleteOptions {
  undoDurationMs?: number;
  itemName?: string;
  onSuccess?: () => void;
  onError?: (error: any) => void;
  onUndo?: () => void;
}

export function useOptimisticList<T extends OptimisticItem>(initialItems: T[]) {
  const [items, setItems] = useState<T[]>(initialItems);
  const { showToast, hideToast } = useToast();
  
  // Keep track of pending server deletions to allow Undo
  const pendingDeletionsRef = useRef<
    Map<
      string,
      {
        timer: NodeJS.Timeout;
        toastId: string;
        item: T;
        index: number;
        aborted: boolean;
      }
    >
  >(new Map());

  // Synchronize when server revalidates props
  useEffect(() => {
    setItems((prev) => {
      // Retain any pending optimistic items that don't yet exist in initialItems
      const pendingCreates = prev.filter((item) => item.isOptimistic);
      // Remove any items that are currently in pending deletion state
      const pendingDeleteIds = new Set(pendingDeletionsRef.current.keys());
      const filteredIncoming = initialItems.filter((item) => !pendingDeleteIds.has(item.id));

      return [...pendingCreates, ...filteredIncoming];
    });
  }, [initialItems]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      pendingDeletionsRef.current.forEach(({ timer }) => clearTimeout(timer));
      pendingDeletionsRef.current.clear();
    };
  }, []);

  /**
   * OPTIMISTIC DELETE:
   * 1. Instantly removes item from UI (< 10ms)
   * 2. Shows a 5s Undo Toast
   * 3. Sends server deletion only after 5s or commits immediately if undone
   * 4. Self-heals / rolls back on server failure
   */
  const optimisticDelete = useCallback(
    (
      id: string,
      deleteFn: (id: string) => Promise<{ success: boolean; error?: string } | void>,
      options?: OptimisticDeleteOptions
    ) => {
      const undoDuration = options?.undoDurationMs ?? 5000;
      const itemName = options?.itemName || "Item";

      let originalIndex = -1;
      let targetItem: T | undefined;

      setItems((prev) => {
        originalIndex = prev.findIndex((item) => item.id === id);
        if (originalIndex === -1) return prev;
        targetItem = prev[originalIndex];
        return prev.filter((item) => item.id !== id);
      });

      if (!targetItem) return;

      const itemToRestore = targetItem;
      const indexToRestore = originalIndex;

      // Toast action for Undo
      const undoAction = () => {
        const record = pendingDeletionsRef.current.get(id);
        if (record) {
          record.aborted = true;
          clearTimeout(record.timer);
          pendingDeletionsRef.current.delete(id);
          hideToast(record.toastId);
        }

        // Restore immediately into state
        setItems((prev) => {
          if (prev.some((it) => it.id === id)) return prev;
          const copy = [...prev];
          const insertIdx = Math.min(indexToRestore, copy.length);
          copy.splice(insertIdx, 0, itemToRestore);
          return copy;
        });

        showToast({
          type: "info",
          message: `Deletion undone. ${itemName} restored.`,
          durationMs: 2500,
        });

        options?.onUndo?.();
      };

      // Toast with Undo button
      const toastId = showToast({
        type: "success",
        title: "Deleted",
        message: `${itemName} removed.`,
        durationMs: undoDuration,
        action: {
          label: "Undo",
          onClick: undoAction,
        },
      });

      // Background timer to commit delete to server
      const timer = setTimeout(async () => {
        const record = pendingDeletionsRef.current.get(id);
        if (!record || record.aborted) return;
        pendingDeletionsRef.current.delete(id);

        try {
          const res = await deleteFn(id);
          if (res && typeof res === "object" && res.success === false) {
            throw new Error(res.error || "Server could not delete record");
          }
          options?.onSuccess?.();
        } catch (err: any) {
          // Server failed: rollback optimistic delete
          setItems((prev) => {
            if (prev.some((it) => it.id === id)) return prev;
            const copy = [...prev];
            const insertIdx = Math.min(indexToRestore, copy.length);
            copy.splice(insertIdx, 0, itemToRestore);
            return copy;
          });

          showToast({
            type: "error",
            title: "Delete Failed",
            message: err?.message || `Could not delete ${itemName}. Changes restored.`,
            durationMs: 5000,
          });

          options?.onError?.(err);
        }
      }, undoDuration);

      pendingDeletionsRef.current.set(id, {
        timer,
        toastId,
        item: itemToRestore,
        index: indexToRestore,
        aborted: false,
      });
    },
    [hideToast, showToast]
  );

  /**
   * OPTIMISTIC CREATE:
   * Instantly prepends the new item to the UI, saves in background,
   * replaces temp ID with real ID on success, rolls back on error.
   */
  const optimisticCreate = useCallback(
    async (
      tempItem: T,
      createFn: () => Promise<T | { success: boolean; data?: T; error?: string }>
    ) => {
      const optimisticRecord: T = { ...tempItem, isOptimistic: true };

      // Prepend to visible list immediately (< 10ms)
      setItems((prev) => [optimisticRecord, ...prev]);

      try {
        const res = await createFn();
        let realRecord: T | undefined;

        if (res && "data" in res && res.data) {
          realRecord = res.data;
        } else if (res && "id" in res) {
          realRecord = res as T;
        }

        if (!realRecord) {
          throw new Error((res as any)?.error || "Failed to create record");
        }

        // Replace optimistic placeholder with real persisted record
        setItems((prev) =>
          prev.map((item) => (item.id === tempItem.id ? realRecord! : item))
        );

        showToast({
          type: "success",
          message: "Created successfully.",
          durationMs: 3000,
        });

        return realRecord;
      } catch (err: any) {
        // Rollback
        setItems((prev) => prev.filter((item) => item.id !== tempItem.id));

        showToast({
          type: "error",
          title: "Create Failed",
          message: err?.message || "Failed to save record.",
          durationMs: 5000,
        });

        throw err;
      }
    },
    [showToast]
  );

  /**
   * OPTIMISTIC UPDATE:
   * Merges updates immediately, saves in background, rolls back on error.
   */
  const optimisticUpdate = useCallback(
    async (
      id: string,
      patch: Partial<T>,
      updateFn: () => Promise<T | { success: boolean; data?: T; error?: string }>
    ) => {
      let previousRecord: T | undefined;

      setItems((prev) => {
        const idx = prev.findIndex((item) => item.id === id);
        if (idx === -1) return prev;
        previousRecord = prev[idx];
        const updated = { ...previousRecord, ...patch };
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      });

      if (!previousRecord) return;

      try {
        const res = await updateFn();
        let realRecord: T | undefined;

        if (res && "data" in res && res.data) {
          realRecord = res.data;
        } else if (res && "id" in res) {
          realRecord = res as T;
        }

        if (realRecord) {
          setItems((prev) =>
            prev.map((item) => (item.id === id ? realRecord! : item))
          );
        }

        showToast({
          type: "success",
          message: "Changes saved.",
          durationMs: 3000,
        });
      } catch (err: any) {
        // Rollback
        setItems((prev) =>
          prev.map((item) => (item.id === id ? previousRecord! : item))
        );

        showToast({
          type: "error",
          title: "Update Failed",
          message: err?.message || "Failed to update record.",
          durationMs: 5000,
        });

        throw err;
      }
    },
    [showToast]
  );

  return {
    items,
    setItems,
    optimisticDelete,
    optimisticCreate,
    optimisticUpdate,
  };
}


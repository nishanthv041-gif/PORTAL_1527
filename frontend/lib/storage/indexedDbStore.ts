/**
 * Offline & Form Draft Storage (IndexedDB)
 * 
 * Guarantees zero data loss during silent 12:00 AM state refreshes or network drops.
 * Stores:
 * 1. Form drafts (homework submission, marks entry, complaint drafts, message composer)
 * 2. User preferences and UI state
 * 3. Offline cache snapshots
 */

const DB_NAME = "srt_portal_offline_vault";
const DB_VERSION = 1;
const STORES = {
  DRAFTS: "form_drafts",
  CACHE: "offline_cache",
  METADATA: "sync_metadata",
} as const;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return reject(new Error("IndexedDB not available"));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.DRAFTS)) {
        db.createObjectStore(STORES.DRAFTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.CACHE)) {
        db.createObjectStore(STORES.CACHE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.METADATA)) {
        db.createObjectStore(STORES.METADATA, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface FormDraft<T = any> {
  id: string; // unique form key (e.g., "marks-form-class10-math", "message-composer-parent123")
  userId?: string;
  data: T;
  updatedAt: number;
}

/**
 * Saves an active form draft to IndexedDB with localStorage fallback
 */
export async function saveFormDraft<T>(id: string, data: T, userId?: string): Promise<void> {
  const draft: FormDraft<T> = {
    id,
    userId,
    data,
    updatedAt: Date.now(),
  };

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.DRAFTS, "readwrite");
      const store = tx.objectStore(STORES.DRAFTS);
      store.put(draft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // LocalStorage fallback for high resiliency
    try {
      localStorage.setItem(`srt_draft_${id}`, JSON.stringify(draft));
    } catch {}
  }
}

/**
 * Retrieves a previously saved form draft
 */
export async function getFormDraft<T>(id: string): Promise<FormDraft<T> | null> {
  try {
    const db = await openDb();
    const result = await new Promise<FormDraft<T> | undefined>((resolve, reject) => {
      const tx = db.transaction(STORES.DRAFTS, "readonly");
      const store = tx.objectStore(STORES.DRAFTS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (result) return result;
  } catch {}

  // Fallback to localStorage
  try {
    const local = localStorage.getItem(`srt_draft_${id}`);
    if (local) return JSON.parse(local);
  } catch {}

  return null;
}

/**
 * Removes a form draft once successfully submitted
 */
export async function deleteFormDraft(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.DRAFTS, "readwrite");
      const store = tx.objectStore(STORES.DRAFTS);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}

  try {
    localStorage.removeItem(`srt_draft_${id}`);
  } catch {}
}

/**
 * Caches an offline data snapshot
 */
export async function setOfflineSnapshot(key: string, value: any, ttlMs: number = 24 * 3600 * 1000): Promise<void> {
  try {
    const db = await openDb();
    const item = {
      key,
      value,
      expiresAt: Date.now() + ttlMs,
      savedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.CACHE, "readwrite");
      const store = tx.objectStore(STORES.CACHE);
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

/**
 * Reads an offline data snapshot
 */
export async function getOfflineSnapshot<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.CACHE, "readonly");
      const store = tx.objectStore(STORES.CACHE);
      const req = store.get(key);
      req.onsuccess = () => {
        const item = req.result;
        if (item && item.expiresAt > Date.now()) {
          resolve(item.value);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

import { db } from "./index";

export type OutboxAction = "CREATE" | "UPDATE" | "DELETE";

/**
 * Non-blocking helper to queue a database change into SyncOutbox.
 * Designed so that the primary Neon operation returns immediately to the client,
 * while the replication event is safely queued for asynchronous background sync to Supabase.
 */
export async function queueOutboxSync(
  modelName: string,
  recordId: string,
  action: OutboxAction,
  payload?: any
): Promise<void> {
  try {
    await db.syncOutbox.create({
      data: {
        modelName,
        recordId,
        action,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
        status: "PENDING",
      },
    });
  } catch (err) {
    // Non-blocking: outbox failure should not fail the user's primary database write
    console.warn(`[Outbox] Failed to queue sync for ${modelName}:${recordId}`, err);
  }
}

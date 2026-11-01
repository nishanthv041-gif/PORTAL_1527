import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminBatchesRedirectPage() {
  redirect("/dashboard/admin/settings?tab=batches");
}

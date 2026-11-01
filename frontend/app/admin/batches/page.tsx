import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminBatchesRouteRedirect() {
  redirect("/admin/settings?tab=batches");
}

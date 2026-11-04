import DashboardSectionSkeleton from "@/frontend/components/ui/DashboardSectionSkeleton";

export default function Loading() {
  return <DashboardSectionSkeleton title="Messages" variant="list" count={5} />;
}

import DashboardSectionSkeleton from "@/frontend/components/ui/DashboardSectionSkeleton";

export default function Loading() {
  return <DashboardSectionSkeleton title="Attendance Records" variant="table" count={5} />;
}

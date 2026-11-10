import DashboardSectionSkeleton from "@/frontend/components/ui/DashboardSectionSkeleton";

export default function Loading() {
  return <DashboardSectionSkeleton title="Missing Dates of Birth" variant="table" count={5} />;
}

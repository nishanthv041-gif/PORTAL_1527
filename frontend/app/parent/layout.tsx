import DashboardLayout from "@/frontend/app/dashboard/layout";
import ParentBottomNav from "@/frontend/components/Layout/ParentBottomNav";

export default async function ParentSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout>
      <div style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 1.25rem)" }}>
        {children}
      </div>
      <ParentBottomNav />
    </DashboardLayout>
  );
}

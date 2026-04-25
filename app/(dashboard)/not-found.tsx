import { Suspense } from "react";
import { NotFoundWorkbench } from "@/components/shared/not-found-workbench";

export default function DashboardNotFound() {
  return (
    <Suspense fallback={null}>
      <NotFoundWorkbench withinDashboard />
    </Suspense>
  );
}

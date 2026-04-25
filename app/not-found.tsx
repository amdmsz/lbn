import { Suspense } from "react";
import { NotFoundWorkbench } from "@/components/shared/not-found-workbench";

export default function NotFound() {
  return (
    <Suspense fallback={null}>
      <NotFoundWorkbench />
    </Suspense>
  );
}

import { redirect } from "next/navigation";
import {
  canAccessSupplierModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";

export default async function SuppliersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessSupplierModule(session.user.role, session.user.permissionCodes)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  redirect("/products?tab=suppliers");
}

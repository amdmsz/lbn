import { redirect } from "next/navigation";
import { getDefaultRouteForRole } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  redirect(getDefaultRouteForRole(session.user.role));
}

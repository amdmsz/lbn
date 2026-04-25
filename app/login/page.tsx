import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getDefaultRouteForRole } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    if (session.user.mustChangePassword) {
      redirect("/change-password");
    }

    redirect(getDefaultRouteForRole(session.user.role));
  }

  return <LoginForm />;
}
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { canAccessPath, getDefaultRouteForRole } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";

function resolveSafeCallbackRoute(
  callbackUrl: string | string[] | undefined,
  role: Parameters<typeof canAccessPath>[0],
) {
  const rawValue = Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl;

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = new URL(rawValue, "http://lbn.local");

    if (parsed.origin !== "http://lbn.local") {
      return null;
    }

    if (!canAccessPath(role, parsed.pathname)) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export default async function LoginPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (session?.user) {
    if (session.user.mustChangePassword) {
      redirect("/change-password");
    }

    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    redirect(
      resolveSafeCallbackRoute(resolvedSearchParams?.callbackUrl, session.user.role) ??
        getDefaultRouteForRole(session.user.role),
    );
  }

  return <LoginForm />;
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { canAccessPath, getDefaultRouteForRole } from "@/lib/auth/access";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (pathname === "/login") {
    if (token?.role) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = token.mustChangePassword
        ? "/change-password"
        : getDefaultRouteForRole(token.role);
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    return NextResponse.next();
  }

  if (!token?.role) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?callbackUrl=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(loginUrl);
  }

  if (token.mustChangePassword && pathname !== "/change-password") {
    const changePasswordUrl = request.nextUrl.clone();
    changePasswordUrl.pathname = "/change-password";
    changePasswordUrl.search = "";
    return NextResponse.redirect(changePasswordUrl);
  }

  if (!canAccessPath(token.role, pathname)) {
    const fallbackUrl = request.nextUrl.clone();
    fallbackUrl.pathname = token.mustChangePassword
      ? "/change-password"
      : getDefaultRouteForRole(token.role);
    fallbackUrl.search = "";
    return NextResponse.redirect(fallbackUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/change-password",
    "/dashboard/:path*",
    "/leads/:path*",
    "/lead-imports/:path*",
    "/lead-import-templates/:path*",
    "/customers/:path*",
    "/suppliers/:path*",
    "/products/:path*",
    "/fulfillment/:path*",
    "/live-sessions/:path*",
    "/orders/:path*",
    "/payment-records/:path*",
    "/collection-tasks/:path*",
    "/finance/:path*",
    "/gifts/:path*",
    "/shipping/:path*",
    "/reports/:path*",
    "/settings/:path*",
  ],
};

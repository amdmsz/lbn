import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { canAccessPath, getDefaultRouteForRole } from "@/lib/auth/access";

function assignInternalRoute(url: URL, route: string) {
  const destination = new URL(route, url.origin);
  url.pathname = destination.pathname;
  url.search = destination.search;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (pathname === "/login") {
    if (token?.role) {
      const redirectUrl = request.nextUrl.clone();
      assignInternalRoute(
        redirectUrl,
        token.mustChangePassword ? "/change-password" : getDefaultRouteForRole(token.role),
      );
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

  if (!canAccessPath(token.role, pathname, token.permissionCodes ?? [])) {
    const fallbackUrl = request.nextUrl.clone();
    assignInternalRoute(
      fallbackUrl,
      token.mustChangePassword ? "/change-password" : getDefaultRouteForRole(token.role),
    );
    return NextResponse.redirect(fallbackUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/change-password",
    "/mobile/:path*",
    "/dashboard/:path*",
    "/leads/:path*",
    "/lead-imports/:path*",
    "/lead-import-templates/:path*",
    "/customers/:path*",
    "/suppliers/:path*",
    "/products/:path*",
    "/recycle-bin/:path*",
    "/fulfillment/:path*",
    "/live-sessions/:path*",
    "/orders/:path*",
    "/payment-records/:path*",
    "/collection-tasks/:path*",
    "/finance/:path*",
    "/shipping/:path*",
    "/reports/:path*",
    "/settings/:path*",
  ],
};

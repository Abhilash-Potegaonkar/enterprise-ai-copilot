import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/auth.config";
import { getDashboardLoginRedirect } from "@/lib/auth/dashboard-protection";

const { auth } = NextAuth(authConfig);

export const proxy = auth((request) => {
  const loginRedirect = getDashboardLoginRedirect(
    Boolean(request.auth?.user.id),
    request.nextUrl,
  );

  if (!loginRedirect) {
    return NextResponse.next();
  }

  return NextResponse.redirect(loginRedirect);
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
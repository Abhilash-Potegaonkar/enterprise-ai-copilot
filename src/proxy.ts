import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/auth.config";

const { auth } = NextAuth(authConfig);

export const proxy = auth((request) => {
  if (request.auth?.user.id) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.nextUrl));
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
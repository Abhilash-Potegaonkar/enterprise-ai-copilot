import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/types";

const userRoles = ["ADMIN", "HR", "MANAGER", "EMPLOYEE"] as const satisfies readonly UserRole[];

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      return token;
    },
    session({ session, token }) {
      const role = userRoles.find((candidate) => candidate === token.role);

      if (typeof token.id !== "string" || !role) {
        throw new Error("Invalid authentication session");
      }

      session.user.id = token.id;
      session.user.role = role;
      return session;
    },
  },
} satisfies NextAuthConfig;
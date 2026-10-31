import type { NextAuthConfig } from "next-auth";

import { toolboxJwt } from "@/lib/toolbox-sso-session";

export const authConfig = {
  trustHost: true,
  session: { maxAge: 12 * 60 * 60 },
  pages: {
    signIn: "/api/toolbox-sso/start",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      return toolboxJwt(token, user, process.env);
    },
    session({ session, token }) {
      if (session.user && typeof token.email === "string") {
        session.user.email = token.email;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

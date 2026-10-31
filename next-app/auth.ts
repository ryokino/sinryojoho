import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { recheckIfDue } from "@/lib/toolbox-sso";
import {
  authorizeToolboxSso,
  TOOLBOX_PROVIDER_ID,
} from "@/lib/toolbox-sso-authjs";
import {
  readToolboxSession,
  toolboxJwt,
} from "@/lib/toolbox-sso-session";
import { authProviderIds } from "@/lib/auth-providers";

const toolboxProvider = Credentials({
  id: TOOLBOX_PROVIDER_ID,
  credentials: { code: {}, state: {} },
  authorize: (credentials, request) => authorizeToolboxSso(credentials, request),
});

export function selectAuthProviders(env: NodeJS.ProcessEnv) {
  if (authProviderIds(env).length === 0) return [];
  return [toolboxProvider];
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: selectAuthProviders(process.env),
  callbacks: {
    session: authConfig.callbacks.session,
    async jwt({ token, user }) {
      const next = toolboxJwt(token, user, process.env);
      if (next === null) return null;
      const session = readToolboxSession(next);
      if (session === null) return next;
      const checked = await recheckIfDue(session);
      if (checked.result === "denied" || checked.result === "expired") return null;
      next.toolbox = checked.session;
      if (typeof next.email === "string") {
        next.email = next.email.toLowerCase();
      }
      return next;
    },
  },
});

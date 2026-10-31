import "server-only";

// アプリの lib/toolbox-sso-authjs.ts に写す。
// 1 行目に import "server-only"; を足す。
// next-auth は import しない（ツールボックスのテストでアプリの依存なしに動かすため）。

import { exchangeCode, type ToolboxDeps } from "./toolbox-sso";
import { isHex64 } from "./toolbox-sso-contract";
import {
  parseCookieHeader,
  safeReturnPath,
  SSO_RETURN_COOKIE,
  SSO_STATE_COOKIE,
  SSO_COOKIE_PATH,
  type ToolboxSession,
} from "./toolbox-sso-session";

export const TOOLBOX_PROVIDER_ID = "toolbox-sso";

export type ToolboxAuthUser = {
  id: string;
  email: string;
  name: string | null;
  toolbox: ToolboxSession;
};

function credentialValue(credentials: unknown, key: string): unknown {
  if (typeof credentials !== "object" || credentials === null) return undefined;
  if (!Object.hasOwn(credentials, key)) return undefined;
  return Reflect.get(credentials, key);
}

export async function authorizeToolboxSso(
  credentials: unknown,
  request: Request,
  deps?: ToolboxDeps,
): Promise<ToolboxAuthUser | null> {
  const code = credentialValue(credentials, "code");
  const state = credentialValue(credentials, "state");
  if (!isHex64(code) || !isHex64(state)) return null;
  const cookieState = parseCookieHeader(request.headers.get("cookie"), SSO_STATE_COOKIE);
  if (cookieState !== state) return null;
  const exchanged = await exchangeCode(code, state, deps);
  if (exchanged.kind !== "ok") return null;
  return {
    id: exchanged.session.email,
    email: exchanged.session.email,
    name: null,
    toolbox: exchanged.session,
  };
}

function decodeCookieValue(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function clearedCookie(name: string): string {
  return `${name}=; Path=${SSO_COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function handleToolboxCallback(
  request: Request,
  signInWithCode: (
    code: string,
    state: string,
    returnTo: string,
  ) => Promise<"ok" | "denied" | "unavailable">,
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const queryState = url.searchParams.get("state");
  const cookieHeader = request.headers.get("cookie");
  const cookieState = parseCookieHeader(cookieHeader, SSO_STATE_COOKIE);
  const returnTo = safeReturnPath(
    decodeCookieValue(parseCookieHeader(cookieHeader, SSO_RETURN_COOKIE)),
  );
  const stateMatched = typeof cookieState === "string" && cookieState === queryState;
  let outcome: "ok" | "denied" | "unavailable" = "denied";
  if (stateMatched && typeof code === "string" && typeof queryState === "string") {
    outcome = await signInWithCode(code, queryState, returnTo);
  }
  const location = {
    ok: returnTo,
    denied: "/login?error=toolbox_denied",
    unavailable: "/login?error=toolbox_unavailable",
  }[outcome];
  const headers = new Headers();
  headers.set("Location", location);
  headers.append("Set-Cookie", clearedCookie(SSO_STATE_COOKIE));
  headers.append("Set-Cookie", clearedCookie(SSO_RETURN_COOKIE));
  return new Response(null, { status: 303, headers });
}

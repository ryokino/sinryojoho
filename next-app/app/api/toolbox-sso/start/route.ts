import { authorizeUrl, newState } from "@/lib/toolbox-sso";
import {
  safeReturnPath,
  SSO_COOKIE_MAX_AGE_SECONDS,
  SSO_COOKIE_PATH,
  SSO_RETURN_COOKIE,
  SSO_STATE_COOKIE,
} from "@/lib/toolbox-sso-session";

export function GET(request: Request) {
  const state = newState();
  const url = authorizeUrl(state);
  if (url === null) {
    return new Response("いまツールボックスに接続できません", { status: 503 });
  }
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get("returnTo"));
  const headers = new Headers({ Location: url });
  const common = `Path=${SSO_COOKIE_PATH}; Max-Age=${SSO_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
  headers.append("Set-Cookie", `${SSO_STATE_COOKIE}=${state}; ${common}`);
  headers.append("Set-Cookie", `${SSO_RETURN_COOKIE}=${encodeURIComponent(returnTo)}; ${common}`);
  return new Response(null, { status: 302, headers });
}

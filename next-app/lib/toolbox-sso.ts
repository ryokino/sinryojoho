import "server-only";

// 写し方: 各アプリの lib/toolbox-sso.ts に写す。
// 写したら 1 行目に `import "server-only";` を足す。
// `./toolbox-permissions.ts` と `./toolbox-sso-contract.ts` と `./toolbox-sso-session.ts` は、アプリでは `./toolbox-permissions` と `./toolbox-sso-contract` と `./toolbox-sso-session` に直す。
// APP_ID は toolbox-permissions.ts の方を書き換える。

import {
  APP_ID,
  checkToolboxPermission,
  resolveDeps,
  type ToolboxDeps,
} from "./toolbox-permissions";
import {
  buildAuthorizeUrl,
  buildLogoutUrl,
  buildTokenUrl,
  classifySsoTokenResponse,
  isHex64,
  type SsoReturnTarget,
  type SsoTokenRequest,
} from "./toolbox-sso-contract";
import { isToolboxSessionExpired, type ToolboxSession } from "./toolbox-sso-session";

export { CLOCK_SKEW_TOLERANCE_MS, MAX_SESSION_MS } from "./toolbox-sso-session";
export type { ToolboxSession } from "./toolbox-sso-session";
export type { ToolboxDeps };

export const SSO_APP_ID = APP_ID;
export const RECHECK_MS = 15 * 60 * 1000;

export type ExchangeResult =
  | { kind: "ok"; session: ToolboxSession }
  | { kind: "denied" }
  | { kind: "unavailable" };

export type RecheckResult = {
  result: "ok" | "denied" | "unavailable" | "expired";
  session: ToolboxSession;
};

function elapsed(now: () => number, started: number): number {
  return now() - started;
}

function errorReason(e: unknown): "timeout" | "network" {
  if (typeof DOMException !== "undefined" && e instanceof DOMException) {
    if (e.name === "TimeoutError" || e.name === "AbortError") return "timeout";
  }
  return "network";
}

function logSso(
  log: (line: string) => void,
  op: "exchange" | "recheck",
  result: string,
  ms: number,
  reason?: string,
): void {
  const reasonPart = reason === undefined ? "" : ` reason=${reason}`;
  log(`[toolbox-sso] app=${APP_ID} op=${op} result=${result}${reasonPart} ms=${ms}`);
}

function baseUrl(env: Record<string, string | undefined>): string | null {
  const baseRaw = env.TOOLBOX_BASE_URL;
  if (!baseRaw) return null;
  const base = baseRaw.replace(/\/+$/, "");
  return base.length > 0 ? base : null;
}

function returnTarget(env: Record<string, string | undefined>): SsoReturnTarget | undefined {
  return env.TOOLBOX_SSO_RETURN === "preview" ? "preview" : undefined;
}

function copySession(session: ToolboxSession): ToolboxSession {
  return {
    email: session.email,
    loginAt: session.loginAt,
    lastCheckedAt: session.lastCheckedAt,
  };
}

/** 64 桁の小文字 hex。crypto.getRandomValues で作る（Node と edge の両方で動く） */
export function newState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** ブラウザを送る先。env が無い、URL でない、state が 64 桁の小文字 hex でないなら null */
export function authorizeUrl(state: string, deps?: ToolboxDeps): string | null {
  if (!isHex64(state)) return null;
  const { env } = resolveDeps(deps);
  const base = baseUrl(env);
  if (base === null) return null;
  try {
    return buildAuthorizeUrl(base, APP_ID, state, returnTarget(env));
  } catch {
    return null;
  }
}

/** ログアウトの後にブラウザを送る先。env が無い、または URL でないなら null */
export function logoutUrl(deps?: ToolboxDeps): string | null {
  const { env } = resolveDeps(deps);
  const base = baseUrl(env);
  if (base === null) return null;
  try {
    return buildLogoutUrl(base, APP_ID, returnTarget(env));
  } catch {
    return null;
  }
}

/** callback で受け取った code を交換する。state はアプリの cookie の値と比べてから渡す */
export async function exchangeCode(
  code: unknown,
  state: unknown,
  deps?: ToolboxDeps,
): Promise<ExchangeResult> {
  const { fetch: doFetch, now, env, log } = resolveDeps(deps);
  const started = now();

  if (!isHex64(code) || !isHex64(state)) {
    logSso(log, "exchange", "denied", elapsed(now, started), "bad_input");
    return { kind: "denied" };
  }

  const base = baseUrl(env);
  const token = env.TOOLBOX_PERMISSIONS_TOKEN;
  if (base === null || !token) {
    logSso(log, "exchange", "unavailable", elapsed(now, started), "not_configured");
    return { kind: "unavailable" };
  }

  let tokenUrl: string;
  try {
    tokenUrl = buildTokenUrl(base, APP_ID);
  } catch {
    logSso(log, "exchange", "unavailable", elapsed(now, started), "not_configured");
    return { kind: "unavailable" };
  }

  let response: Response;
  try {
    response = await doFetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code, state } satisfies SsoTokenRequest),
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
      redirect: "error",
    });
  } catch (e) {
    logSso(log, "exchange", "unavailable", elapsed(now, started), errorReason(e));
    return { kind: "unavailable" };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const classified = classifySsoTokenResponse(response.status, body);
  const ms = elapsed(now, started);
  if (classified.kind === "ok") {
    const at = now();
    logSso(log, "exchange", "ok", ms);
    return {
      kind: "ok",
      session: {
        email: classified.value.email,
        loginAt: at,
        lastCheckedAt: at,
      },
    };
  }
  if (classified.kind === "denied") {
    logSso(log, "exchange", "denied", ms);
    return { kind: "denied" };
  }
  const reason = response.status === 200 ? "bad_response" : `http_${response.status}`;
  logSso(log, "exchange", "unavailable", ms, reason);
  return { kind: "unavailable" };
}

/** リクエストのたびに呼ぶ。15 分たっていなければ聞かない */
export async function recheckIfDue(session: ToolboxSession, deps?: ToolboxDeps): Promise<RecheckResult> {
  const { now, log } = resolveDeps(deps);
  const started = now();

  if (isToolboxSessionExpired(session, started)) {
    return { result: "expired", session: copySession(session) };
  }

  if (
    typeof session.lastCheckedAt === "number" &&
    Number.isFinite(session.lastCheckedAt) &&
    started >= session.lastCheckedAt &&
    started - session.lastCheckedAt < RECHECK_MS
  ) {
    return { result: "ok", session: copySession(session) };
  }

  const permission = await checkToolboxPermission(session.email, deps, session.loginAt);
  const at = now();
  const ms = at - started;
  if (permission.result === "allowed") {
    logSso(log, "recheck", "ok", ms);
    return {
      result: "ok",
      session: {
        email: session.email,
        loginAt: session.loginAt,
        lastCheckedAt: at,
      },
    };
  }
  if (permission.result === "denied") {
    logSso(log, "recheck", "denied", ms);
    return { result: "denied", session: copySession(session) };
  }
  logSso(log, "recheck", "unavailable", ms);
  return {
    result: "unavailable",
    session: {
      email: session.email,
      loginAt: session.loginAt,
      lastCheckedAt: at,
    },
  };
}

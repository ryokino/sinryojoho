// アプリの lib/toolbox-sso-session.ts に写す。
// edge の auth.config.ts から読む。このファイルにサーバ専用の import は足さない。

export const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
export const CLOCK_SKEW_TOLERANCE_MS = 60_000;
export const TOOLBOX_JWT_KEY = "toolbox";
export const SSO_STATE_COOKIE = "toolbox_sso_state";
export const SSO_RETURN_COOKIE = "toolbox_sso_return";
export const SSO_COOKIE_PATH = "/api/toolbox-sso";
export const SSO_COOKIE_MAX_AGE_SECONDS = 600;

// 氏名と役割は持たない（RYO-251）。v1 の session に残っている name・role は readToolboxSession が捨てる
export type ToolboxSession = {
  email: string;
  loginAt: number;
  lastCheckedAt: number;
};

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function own(value: object, key: string): unknown {
  if (!Object.hasOwn(value, key)) return undefined;
  return Reflect.get(value, key);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isToolboxSessionExpired(session: unknown, now: number): boolean {
  if (!isObject(session)) return true;
  const loginAt = own(session, "loginAt");
  if (!isFiniteNumber(loginAt)) return true;
  if (loginAt > now + CLOCK_SKEW_TOLERANCE_MS) return true;
  return now - loginAt >= MAX_SESSION_MS;
}

export function readToolboxSession(token: unknown): ToolboxSession | null {
  if (!isObject(token)) return null;
  const raw = own(token, TOOLBOX_JWT_KEY);
  if (!isObject(raw)) return null;
  const email = own(raw, "email");
  const loginAt = own(raw, "loginAt");
  const lastCheckedAt = own(raw, "lastCheckedAt");
  if (typeof email !== "string" || email.length === 0) return null;
  if (!isFiniteNumber(loginAt) || !isFiniteNumber(lastCheckedAt)) return null;
  return { email, loginAt, lastCheckedAt };
}

export function permissionsSource(env: Record<string, string | undefined>): "local" | "toolbox" {
  if (env.PERMISSIONS_SOURCE === "toolbox") return "toolbox";
  return "local";
}

export function safeReturnPath(raw: unknown): string {
  if (typeof raw !== "string" || raw === "") return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (raw.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  try {
    const resolved = new URL(raw, "http://x.invalid");
    if (resolved.origin !== "http://x.invalid" || resolved.pathname.startsWith("//")) return "/";
  } catch {
    return "/";
  }
  return raw;
}

export function parseCookieHeader(header: string | null, name: string): string | null {
  if (header === null) return null;
  let found: string | undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    const key = eq === -1 ? trimmed : trimmed.slice(0, eq);
    if (key !== name) continue;
    if (found !== undefined) return null;
    found = eq === -1 ? "" : trimmed.slice(eq + 1);
  }
  return found === undefined ? null : found;
}

export function toolboxJwt(
  token: Record<string, unknown>,
  user: unknown,
  env: Record<string, string | undefined>,
): Record<string, unknown> | null {
  if (isObject(user) && Object.hasOwn(user, "toolbox")) {
    token[TOOLBOX_JWT_KEY] = Reflect.get(user, "toolbox");
  }
  const session = readToolboxSession(token);
  if (session === null) {
    if (permissionsSource(env) === "toolbox") return null;
    return token;
  }
  if (isToolboxSessionExpired(session, Date.now())) return null;
  return token;
}

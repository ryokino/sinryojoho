import "server-only";

// 写し方: 各アプリの lib/toolbox-permissions.ts に写す。
// 写したら 1 行目に `import "server-only";` を足す。
// APP_ID をそのアプリの id（ツールボックス lib/whitelist-apps.ts の id）に書き換える。
// Vercel に env TOOLBOX_BASE_URL と TOOLBOX_PERMISSIONS_TOKEN を入れる。

export const APP_ID = "sinryojoho";
const TIMEOUT_MS = 3_000;

// 役割と氏名は返さない。アプリが自分の記録に持つ（RYO-249 の【決定】①、RYO-251）
export type ToolboxPermission = {
  result: "allowed" | "denied" | "unavailable";
  allowed: boolean;
};
export type ToolboxMember = { email: string };
export type ToolboxDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  env?: Record<string, string | undefined>;
  log?: (line: string) => void;
};

function denied(): ToolboxPermission {
  return { result: "denied", allowed: false };
}

function unavailable(): ToolboxPermission {
  return { result: "unavailable", allowed: false };
}

export function resolveDeps(deps?: ToolboxDeps): {
  fetch: typeof fetch;
  now: () => number;
  env: Record<string, string | undefined>;
  log: (line: string) => void;
} {
  return {
    fetch: deps?.fetch ?? fetch,
    now: deps?.now ?? Date.now,
    env: deps?.env ?? process.env,
    log: deps?.log ?? ((line: string) => console.info(line)),
  };
}

function readConfig(env: Record<string, string | undefined>): { base: string; token: string } | null {
  const baseRaw = env.TOOLBOX_BASE_URL;
  const token = env.TOOLBOX_PERMISSIONS_TOKEN;
  if (!baseRaw || !token) return null;
  const base = baseRaw.replace(/\/+$/, "");
  if (!base) return null;
  return { base, token };
}

function elapsed(now: () => number, started: number): number {
  return now() - started;
}

function errorReason(e: unknown): "timeout" | "network" {
  if (typeof DOMException !== "undefined" && e instanceof DOMException) {
    if (e.name === "TimeoutError" || e.name === "AbortError") return "timeout";
  }
  return "network";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logCheck(
  log: (line: string) => void,
  result: "allowed" | "denied" | "unavailable",
  ms: number,
  reason?: string,
): void {
  const reasonPart = reason === undefined ? "" : ` reason=${reason}`;
  log(`[toolbox-permissions] app=${APP_ID} result=${result}${reasonPart} ms=${ms}`);
}

function logMembers(
  log: (line: string) => void,
  result: "ok" | "error",
  ms: number,
  extra?: { reason?: string; count?: number },
): void {
  let line = `[toolbox-permissions] members app=${APP_ID} result=${result}`;
  if (extra?.reason !== undefined) line += ` reason=${extra.reason}`;
  if (extra?.count !== undefined) line += ` count=${extra.count}`;
  line += ` ms=${ms}`;
  log(line);
}

export async function checkToolboxPermission(
  email: unknown,
  deps?: ToolboxDeps,
  loginAt?: number,
): Promise<ToolboxPermission> {
  const { fetch: doFetch, now, env, log } = resolveDeps(deps);
  const started = now();
  if (typeof email !== "string" || email.trim().length === 0) {
    logCheck(log, "denied", elapsed(now, started), "bad_input");
    return denied();
  }

  const config = readConfig(env);
  if (!config) {
    logCheck(log, "unavailable", elapsed(now, started), "not_configured");
    return unavailable();
  }

  const normalized = email.trim().toLowerCase();
  let url = `${config.base}/api/permissions/check?app=${encodeURIComponent(APP_ID)}&email=${encodeURIComponent(normalized)}`;
  if (typeof loginAt === "number" && Number.isFinite(loginAt)) {
    url += `&loginAt=${Math.floor(loginAt)}`;
  }
  let response: Response;
  try {
    response = await doFetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
  } catch (e) {
    logCheck(log, "unavailable", elapsed(now, started), errorReason(e));
    return unavailable();
  }

  if (response.status !== 200) {
    logCheck(log, "unavailable", elapsed(now, started), `http_${response.status}`);
    return unavailable();
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    logCheck(log, "unavailable", elapsed(now, started), "bad_response");
    return unavailable();
  }

  if (!isRecord(body)) {
    logCheck(log, "unavailable", elapsed(now, started), "bad_response");
    return unavailable();
  }

  if (body.allowed === false) {
    logCheck(log, "denied", elapsed(now, started));
    return denied();
  }

  if (body.allowed === true) {
    logCheck(log, "allowed", elapsed(now, started));
    return { result: "allowed", allowed: true };
  }

  logCheck(log, "unavailable", elapsed(now, started), "bad_response");
  return unavailable();
}

function toMember(value: unknown): ToolboxMember | null {
  if (!isRecord(value) || typeof value.email !== "string") return null;
  return { email: value.email };
}

export async function listToolboxMembers(deps?: ToolboxDeps): Promise<ToolboxMember[] | null> {
  const { fetch: doFetch, now, env, log } = resolveDeps(deps);
  const started = now();
  const config = readConfig(env);
  if (!config) {
    logMembers(log, "error", elapsed(now, started), { reason: "not_configured" });
    return null;
  }

  const url = `${config.base}/api/permissions/members?app=${encodeURIComponent(APP_ID)}`;
  let response: Response;
  try {
    response = await doFetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
  } catch (e) {
    logMembers(log, "error", elapsed(now, started), { reason: errorReason(e) });
    return null;
  }

  if (response.status !== 200) {
    logMembers(log, "error", elapsed(now, started), { reason: `http_${response.status}` });
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    logMembers(log, "error", elapsed(now, started), { reason: "bad_response" });
    return null;
  }

  if (!isRecord(body) || !Array.isArray(body.members)) {
    logMembers(log, "error", elapsed(now, started), { reason: "bad_response" });
    return null;
  }

  const members = body.members.flatMap((item) => {
    const member = toMember(item);
    return member === null ? [] : [member];
  });
  logMembers(log, "ok", elapsed(now, started), { count: members.length });
  return members;
}

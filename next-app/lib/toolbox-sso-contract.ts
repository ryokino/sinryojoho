// このファイルは通行証の交換の決まりの正本である。
// ツールボックス（lib/sso-core.ts・app/api/sso/*）とアプリに写す部品（snippets/toolbox-sso.ts）の両方がこれを import する。
// アプリには lib/toolbox-sso-contract.ts として変えずに写す。
// 中身を変えるときは SSO_CONTRACT_VERSION を上げ、両方を同時に直す。
// 足すだけで今の URL が変わらない変更は上げない（RYO-113）

// 2：アプリが読むのを email だけにした（RYO-251）。ツールボックスは v1 の写しのため name・role も返し続ける
export const SSO_CONTRACT_VERSION = 2;

export const SSO_AUTHORIZE_PATH = "/api/sso/authorize"; // ツールボックス。GET ?app=&state=
export const SSO_TOKEN_PATH = "/api/sso/token"; // ツールボックス。POST ?app=、Bearer、body JSON
export const SSO_LOGOUT_PATH = "/api/sso/logout"; // ツールボックス。GET ?app=
export const SSO_CALLBACK_PATH = "/api/toolbox-sso/callback"; // アプリ。GET ?code=&state=

export const SSO_RETURN_PARAM = "return";
export const SSO_RETURN_PREVIEW = "preview";
export type SsoReturnTarget = typeof SSO_RETURN_PREVIEW;

export const SSO_CODE_TTL_SECONDS = 60;
export const SSO_TOKEN_BODY_MAX_CHARS = 1024;

const HEX64 = /^[a-f0-9]{64}$/;
const SSO_APP_ID = /^[a-z0-9-]{1,64}$/;

/** code と state の形。64 桁の小文字 hex */
export function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64.test(value);
}

/** アプリの id の形（RYO-28 の isValidAppId と同じ ^[a-z0-9-]{1,64}$） */
export function isSsoAppId(value: unknown): value is string {
  return typeof value === "string" && SSO_APP_ID.test(value);
}

/** POST /api/sso/token の body */
export type SsoTokenRequest = { code: string; state: string };

/** 200 の body のうちアプリが読むもの。email は小文字・trim 済み。氏名と役割はアプリが自分の記録に持つ（RYO-249 の【決定】①） */
export type SsoTokenSuccess = { email: string };

/** 200 以外の body */
export type SsoTokenErrorCode = "invalid_request" | "unauthorized" | "invalid_code" | "denied" | "unavailable";
export type SsoTokenError = { error: SsoTokenErrorCode };

/** エラーごとの HTTP status */
export const SSO_TOKEN_ERROR_STATUS: { readonly [K in SsoTokenErrorCode]: number } = {
  invalid_request: 400, // app・body の形が違う
  unauthorized: 401, // アプリのトークンが違う
  invalid_code: 401, // code が無い・期限切れ・使用済み・state 違い
  denied: 403, // 交換までの間に許可が外れた
  unavailable: 503, // ツールボックスの DB に届かない
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** ツールボックスが使う。body の文字列を読む。長すぎる・JSON でない・オブジェクトでない・code か state が isHex64 でない → null */
export function parseSsoTokenRequest(text: string): SsoTokenRequest | null {
  if (text.length > SSO_TOKEN_BODY_MAX_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isHex64(parsed.code) || !isHex64(parsed.state)) return null;
  return { code: parsed.code, state: parsed.state };
}

/** アプリが使う。200 の body を確かめる。email が空でない文字列のときだけ値を返す。email は trim・小文字にして返す。他のキー（name・role を含む）は見ずに捨てる */
export function parseSsoTokenSuccess(body: unknown): SsoTokenSuccess | null {
  if (!isRecord(body)) return null;
  if (typeof body.email !== "string" || body.email.trim().length === 0) return null;
  return { email: body.email.trim().toLowerCase() };
}

/** アプリが使う。交換の応答を 3 つに分ける。
 *  200 で parseSsoTokenSuccess が通る → { kind: "ok", value }
 *  status が 401 または 403 で、body.error が "invalid_code" か "denied" → { kind: "denied" }
 *  それ以外（200 で形が違う・"unauthorized"・400・503・その他） → { kind: "unavailable" }
 *  unauthorized（トークンの設定違い）は unavailable。アプリの設定の誤りを「この人は使えない」と見せない。 */
export function classifySsoTokenResponse(
  status: number,
  body: unknown,
): { kind: "ok"; value: SsoTokenSuccess } | { kind: "denied" } | { kind: "unavailable" } {
  if (status === 200) {
    const value = parseSsoTokenSuccess(body);
    if (value !== null) return { kind: "ok", value };
    return { kind: "unavailable" };
  }
  if (
    (status === 401 || status === 403) &&
    isRecord(body) &&
    (body.error === "invalid_code" || body.error === "denied")
  ) {
    return { kind: "denied" };
  }
  return { kind: "unavailable" };
}

export function parseSsoReturnTarget(raw: string | null): SsoReturnTarget | null | "invalid" {
  if (raw === null) return null;
  return raw === SSO_RETURN_PREVIEW ? SSO_RETURN_PREVIEW : "invalid";
}

function buildUrl(base: string, path: string, query: Record<string, string>): string {
  const url = new URL(base.replace(/\/+$/, "") + path);
  url.search = new URLSearchParams(query).toString();
  return url.href;
}

/** アプリが使う。ブラウザを送る先。base の末尾の "/" は消す */
export function buildAuthorizeUrl(
  toolboxBaseUrl: string,
  appId: string,
  state: string,
  target?: SsoReturnTarget,
): string {
  const query: Record<string, string> = { app: appId, state };
  if (target !== undefined) query[SSO_RETURN_PARAM] = target;
  return buildUrl(toolboxBaseUrl, SSO_AUTHORIZE_PATH, query);
}

/** アプリが使う */
export function buildTokenUrl(toolboxBaseUrl: string, appId: string): string {
  return buildUrl(toolboxBaseUrl, SSO_TOKEN_PATH, { app: appId });
}

/** アプリが使う */
export function buildLogoutUrl(toolboxBaseUrl: string, appId: string, target?: SsoReturnTarget): string {
  const query: Record<string, string> = { app: appId };
  if (target !== undefined) query[SSO_RETURN_PARAM] = target;
  return buildUrl(toolboxBaseUrl, SSO_LOGOUT_PATH, query);
}

/** ツールボックスが使う。アプリへ戻す先。appBaseUrl はツールボックスの WHITELIST_APPS の baseUrl */
export function buildCallbackUrl(appBaseUrl: string, code: string, state: string): string {
  return buildUrl(appBaseUrl, SSO_CALLBACK_PATH, { code, state });
}

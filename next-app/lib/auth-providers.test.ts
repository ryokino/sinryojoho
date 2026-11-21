import { describe, expect, it, afterEach } from "vitest";

import { authProviderIds } from "@/lib/auth-providers";
import {
  authorizeToolboxSso,
  TOOLBOX_PROVIDER_ID,
  ToolboxSsoUnavailableError,
} from "@/lib/toolbox-sso-authjs";
import { SSO_STATE_COOKIE } from "@/lib/toolbox-sso-session";

describe("authProviderIds", () => {
  const original = process.env.PERMISSIONS_SOURCE;

  afterEach(() => {
    if (original === undefined) delete process.env.PERMISSIONS_SOURCE;
    else process.env.PERMISSIONS_SOURCE = original;
  });

  it("returns toolbox provider id only when toolbox", () => {
    process.env.PERMISSIONS_SOURCE = "toolbox";
    expect(authProviderIds(process.env)).toEqual([TOOLBOX_PROVIDER_ID]);
  });

  it("returns empty for local and unknown", () => {
    delete process.env.PERMISSIONS_SOURCE;
    expect(authProviderIds(process.env)).toEqual([]);
    process.env.PERMISSIONS_SOURCE = "local";
    expect(authProviderIds(process.env)).toEqual([]);
    process.env.PERMISSIONS_SOURCE = "";
    expect(authProviderIds(process.env)).toEqual([]);
    process.env.PERMISSIONS_SOURCE = "unknown";
    expect(authProviderIds(process.env)).toEqual([]);
  });
});

const TOKEN = "test-token-a";
const EMAIL = "Foo@Example.COM";
const NORMALIZED = "foo@example.com";
const CODE = "ab".repeat(32);
const STATE = "cd".repeat(32);
const NOW = 1_700_000_000_000;

function configuredEnv(): Record<string, string | undefined> {
  return {
    TOOLBOX_BASE_URL: "https://toolbox.example/",
    TOOLBOX_PERMISSIONS_TOKEN: TOKEN,
  };
}

function assertNoSecrets(parts: string[]): void {
  const text = parts.join("\n");
  expect(text.includes(EMAIL)).toBe(false);
  expect(text.includes(NORMALIZED)).toBe(false);
  expect(text.includes(TOKEN)).toBe(false);
  expect(text.includes(CODE)).toBe(false);
  expect(text.includes(STATE)).toBe(false);
}

function ssoRequest(cookie?: string): Request {
  return new Request(
    `https://app.example/api/toolbox-sso/callback?code=${CODE}&state=${STATE}`,
    { headers: cookie === undefined ? undefined : { cookie } },
  );
}

describe("authorizeToolboxSso", () => {
  it("cookie の state が違うと null で fetch しない", async () => {
    let called = false;
    const user = await authorizeToolboxSso(
      { code: CODE, state: STATE },
      ssoRequest(`${SSO_STATE_COOKIE}=${"ef".repeat(32)}`),
      {
        env: configuredEnv(),
        now: () => NOW,
        log: () => {},
        fetch: async () => {
          called = true;
          return Response.json({ email: EMAIL, name: "Ann", role: "STAFF" });
        },
      },
    );
    expect(called).toBe(false);
    expect(user).toBeNull();
  });

  it("exchangeCode が denied なら null", async () => {
    const user = await authorizeToolboxSso(
      { code: CODE, state: STATE },
      ssoRequest(`${SSO_STATE_COOKIE}=${STATE}`),
      {
        env: configuredEnv(),
        now: () => NOW,
        log: () => {},
        fetch: async () =>
          Response.json({ error: "invalid_code" }, { status: 401 }),
      },
    );
    expect(user).toBeNull();
  });

  it.each([
    ["503", configuredEnv(), async () => Response.json({ error: "unavailable" }, { status: 503 })],
    [
      "fetch が例外",
      configuredEnv(),
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
    [
      "env 無し",
      {},
      async () => Response.json({ email: EMAIL, name: "Ann", role: "STAFF" }),
    ],
  ] as const)(
    "exchangeCode が unavailable（%s）なら ToolboxSsoUnavailableError を投げる",
    async (_label, env, fetchImpl) => {
      const lines: string[] = [];
      let err: unknown;
      try {
        await authorizeToolboxSso(
          { code: CODE, state: STATE },
          ssoRequest(`${SSO_STATE_COOKIE}=${STATE}`),
          {
            env,
            now: () => NOW,
            log: (line) => lines.push(line),
            fetch: fetchImpl,
          },
        );
      } catch (e: unknown) {
        err = e;
      }
      expect(err).toBeInstanceOf(ToolboxSsoUnavailableError);
      const thrown = err as Error;
      expect(thrown.name).toBe("ToolboxSsoUnavailableError");
      expect(thrown.name).not.toBe("CredentialsSignin");
      assertNoSecrets([...lines, thrown.message, String(thrown.stack ?? "")]);
    },
  );

  it("code と state が cookie と揃うと ToolboxSession を返す", async () => {
    const user = await authorizeToolboxSso(
      { code: CODE, state: STATE },
      ssoRequest(`${SSO_STATE_COOKIE}=${STATE}`),
      {
        env: configuredEnv(),
        now: () => NOW,
        log: () => {},
        fetch: async () =>
          Response.json({ email: EMAIL, name: "Ann", role: "STAFF" }),
      },
    );
    expect(user).toEqual({
      id: NORMALIZED,
      email: NORMALIZED,
      name: null,
      toolbox: {
        email: NORMALIZED,
        loginAt: NOW,
        lastCheckedAt: NOW,
      },
    });
  });
});

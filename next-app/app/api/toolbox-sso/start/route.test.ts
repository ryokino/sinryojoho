import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/toolbox-sso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/toolbox-sso")>();
  return {
    ...actual,
    authorizeUrl: vi.fn(),
  };
});

import { GET } from "@/app/api/toolbox-sso/start/route";
import { authorizeUrl } from "@/lib/toolbox-sso";
import {
  SSO_RETURN_COOKIE,
  SSO_STATE_COOKIE,
} from "@/lib/toolbox-sso-session";

describe("GET /api/toolbox-sso/start", () => {
  afterEach(() => {
    vi.mocked(authorizeUrl).mockReset();
  });

  it("redirects with SSO cookies when authorizeUrl succeeds", async () => {
    vi.mocked(authorizeUrl).mockReturnValue("https://toolbox.example/sso");
    const response = await GET(
      new Request("http://localhost:3000/api/toolbox-sso/start?returnTo=%2Fdashboard"),
    );
    expect(response.status).toBe(302);
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${SSO_STATE_COOKIE}=`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${SSO_RETURN_COOKIE}=`))).toBe(true);
    for (const cookie of cookies) {
      expect(cookie).toContain("Path=/api/toolbox-sso");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Lax");
    }
  });

  it("sanitizes evil returnTo to root", async () => {
    vi.mocked(authorizeUrl).mockReturnValue("https://toolbox.example/sso");
    const response = await GET(
      new Request(
        "http://localhost:3000/api/toolbox-sso/start?returnTo=%2F%2Fevil.example",
      ),
    );
    const ret = response.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${SSO_RETURN_COOKIE}=`));
    expect(ret).toContain(encodeURIComponent("/"));
  });

  it("returns unavailable message when authorizeUrl is null", async () => {
    vi.mocked(authorizeUrl).mockReturnValue(null);
    const response = await GET(
      new Request("http://localhost:3000/api/toolbox-sso/start"),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("いまツールボックスに接続できません");
  });
});

import { describe, expect, it } from "vitest";

import { decideAccess } from "@/lib/access";

describe("decideAccess", () => {
  it("allows all paths when local", () => {
    expect(
      decideAccess({ pathname: "/", signedIn: false, source: "local" }),
    ).toBe("allow");
    expect(
      decideAccess({ pathname: "/foo", signedIn: false, source: "local" }),
    ).toBe("allow");
  });

  it("requires login for toolbox when signed out", () => {
    expect(
      decideAccess({ pathname: "/", signedIn: false, source: "toolbox" }),
    ).toBe("login");
  });

  it("allows toolbox SSO and auth API paths without session", () => {
    for (const pathname of [
      "/api/toolbox-sso/start",
      "/api/toolbox-sso/callback",
      "/api/auth/session",
    ]) {
      expect(
        decideAccess({ pathname, signedIn: false, source: "toolbox" }),
      ).toBe("allow");
    }
  });

  it("allows the login error page without session (no redirect loop)", () => {
    expect(
      decideAccess({ pathname: "/login", signedIn: false, source: "toolbox" }),
    ).toBe("allow");
    expect(
      decideAccess({ pathname: "/login/x", signedIn: false, source: "toolbox" }),
    ).toBe("login");
  });

  it("allows toolbox app paths when signed in", () => {
    expect(
      decideAccess({ pathname: "/", signedIn: true, source: "toolbox" }),
    ).toBe("allow");
  });
});


import { describe, expect, it, afterEach } from "vitest";

import { authProviderIds } from "@/lib/auth-providers";
import { TOOLBOX_PROVIDER_ID } from "@/lib/toolbox-sso-authjs";

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

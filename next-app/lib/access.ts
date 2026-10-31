export type PermissionsSource = "local" | "toolbox";

export type AccessDecision = "allow" | "login";

export function decideAccess(input: {
  pathname: string;
  signedIn: boolean;
  source: PermissionsSource;
}): AccessDecision {
  if (input.source === "local") return "allow";
  if (
    input.pathname.startsWith("/api/auth/") ||
    input.pathname.startsWith("/api/toolbox-sso/")
  ) {
    return "allow";
  }
  return input.signedIn ? "allow" : "login";
}

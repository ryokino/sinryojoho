import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { decideAccess } from "@/lib/access";
import { permissionsSource } from "@/lib/toolbox-sso-session";

export default auth((request) => {
  if (permissionsSource(process.env) === "local") {
    return NextResponse.next();
  }

  const signedIn = !!request.auth;
  const decision = decideAccess({
    pathname: request.nextUrl.pathname,
    signedIn,
    source: "toolbox",
  });

  if (decision === "login") {
    const returnTo = encodeURIComponent(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(
      new URL(`/api/toolbox-sso/start?returnTo=${returnTo}`, request.url),
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

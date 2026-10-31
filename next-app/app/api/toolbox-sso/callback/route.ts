import { CredentialsSignin } from "next-auth";

import { signIn } from "@/auth";
import {
  handleToolboxCallback,
  TOOLBOX_PROVIDER_ID,
} from "@/lib/toolbox-sso-authjs";

export function GET(request: Request) {
  return handleToolboxCallback(request, async (code, state, returnTo) => {
    try {
      await signIn(TOOLBOX_PROVIDER_ID, {
        code,
        state,
        redirect: false,
        redirectTo: returnTo,
      });
      return "ok";
    } catch (e) {
      return e instanceof CredentialsSignin ? "denied" : "unavailable";
    }
  });
}

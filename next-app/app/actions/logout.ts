"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { logoutUrl } from "@/lib/toolbox-sso";
import { permissionsSource } from "@/lib/toolbox-sso-session";

export async function logoutAction(): Promise<void> {
  if (permissionsSource(process.env) !== "toolbox") {
    return;
  }

  await signOut({ redirect: false });
  const target = logoutUrl();
  if (target === null) {
    throw new Error("いまツールボックスに接続できません");
  }
  redirect(target);
}

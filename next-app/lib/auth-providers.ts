import { TOOLBOX_PROVIDER_ID } from "@/lib/toolbox-sso-authjs";
import { permissionsSource } from "@/lib/toolbox-sso-session";

/** Auth.js provider 配列の id をテスト可能にする薄いヘルパー */
export function authProviderIds(env: NodeJS.ProcessEnv): string[] {
  if (permissionsSource(env) !== "toolbox") return [];
  return [TOOLBOX_PROVIDER_ID];
}

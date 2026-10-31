import Link from "next/link";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    error === "toolbox_denied"
      ? "このアプリを使う許可がありません。ツールボックスの管理者に頼んでください。"
      : error === "toolbox_unavailable"
        ? "いまツールボックスに接続できません"
        : null;

  return (
    <main className="mx-auto max-w-md p-8">
      {message ? <p className="mb-4 text-slate-800">{message}</p> : null}
      <Link
        href="/api/toolbox-sso/start?returnTo=%2F"
        className="text-blue-700 underline"
      >
        ツールボックスでログイン
      </Link>
    </main>
  );
}

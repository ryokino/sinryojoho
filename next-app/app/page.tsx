import MedicalForm from "@/components/MedicalForm";
import LivePreview from "@/components/LivePreview";
import { logoutAction } from "@/app/actions/logout";
import { permissionsSource } from "@/lib/toolbox-sso-session";

export default function Home() {
  const toolboxMode = permissionsSource(process.env) === "toolbox";

  return (
    <main className="flex min-h-screen flex-col md:flex-row bg-slate-50">
      {toolboxMode ? (
        <form action={logoutAction} className="fixed top-4 right-4 z-50">
          <button
            type="submit"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
          >
            ログアウト
          </button>
        </form>
      ) : null}
      <div className="w-full md:w-1/2 p-6 overflow-y-auto h-screen border-r border-slate-200">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6 text-slate-800">診療情報提供書 作成</h1>
          <MedicalForm />
        </div>
      </div>
      <div className="w-full md:w-1/2 p-6 bg-slate-100 h-screen overflow-y-auto sticky top-0">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold mb-4 text-slate-700">プレビュー</h2>
          <LivePreview />
        </div>
      </div>
    </main>
  );
}

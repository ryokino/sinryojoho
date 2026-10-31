# 診療情報提供書（Next.js）

Vercel の **Root Directory** は `next-app` に設定してください。

## ログイン（tool-box SSO）

| 変数名 | 説明 |
| --- | --- |
| `PERMISSIONS_SOURCE` | 未設定または `local` … ログインなし（今までどおり）。`toolbox` … 全ページでツールボックス SSO 必須 |
| `AUTH_SECRET` | Auth.js 用（`toolbox` のとき必須） |
| `TOOLBOX_BASE_URL` | ツールボックス本体 URL |
| `TOOLBOX_PERMISSIONS_TOKEN` | permissions API 合言葉 |
| `TOOLBOX_SSO_RETURN` | Preview では `preview` を指定することがある |

切り替え: Vercel で `PERMISSIONS_SOURCE=toolbox` と上記を設定。  
戻し方: `PERMISSIONS_SOURCE` を削除するか `local` に戻す（Google 等の別方式は無し）。

Streamlit 版（リポ直下）は本番 chiavedisol 側のまま。Next.js 版は OAuth コールバック用 Route Handler が必要なため採用。

## 開発

```bash
npm ci
npm run dev
```

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

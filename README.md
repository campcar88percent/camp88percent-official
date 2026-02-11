# NAGO CAMP — ローカル開発サーバー

このリポジトリは静的なフロントエンド（`index.html`, `style.css`, `script.js`）と、AI 呼び出しを安全に行うための簡易プロキシ（`/api/genai`）を含みます。

セットアップ手順（macOS / Node.js）:

1. 依存関係をインストール

```bash
cd "$(dirname "$0")"
npm install
```

2. 環境変数を設定

```bash
cp .env.example .env
# .env に OPENAI_API_KEY を設定してください
```

3. サーバーを起動

```bash
npm run dev
# または
npm start
```

4. ブラウザで開く

http://localhost:3000

使い方:
- フロントエンドの `script.js` が `/api/genai` に POST (body: { prompt }) します。
- サーバーは `OPENAI_API_KEY` を使って OpenAI の Chat Completions API を呼び出し、生成されたテキストを返します。

注意:
- 本サーバーは開発用途向けの簡易プロキシです。本番環境では認証、レート制限、ログ保存、CSP などを強化してください。

# 88CAMPCAR - 予約・管理システム

静的LP (`index.html`) と Express サーバー (`server/index.js`) を組み合わせた、
キャンピングカーレンタル向けの予約システムです。

## 主な機能

- 予約フォーム（免許証 表/裏アップロード必須）
- 二重予約防止（1台運用向け）
- 予約データ保存 (`reservations.json`)
- 管理画面 (`admin.html`) で予約一覧・ステータス更新・削除
- 管理画面認証（HTTP Only Cookie + CSRF対策）
- 管理操作監査ログ (`admin-audit.log`)

## セットアップ

1. 依存関係をインストール

```bash
npm install
```

1. 管理者パスワードハッシュを生成

```bash
npm run gen:admin-hash "your_admin_password"
```

1. 環境変数を設定

```bash
cp .env.example .env
# .env の ADMIN_PASS_HASH に生成結果を貼り付け
```

1. サーバー起動

```bash
npm run dev
# または
npm start
```

1. 確認URL

- LP: <http://localhost:3000>
- 管理画面: <http://localhost:3000/admin.html>

## 必須環境変数

- `ADMIN_PASS_HASH`: 管理ログイン用ハッシュ（必須）

## 任意環境変数

- `ADMIN_EMAIL`: 管理者通知メール送信先
- `SMTP_USER`: Gmailアドレス
- `SMTP_PASS`: Gmailアプリパスワード
- `BASE_URL`: メール本文のリンク生成用
- `PORT`: サーバーポート（既定: 3000）

## 主要API

- `POST /api/reserve` 予約登録（multipart/form-data）
- `GET /api/reservations/dates` 予約済み日付一覧
- `POST /api/contact` 問い合わせ送信
- `POST /api/admin/login` 管理ログイン
- `POST /api/admin/logout` 管理ログアウト
- `GET /api/admin/csrf` 管理画面CSRFトークン
- `GET /api/admin/reservations` 予約一覧取得
- `PATCH /api/admin/reservations/:id` ステータス更新
- `DELETE /api/admin/reservations/:id` 予約削除

## 監査ログ

- ファイル: `admin-audit.log`
- 自動ローテーション: 5MBごと、最大5世代保持

## Render デプロイ（本番URL運用）

1. Renderで `Blueprint` か `New Web Service` を作成し、`render.yaml` を使用
2. 環境変数を設定

- `ADMIN_PASS_HASH`（必須）
- `ADMIN_EMAIL`
- `SMTP_USER`
- `SMTP_PASS`
- `BASE_URL`（例: `https://88campcar.onrender.com`）

1. `BASE_URL` は必ず本番URL（https）にする

- メール内の「管理画面を開く」リンク生成に使用されます
- `localhost` のままだと iPhone から開けません

1. 永続データ保存

- `DATA_DIR=/opt/render/project/src/storage` を使用
- 以下が永続ディスクに保存されます
- `reservations.json`
- `admin-audit.log`
- `uploads/`（免許証画像）

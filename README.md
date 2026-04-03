# feminista

F# + Fable + Feliz で作った `AI Feminista` チャットアプリです。

## セットアップ

```bash
cp .env.example .env.local
```

`.env.local` に Anthropic API キーを設定してください。

```env
ANTHROPIC_API_KEY=sk-ant-...
```

開発時は `VITE_ANTHROPIC_API_KEY` も引き続き使えますが、本番起動では `ANTHROPIC_API_KEY` を推奨します。

## ローカル開発

```bash
npm install
npm run dev
```

Vite 開発サーバーが `http://localhost:5173` で起動します。

## 本番起動

```bash
npm run start
```

Node サーバーが `http://localhost:3000` で起動し、

- `dist/` の静的ファイル配信
- `/api/anthropic/messages` のサーバー側中継

をまとめて担当します。

もし `dist/` がまだ無い場合は、サーバーが Vite middleware を使ってアプリをその場で配信します。まずはこのフォールバックで安全に動かし、その後 `npm run build` が通る環境では静的配信へ切り替える想定です。

`npm run prod` も同じ起動です。

```bash
npm run prod
```

## 静的ビルド

```bash
npm run build
```

成果物は `dist/` に出力されます。`dist/` が存在すると、本番サーバーはそちらを優先して配信します。

## 本番向けのポイント

- API キーはブラウザへ渡さず、Node サーバー側だけで保持します
- フロントエンドは相対パス `/api/anthropic/messages` にだけ送信します
- `PORT` 環境変数を設定すると待受ポートを変更できます

## 仕様

- モデル: `claude-haiku-4-5-20251001`
- UI は Feliz で実装
- デザインは指定 HTML/CSS をベースに再現

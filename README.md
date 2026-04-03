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

`npm install` 時に `dotnet tool restore` が走り、ローカルの Fable CLI も復元されます。

Fable CLI が `src/App.fs` を `src/App.fs.js` に変換し、その後 Vite 開発サーバーが `http://localhost:5173` で起動します。

## 本番起動

```bash
npm run start
```

Node サーバーが `http://localhost:3000` で起動し、

- `dist/` の静的ファイル配信
- `/api/anthropic/messages` のサーバー側中継

をまとめて担当します。`npm run start` は `.env.local` を自動読込しないので、本番ホスティングでもそのまま使えます。

ローカルで `.env.local` を使って確認したいときは、こちらです。

```bash
npm run start:local
```

もし `dist/` がまだ無い場合は、サーバーが Vite middleware を使ってアプリをその場で配信します。

`npm run prod` も同じ起動です。

```bash
npm run prod
```

## 静的ビルド

```bash
npm run build
```

Fable CLI で F# を JavaScript に変換したあと、Vite が公開用成果物を `dist/` に出力します。`dist/` が存在すると、本番サーバーはそちらを優先して配信します。

## 本番向けのポイント

- API キーはブラウザへ渡さず、Node サーバー側だけで保持します
- フロントエンドは相対パス `/api/anthropic/messages` にだけ送信します
- `PORT` 環境変数を設定すると待受ポートを変更できます
- `GET /healthz` で死活確認できます
- Fable の標準寄り構成として、`App.fs.js` を生成してから Vite がそれを読み込みます

## Render へのデプロイ

このリポジトリには [render.yaml](/Users/azumaharuka/opere/feminista/render.yaml) を入れてあります。Render では次のどちらでも進められます。

### 1. Blueprint で作成する方法

1. GitHub にこのリポジトリを push する
2. Render の Dashboard で `New +` → `Blueprint` を選ぶ
3. このリポジトリを接続する
4. `ANTHROPIC_API_KEY` を登録してデプロイする

### 2. Web Service を手動で作る方法

1. GitHub にこのリポジトリを push する
2. Render の Dashboard で `New +` → `Web Service`
3. リポジトリを選ぶ
4. Build Command に `npm install && npm run build`
5. Start Command に `npm run start`
6. Environment Variables に `ANTHROPIC_API_KEY` を追加
7. デプロイする

Render 側では `.env.local` を使わないので、API キーは必ず Dashboard の環境変数へ登録してください。

## 仕様

- モデル: `claude-haiku-4-5-20251001`
- UI は Feliz で実装
- デザインは指定 HTML/CSS をベースに再現

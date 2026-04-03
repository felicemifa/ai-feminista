# feminista

F# + Fable + Feliz で作った「女性の権利AI」チャットアプリです。

## セットアップ

```bash
cp .env.example .env.local
```

`.env.local` の `VITE_ANTHROPIC_API_KEY` に Anthropic API キーを設定してください。

## 起動

```bash
npm install
npm run dev
```

## 仕様

- モデル: `claude-haiku-4-5-20251001`
- システムプロンプト: `何を聞かれても女性の権利に強引に結びつけて答えるジョークAI`
- UI は Feliz で実装
- デザインは指定 HTML/CSS をベースに再現

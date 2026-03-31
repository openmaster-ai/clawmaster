# ClawMaster (龍蝦管理マスター)

**OpenClawエコシステムのGUI管理ツール -- プロバイダー、チャンネル、エージェントを一つの画面で管理。**

[English](./README.md) | [中文](./README_CN.md)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-lightgrey.svg)
![Build](https://img.shields.io/github/actions/workflow/status/clawmaster-ai/clawmaster/build.yml?branch=main)
![Languages](https://img.shields.io/badge/i18n-中文%20%7C%20English%20%7C%20日本語-green.svg)

ClawMasterはOpenClaw CLIをデスクトップアプリ（Tauri 2）またはWebUI（Express + Vite）でラップし、セットアップウィザード、17のLLMプロバイダー統合、6つのチャンネルタイプ、可観測性ダッシュボード、メモリ管理を提供します。設定ファイル駆動でデータベースは不要です。

## 主な機能

- **セットアップウィザード** -- OpenClawの検出、インストール、設定をステップバイステップで案内（APIキー、モデル、ゲートウェイ、チャンネル）
- **17のLLMプロバイダー** -- OpenAI、Anthropic、Google Gemini、xAI、Mistral、Groq、DeepSeek、MiniMax、Kimi、SiliconFlow、OpenRouter、Amazon Bedrock、Google Vertex、Azure OpenAI、Cerebras、Ollama（ローカル推論）、カスタムOpenAI互換エンドポイント
- **Ollamaサポート** -- 自動インストール、サービス起動、モデルプルをGUIから実行
- **APIキー検証** -- 保存前に実際のHTTPリクエストで検証
- **6つのチャンネルタイプ** -- Discord、Slack、Telegram、Feishu（飛書）、WeChat（QRスキャン）、WhatsApp（QRスキャン）
- **チャンネル設定ガイド** -- ステップバイステップのナビゲーション、Feishu権限テンプレート（26スコープ、ワンクリックコピー）
- **可観測性ダッシュボード** -- ClawProbe連携によるコスト、トークン使用量、コンテキストヘルス表示
- **セッション管理** -- ターンごとの会話履歴ビューア
- **メモリ管理** -- PowerMem連携によるメモリライフサイクル管理
- **スキルマーケット** -- ClawHub連携によるスキルの検索・インストール・アンインストール
- **国際化** -- 中国語、英語、日本語（400以上の翻訳キー）；ヘッダーとウィザードで言語切替
- **ダークモード** とカラーテーマ（ロブスターオレンジ、オーシャンブルー）
- **レスポンシブレイアウト** -- モバイルハンバーガーメニュー対応
- **デスクトップビルド** -- Linux（deb、rpm、AppImage）、macOS（dmg）、Windows（msi）
- **CI/CD** -- テストゲート（tsc + vitest）後にマルチプラットフォームTauriビルドとリリース

## クイックスタート

### リリースをダウンロード

[Releases](https://github.com/clawmaster-ai/clawmaster/releases) ページからお使いのプラットフォーム向けの最新インストーラーをダウンロードしてください。

### ソースからビルド

```bash
git clone https://github.com/clawmaster-ai/clawmaster.git
cd clawmaster
npm install

# Webモード（フロントエンド + バックエンド）
npm run dev:web

# デスクトップモード（Tauri）
npm run tauri:dev

# プロダクションビルド
npm run build         # web
npm run tauri:build   # デスクトップ
```

Node.js 20以上が必要です。デスクトップビルドにはRust 1.77以上とプラットフォーム固有のシステムライブラリも必要です（[Tauriの前提条件](https://tauri.app/start/prerequisites/)を参照）。

## スクリーンショット

> 近日公開予定。

## アーキテクチャ

```
clawmaster/
├── packages/web/          React 18 + Vite + Tailwind CSS フロントエンド
│   └── src/
│       ├── modules/       機能モジュール（setup, observe, memory, sessions）
│       ├── shared/        アダプター、フック、共通コンポーネント
│       ├── pages/         レガシーページコンポーネント
│       └── i18n/          翻訳ファイル（zh, en, ja）
├── packages/backend/      Express APIサーバー（ポート3001）+ WebSocketログ
├── src-tauri/             Tauri 2 Rustバックエンド（9コマンド）
├── tests/ui/              YAMLベースのUIテストプラン
└── bin/clawmaster.mjs     CLIエントリーポイント
```

2つの実行モード：
- **デスクトップ**：Reactが `@tauri-apps/api` のinvokeでRustコマンドを呼び出し
- **Web**：Reactが `/api` リクエストをExpressバックエンドにプロキシ（Vite開発プロキシ 3000 -> 3001）

新機能は `packages/web/src/modules/` に機能モジュールとして構築し、`import.meta.glob` で自動検出されます。

## 開発

```bash
npm install               # すべてのワークスペース依存関係をインストール
npm run dev               # フロントエンドのみ（ポート3000）
npm run dev:web           # フロントエンド + バックエンド
npm run dev:backend       # Expressバックエンドのみ（ポート3001）
npm run tauri:dev         # デスクトップアプリ

npm test                  # すべてのテストを実行（vitest）
npm run build             # Webプロダクションビルド
npm run tauri:build       # デスクトッププロダクションビルド
```

## コントリビューション

コントリビューションを歓迎します：

1. リポジトリをフォーク
2. `main` からフィーチャーブランチを作成
3. 変更を加え、必要に応じてテストを追加
4. `npm test` を実行し、TypeScriptのコンパイルが通ることを確認
5. プルリクエストを作成

リリース履歴は [CHANGELOG.md](./CHANGELOG.md) を参照してください。

## ライセンス

MIT -- [LICENSE](./LICENSE) を参照。

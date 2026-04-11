# ClawMaster

**OpenClaw の統合コントロールプレーン。ランタイム、チャンネル、スキル、プラグイン、MCP、可観測性を 1 つの UI で管理できます。**

[English](./README.md) | [中文](./README_CN.md)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-lightgrey.svg)
![Build](https://img.shields.io/github/actions/workflow/status/clawmaster-ai/clawmaster/build.yml?branch=main)
![Languages](https://img.shields.io/badge/i18n-中文%20%7C%20English%20%7C%20日本語-green.svg)

ClawMaster は OpenClaw エコシステムをデスクトップアプリ（Tauri）と Web コンソール（Express + Vite）として扱いやすくした管理 UI です。日々のインストール、設定、確認、運用を、設定ファイルの手編集に頼りすぎず進められるようにします。

## ClawMaster を使う理由

- **立ち上がりが速い**: OpenClaw、プロバイダー、モデル、ゲートウェイ、チャンネルをセットアップウィザードで初期化できます。
- **管理対象を 1 か所に集約**: モデル、エージェント、セッション、メモリ、プラグイン、スキル、MCP、設定をまとめて扱えます。
- **運用状態を可視化**: ClawProbe ベースで状態、トークン使用量、コンテキスト健全性、コストを確認できます。
- **2 つの実行形態**: ローカル向けデスクトップアプリとしても、ブラウザベースの Web 管理画面としても利用できます。
- **設定ファイル中心**: OpenClaw の既存の設定モデルを前提にし、別のデータベース層を持ち込みません。

## できること

- **インストールと Profile 管理**
  OpenClaw の検出、不足コンポーネントの導入、Profile の作成や切り替え、初期ブートストラップを行えます。

- **モデルとプロバイダー設定**
  OpenAI 互換エンドポイントや各種プロバイダーを設定し、API キーを検証し、既定モデルを選べます。

- **ゲートウェイとチャンネル**
  ゲートウェイを起動し、Feishu、WeChat、Discord、Slack、Telegram、WhatsApp などの接続設定をガイド付きで進められます。

- **プラグイン、スキル、MCP**
  インストール済み機能の有効化と無効化、注目項目の導入、MCP サーバーの手動追加、既存ツール設定からの MCP 取り込みができます。

- **セッション、メモリ、可観測性**
  セッションを確認し、メモリバックエンドを管理し、ClawProbe の状態、トークン使用量、コスト見積もりを追跡できます。

## クイックスタート

### 方法 1: デスクトップ版をダウンロード

[GitHub Releases](https://github.com/clawmaster-ai/clawmaster/releases) から利用中のプラットフォーム向けインストーラーを取得してください。

現在の CI ビルド対象:
- Linux x64: `.deb`, `.rpm`, `.AppImage`
- macOS Intel: `.dmg`
- macOS Apple Silicon: `.dmg`
- Windows x64: `.msi`, `.exe`

未リリースの QA ビルドについては、GitHub Actions の workflow artifacts から各プラットフォーム成果物を取得できます。

### 方法 2: ソースから実行

```bash
git clone https://github.com/clawmaster-ai/clawmaster.git
cd clawmaster
npm install

# Web コンソール + バックエンド
npm run dev:web

# デスクトップアプリ
npm run tauri:dev
```

### 方法 3: サービス CLI をインストール

```bash
npm i -g clawmaster
clawmaster doctor
clawmaster serve --daemon
clawmaster status
```

既定のサービス URL:
- `http://127.0.0.1:3001`
- `clawmaster serve` はサービストークンを表示します。ブラウザ UI ではそのトークンを入力してください。

よく使うコマンド:
- `clawmaster serve --host 127.0.0.1 --port 3001`
- `clawmaster serve --host 127.0.0.1 --port 3001 --daemon`
- `clawmaster serve --host 127.0.0.1 --port 3001 --token your-own-token`
- `clawmaster status`
- `clawmaster status --token your-own-token`
- `clawmaster stop`
- `clawmaster doctor`

本番ビルド:

```bash
npm run build
npm run tauri:build
```

必要環境:
- Node.js 20 以上
- デスクトップビルドには Rust と各 OS 向けの Tauri 前提ライブラリ
- 参考: [Tauri prerequisites](https://tauri.app/start/prerequisites/)

## 初回起動の流れ

1. ClawMaster を起動します。
2. 既存の OpenClaw Profile を選ぶか、新しく作成します。
3. 少なくとも 1 つのモデルプロバイダーを接続し、既定モデルを設定します。
4. ランタイム確認が必要ならゲートウェイまたは可観測機能を有効にします。
5. 必要に応じてチャンネル、プラグイン、スキル、MCP サーバーを追加します。

## 開発

```bash
npm install

# フロントエンドのみ
npm run dev

# フロントエンド + バックエンド
npm run dev:web

# バックエンドのみ
npm run dev:backend

# Tauri デスクトップ
npm run tauri:dev
```

## テストと CI

ローカル確認:

```bash
npm test
npm run build
```

現在の CI がカバーする内容:
- TypeScript チェックと単体テスト
- バックエンド API のスモークチェック
- Web ページ描画のスモーク確認
- 一部の YAML UI テストスイート
- マルチプラットフォーム向けデスクトップバンドル生成

Workflows:
- [Test Suite](https://github.com/clawmaster-ai/clawmaster/actions/workflows/test.yml)
- [Desktop Bundles](https://github.com/clawmaster-ai/clawmaster/actions/workflows/build.yml)

## プロジェクト構成

```text
clawmaster/
├── packages/web/          React + Vite フロントエンド
├── packages/backend/      Web モード用 Express バックエンド
├── src-tauri/             Tauri デスクトップホスト
├── tests/ui/              YAML ベース UI テストスイート
└── bin/clawmaster.mjs     CLI エントリーポイント
```

実行モデル:
- **Desktop**: React が Tauri commands を呼び出す
- **Web**: React が `/api` 経由で Express バックエンドを利用する

## 謝辞

ClawMaster は次のプロジェクトを土台にしています。

| プロジェクト | 役割 |
| --- | --- |
| [OpenClaw](https://github.com/openclaw/openclaw) | コアランタイムと設定モデル |
| [ClawProbe](https://github.com/openclaw/clawprobe) | 可観測デーモン |
| [ClawHub](https://clawhub.ai) | スキルレジストリ |
| [PowerMem](https://github.com/openclaw/powermem) | メモリバックエンド |
| [Tauri](https://tauri.app) | デスクトップアプリフレームワーク |
| [React](https://react.dev) | フロントエンド UI |
| [Vite](https://vitejs.dev) | フロントエンドツールチェーン |
| [Playwright](https://playwright.dev) | ブラウザ自動化とスモークテスト |

## コントリビューション

コントリビューション歓迎です。

1. リポジトリを fork します。
2. `main` からブランチを作成します。
3. 必要に応じてテストを追加しながら変更します。
4. `npm test` と `npm run build` を実行します。
5. Pull Request を作成します。

## ライセンス

MIT。詳細は [LICENSE](./LICENSE) を参照してください。

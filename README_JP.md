<!-- Hero image / demo GIF: replace comment with actual asset when available
<p align="center">
  <img src="docs/hero.gif" width="800" alt="ClawMaster demo" />
</p>
-->

<h1 align="center">
  <code>clawmaster</code> · ロブスター管理マスター
</h1>

<p align="center">
  <strong>デスクトップアプリ · Web コンソール · サービス CLI — 設定ファイルを手編集せずに OpenClaw を動かす 3 つの方法。</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/Windows-0078D6?style=flat&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black" alt="Linux" />
  <img src="https://img.shields.io/badge/Web-4285F4?style=flat&logo=googlechrome&logoColor=white" alt="Web" />
</p>

<p align="center">
  <a href="#クイックスタート"><img src="https://img.shields.io/badge/Quick_Start-5_min-006DFF?style=for-the-badge" alt="クイックスタート" /></a>
  <a href="#ロードマップ"><img src="https://img.shields.io/badge/Roadmap-6_capabilities-ff69b4?style=for-the-badge" alt="ロードマップ" /></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contributing-welcome-21bb42?style=for-the-badge" alt="コントリビューション" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="ライセンス" /></a>
</p>

<p align="center">
  <a href="https://github.com/clawmaster-ai/clawmaster/actions/workflows/build.yml"><img src="https://img.shields.io/github/actions/workflow/status/clawmaster-ai/clawmaster/build.yml?branch=main" alt="Build" /></a>
  <img src="https://img.shields.io/badge/version-0.3.0-blue" alt="Version" />
  <a href="https://github.com/clawmaster-ai/clawmaster/stargazers"><img src="https://img.shields.io/github/stars/clawmaster-ai/clawmaster?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/tests-74_passing-brightgreen" alt="Tests" />
</p>

<!-- Recognition badges — uncomment once listed:
<p align="center">
  <a href="https://hellogithub.com/repository/FILL_IN"><img src="https://img.shields.io/badge/HelloGitHub-%E6%94%B6%E5%BD%95-red.svg" alt="HelloGitHub" /></a>
  <a href="https://www.producthunt.com/posts/FILL_IN"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=FILL_IN&theme=light" alt="Product Hunt" height="28" /></a>
</p>
-->

<p align="center">
  <a href="https://github.com/clawmaster-ai/clawmaster/releases"><strong>📦 Releases</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/clawmaster-ai/clawmaster/discussions"><strong>💬 Discussions</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/clawmaster-ai/clawmaster/issues"><strong>🐛 Issues</strong></a> &nbsp;·&nbsp;
  <a href="https://discord.gg/openclaw"><strong>Discord</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="./README.md">English</a> &nbsp;·&nbsp; <a href="./README_CN.md">中文</a> &nbsp;·&nbsp; 日本語
</p>

## ClawMaster vs. CLI のみ

| | OpenClaw CLI のみ | ClawMaster |
|---|---|---|
| 初期セットアップ | `~/.openclaw/openclaw.json` を手編集 | ガイド付きウィザード |
| プロバイダー・モデル設定 | JSON を編集して再起動 | フォーム UI とライブバリデーション |
| チャンネル接続 | ドキュメントを読んで手動設定 | プラットフォームごとのステップガイド |
| 可観測性 | 組み込みなし | ClawProbe ダッシュボード（コスト / トークン / ヘルス） |
| メモリ管理 | `powermem` CLI | 管理 UI（PowerMem） |
| 複数 Profile | ファイルを手動管理 | Profile スイッチャー |
| デスクトップアプリ | なし | あり — `.dmg` / `.msi` / `.AppImage` を提供 |
| セルフホスト Web コンソール | なし | あり — Express、Node.js 環境があればどこでも動作 |

## こんな方に

**「チームの OpenClaw を管理している。」**
チャンネル設定、API キーのローテーション、トークン使用量の監視を 1 か所で — SSH 不要、JSON 編集不要。

**「LangChain でエージェントを構築している。」**
モニタリングコードを書かずに、コンテキスト使用量・メモリスナップショット・セッションあたりのコストをすぐ確認できる。

**「OpenClaw を初めてセットアップする。」**
セットアップウィザードがプロバイダー・モデル・ゲートウェイ・チャンネルを 1 つのフローで案内。ドキュメントを読まなくても動く状態に到達できる。

## できること

- **セットアップと Profile** — OpenClaw の検出、不足コンポーネントの導入、Profile の作成・切り替え、ローカル環境の初期構築。
- **モデルとプロバイダー** — OpenAI 互換エンドポイントや各種プロバイダーの設定、API キーの検証、デフォルトモデルの指定。
- **ゲートウェイとチャンネル** — ゲートウェイの起動、Feishu・WeChat・Discord・Slack・Telegram・WhatsApp のガイド付き接続設定。
- **プラグイン・スキル・MCP** — 機能の有効化 / 無効化、注目項目のインストール、MCP サーバーの手動追加、MCP 定義のインポート。
- **セッション・メモリ・可観測性** — セッションの確認、メモリバックエンドの管理、トークン使用量とコスト見積もりの追跡。

## クイックスタート

<details>
<summary>方法 1: デスクトップインストーラーをダウンロード</summary>

[GitHub Releases](https://github.com/clawmaster-ai/clawmaster/releases) から各プラットフォーム向けインストーラーを取得してください。

| プラットフォーム | 形式 |
|---|---|
| Linux x64 | `.deb`、`.rpm`、`.AppImage` |
| macOS Intel | `.dmg` |
| macOS Apple Silicon | `.dmg` |
| Windows x64 | `.msi`、`.exe` |

> [!NOTE]
> `main` ブランチへの push ごとに CI が各プラットフォームの artifacts をアップロードします（7 日間保持）。正式リリース前のビルドが必要な場合は Actions からダウンロードできます。

</details>

<details>
<summary>方法 2: ソースから実行</summary>

```bash
git clone https://github.com/clawmaster-ai/clawmaster.git
cd clawmaster
npm install
npm run dev:web     # Web コンソール + バックエンド
npm run tauri:dev   # デスクトップアプリ
```

必要環境: Node.js 20+。デスクトップビルドには Rust も必要です — [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/) を参照。

</details>

<details>
<summary>方法 3: サービス CLI</summary>

```bash
npm i -g clawmaster
clawmaster doctor
clawmaster serve --daemon
clawmaster status
```

デフォルトのサービス URL: `http://127.0.0.1:3001`。`clawmaster serve` がサービストークンを表示するので、ブラウザ UI のプロンプトに入力してください。

よく使うオプション:

```bash
clawmaster serve --host 127.0.0.1 --port 3001 --daemon
clawmaster serve --host 127.0.0.1 --port 3001 --token your-own-token
clawmaster stop
clawmaster doctor
```

</details>

## 初回起動の流れ

1. ClawMaster を起動します。
2. 既存の OpenClaw Profile を選択するか、新しく作成します。
3. 少なくとも 1 つのモデルプロバイダーを接続し、デフォルトモデルを設定します。
4. ランタイムの観測が必要な場合は、ゲートウェイまたは可観測機能を有効にします。
5. 必要に応じてチャンネル、プラグイン、スキル、MCP サーバーを追加します。

## ロードマップ

6 つのコア機能 — issue ラベルで進捗を追跡:

| 機能 | ステータス | 内容 |
|---|---|---|
| 能管理 | リリース済み | ウィザード、16 プロバイダー、6 チャンネルタイプ、Profile 管理 |
| 能観測 | リリース済み | ClawProbe 統合、コスト / トークン / ヘルスダッシュボード |
| 能節約 | 開発中 | PowerMem UI、seekdb 統合、トークン削減ワークフロー |
| 能活用 | 計画中 | 写真 OCR、請求書処理、フラッシュカードツール |
| 能構築 | 計画中 | 対話型エージェントビルダー（LangChain DeepAgents） |
| 能守護 | 計画中 | キー暗号化、支出制限、RBAC |

[`label:roadmap`](https://github.com/clawmaster-ai/clawmaster/issues?q=label%3Aroadmap) でオープンな issue を確認できます。作業を始める前に issue にコメントを — ロードマップ機能を完成させたコアコントリビューターは OpenClaw チームからモデルクレジットを受け取れます。

## 📰 ニュース

- **2026-04-13** 🏗️ コントリビューションフローを強化 — issue フォーム、厳格な PR テンプレート、PR 説明の自動チェック、アーキテクチャ境界テストを追加。

<!-- 重要なユーザー向け変更がリリースされた際にここへ追記してください。 -->

## 開発

```bash
npm install
npm run dev:web       # フロントエンド + バックエンド
npm run dev           # フロントエンドのみ（ポート 3000）
npm run dev:backend   # バックエンドのみ（ポート 3001）
npm run tauri:dev     # デスクトップアプリ
```

<details>
<summary>テストと CI</summary>

```bash
npm test              # 単体テスト（Vitest）
npm run build         # 型チェック + 本番ビルド
npm run test:desktop  # デスクトップスモーク（macOS: 実 Tauri ビルド; Linux/Win: WebDriver）
```

> [!TIP]
> PR を開く前に `npm test && npm run build` を実行してください — CI と同じステップです。

CI のカバー範囲: TypeScript チェック、単体テスト、バックエンドスモーク、Web スモーク、デスクトップスモーク、マルチプラットフォーム Tauri ビルド。

</details>

<details>
<summary>プロジェクト構成</summary>

```text
clawmaster/
├── packages/web/          React + Vite フロントエンド
├── packages/backend/      Web モード用 Express バックエンド
├── src-tauri/             Tauri デスクトップホスト
├── tests/ui/              YAML ベースの手動 UI フロー仕様
└── bin/clawmaster.mjs     CLI エントリーポイント
```

実行モデル: Desktop — React が `invoke()` で Tauri コマンドを呼び出す。Web — React が `/api` 経由で Express にプロキシする。

</details>

## コントリビューション

**AI コーディングエージェントを使っていますか？** まず [AGENTS.md](./AGENTS.md) を読んでください — コントリビューションのワークフロー、モジュールパターン、ハードルールをエージェントが読みやすい形式でまとめています。

詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください: 環境セットアップ、テスト要件、依存関係ポリシー、コミット規約、PR チェックリスト。

> [!IMPORTANT]
> PR を開く前にローカルで `npm test` を通過させてください。スクリーンショット、テストログ、生成ファイルをコミットに含めないでください。Node.js が唯一許可されているランタイムです。

コミュニティ: [GitHub Discussions](https://github.com/clawmaster-ai/clawmaster/discussions) · [Discord](https://discord.gg/openclaw) · [Feishu](https://openclaw.feishu.cn/community)

## コントリビューター

[![Contributors](https://contrib.rocks/image?repo=clawmaster-ai/clawmaster)](https://github.com/clawmaster-ai/clawmaster/graphs/contributors)

---

<!-- Repobeats activity widget — configure at repobeats.axiom.co then uncomment:
[![Repobeats analytics image](https://repobeats.axiom.co/api/embed/HASH.svg "Repobeats analytics image")](https://repobeats.axiom.co)
-->

<details>
<summary>謝辞</summary>

| プロジェクト | 役割 |
|---|---|
| [OpenClaw](https://github.com/openclaw/openclaw) | コアランタイムと設定モデル |
| [ClawProbe](https://github.com/openclaw/clawprobe) | 可観測デーモン |
| [ClawHub](https://clawhub.ai) | スキルレジストリ |
| [PowerMem](https://github.com/openclaw/powermem) | メモリバックエンド |
| [Tauri](https://tauri.app) | デスクトップアプリフレームワーク |
| [React](https://react.dev) | フロントエンド UI |
| [Vite](https://vitejs.dev) | フロントエンドツールチェーン |
| [Playwright](https://playwright.dev) | ブラウザ自動化とスモークテスト |

</details>

## ライセンス

MIT。詳細は [LICENSE](./LICENSE) を参照してください。

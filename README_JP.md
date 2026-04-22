<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/openmaster-ai/brand/main/logos/clawmaster/wordmarks/dark/horizontal.png" />
    <img src="https://raw.githubusercontent.com/openmaster-ai/brand/main/logos/clawmaster/wordmarks/white/horizontal.png" width="100%" alt="ClawMaster" />
  </picture>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/Windows-0078D6?style=flat&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black" alt="Linux" />
  <img src="https://img.shields.io/badge/Web-4285F4?style=flat&logo=googlechrome&logoColor=white" alt="Web" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/openmaster-ai/brand/main/logos/clawmaster/static/amber.svg" width="28" alt="ClawMaster amber mark" />
  &nbsp;
  <img src="https://img.shields.io/badge/Brand-OpenMaster_Universe-F5A623?style=flat" alt="OpenMaster Universe Brand" />
  <img src="https://img.shields.io/badge/Product-ClawMaster-111111?style=flat" alt="ClawMaster" />
</p>

<p align="center">
  <a href="#クイックスタート"><img src="https://img.shields.io/badge/Quick_Start-5_min-006DFF?style=for-the-badge" alt="Quick Start" /></a>
  <a href="#ロードマップ"><img src="https://img.shields.io/badge/Roadmap-6_capabilities-ff69b4?style=for-the-badge" alt="Roadmap" /></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contributing-welcome-21bb42?style=for-the-badge" alt="Contributing" /></a>
</p>

<p align="center">
  <a href="https://github.com/openmaster-ai/clawmaster/actions/workflows/build.yml"><img src="https://img.shields.io/github/actions/workflow/status/openmaster-ai/clawmaster/build.yml?branch=main" alt="Build" /></a>
  <a href="https://github.com/openmaster-ai/clawmaster/stargazers"><img src="https://img.shields.io/github/stars/openmaster-ai/clawmaster?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache 2.0" />
</p>

<p align="center">
  <a href="https://github.com/openmaster-ai/clawmaster/releases"><strong>📦 Releases</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/openmaster-ai/clawmaster/discussions"><strong>💬 Discussions</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/openmaster-ai/clawmaster/issues"><strong>🐛 Issues</strong></a> &nbsp;·&nbsp;
  <a href="https://deepwiki.com/openmaster-ai/clawmaster"><strong>📘 Ask DeepWiki</strong></a> &nbsp;·&nbsp;
  <a href="https://discord.gg/openclaw"><strong>Discord</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="./README.md">English</a> &nbsp;·&nbsp; <a href="./README_CN.md">中文</a> &nbsp;·&nbsp; 日本語
</p>

## クイックスタート

### CLI + Web コンソール（おすすめ）

```bash
npm i -g clawmaster
clawmaster                   # Web コンソールを起動
```

http://localhost:16223 を開いてください。セットアップウィザードが OpenClaw エンジンの検出と LLM プロバイダーの設定をガイドします。設定ファイルの手動編集は不要です。

```bash
clawmaster serve --daemon    # バックグラウンド実行
clawmaster stop              # サービス停止
clawmaster doctor            # 環境を確認
```

> [!NOTE]
> 現在のバージョンは **v0.3.0-rc.1**（リリース候補）です。インストール: `npm i -g clawmaster@rc`

### デスクトップアプリ（Beta）

[GitHub Releases](https://github.com/openmaster-ai/clawmaster/releases) からお使いのプラットフォーム向けインストーラーをダウンロードしてください：

| プラットフォーム | 形式 |
|---|---|
| macOS Apple Silicon | `.dmg` |
| macOS Intel | `.dmg` |
| Windows x64 | `.msi`、`.exe` |
| Linux x64 | `.deb`、`.rpm`、`.AppImage` |

> [!WARNING]
> デスクトップ版は現在 **Beta** です。CLI + Web コンソールが最も十分にテストされたインストール方法として推奨されます。

<details>
<summary>ソースから実行</summary>

```bash
git clone https://github.com/openmaster-ai/clawmaster.git
cd clawmaster
npm install
npm run dev:web              # Web コンソール + バックエンド
npm run tauri:dev            # デスクトップアプリ
```

必要環境: Node.js 20+。デスクトップビルドには Rust も必要です — [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/) を参照。

</details>

### 起動後の流れ

1. 既存の OpenClaw Profile を選択するか、新しく作成します。
2. 少なくとも 1 つのモデルプロバイダーを接続し、デフォルトモデルを設定します。
3. 必要に応じてチャンネル、プラグイン、スキル、MCP サーバーを追加します。
4. ランタイムの観測が必要な場合は、ゲートウェイまたは可観測機能を有効にします。

## なぜ ClawMaster なのか

多くの OpenClaw ツールは、設定を整えるところで止まります。ClawMaster は**日常で使える OpenClaw の相棒**です — 設定を助けるだけでなく、一般の非技術ユーザーが OpenClaw を日常の仕事や生活で実際に使い始められるようにすることが重要な目的です。

つまり ClawMaster は、単に：
- 設定を安全に編集するための UI、
- モデルやチャンネルを接続するための画面、
- ランタイムを監視するためのダッシュボード、

で終わるのではなく、さらに：
- 初期導入をわかりやすくし、
- 高度な機能をガイド付きの体験に変え、
- 今後は、より明確なガイド、学習導線、ワークフロー支援も段階的に加えていきます。

**ひと言で言えば：** ClawMaster は、OpenClaw の強力さと日常での使いやすさをつなぐ橋です。

## ClawMaster vs. CLI のみ

| | OpenClaw CLI のみ | ClawMaster |
|---|---|---|
| 初期セットアップ | `~/.openclaw/openclaw.json` を手編集 | ガイド付きウィザード |
| プロバイダー・モデル設定 | JSON を編集して再起動 | フォーム UI とライブバリデーション |
| チャンネル接続 | ドキュメントを読んで手動設定 | プラットフォームごとのステップガイド |
| 可観測性 | 主に CLI とログ | ClawProbe ベースのダッシュボードとランタイム表示 |
| メモリ管理 | `powermem` CLI | 管理 UI |
| 日常利用の支援 | 基本は自力 | よりガイド付きの体験へ拡張中 |
| 複数 Profile | ファイルを手動管理 | Profile スイッチャー |
| デスクトップアプリ | なし | あり — `.dmg` / `.msi` / `.AppImage` を提供 |
| セルフホスト Web コンソール | なし | あり — Express、Node.js 環境ならどこでも動作 |

## こんな方に

**「OpenClaw を正しく設定するだけでなく、実生活で役立てたい。」**  
ClawMaster は、インストール完了から実際の成果までの距離を縮めるための製品です。

**「技術者ではないが、強力な AI パーソナルアシスタントを使いたい。」**  
JSON、ターミナル、インフラ前提ではなく、ガイド付きセットアップ、ガイド付き活用、成果ベースの学習へ寄せていきます。

**「チームや家族のために OpenClaw を管理している。」**  
チャンネル設定やランタイム状況の確認を 1 か所で行え、ほかの人にも導入しやすくなります。

**「高度なエージェント運用もしたい。」**  
モデル管理、可観測性、メモリ、セッション、プラグイン、スキル、MCP を引き続き 1 つの場所で扱えます。

## いまできること

- **セットアップと Profile** — OpenClaw の検出、不足コンポーネントの導入、Profile の作成・切り替え、ローカル環境の初期構築。
- **モデルとプロバイダー** — OpenAI 互換エンドポイントや各種プロバイダーの設定、API キーの検証、デフォルトモデルの指定。
- **ゲートウェイとチャンネル** — ゲートウェイの起動、Feishu・WeChat・Discord・Slack・Telegram・WhatsApp のガイド付き接続設定。
- **プラグイン・スキル・MCP** — 機能の有効化 / 無効化、注目項目のインストール、MCP サーバーの追加、MCP 定義のインポート。
- **セッション・メモリ・可観測性** — セッションの確認、メモリバックエンドの管理、トークン使用量とコスト見積もりの追跡。

## ロードマップ

6 つのコア機能 — それぞれインフラから日常利用へ向かいます：

| # | 機能 | ステータス | 実装済み | 次のステップ |
|---|---|---|---|---|
| 1 | **能管理** | 利用可能 | ガイド付きウィザード、6+ LLM プロバイダー（キー検証付き）、6 チャンネル（Feishu / WeChat / Discord / Slack / Telegram / WhatsApp）、Profile 切り替え | ワンクリック環境移行（[#1](https://github.com/openmaster-ai/clawmaster/issues/1)）、Windows + WSL2 ファーストクラスサポート |
| 2 | **能観測** | 利用可能 | ClawProbe ベースのダッシュボード、セッションごとのコスト・トークン追跡、ゲートウェイヘルス監視 | 履歴コスト分析、異常アラート、マルチ Profile 比較 |
| 3 | **能節約** | 開発中 | PowerMem UI + FTS5 ローカル検索、メモリワークスペース管理、markdown grep への自動フォールバック | 完全な seekdb ベクトル検索（[#12](https://github.com/openmaster-ai/clawmaster/issues/12)）、LLM Wiki — 時間とともに蓄積するナレッジベース（[#49](https://github.com/openmaster-ai/clawmaster/issues/49)） |
| 4 | **能活用** | 開発中 | PaddleOCR パイプライン（アップロード → 解析 → 構造化 Markdown）、レイアウト認識抽出 | 写真 → フラッシュカード自動生成、請求書抽出テンプレート、シナリオ優先のガイド付きワークフロー |
| 5 | **能構築** | 計画中 | プラグイン / スキルのインストール・切り替え、MCP サーバー管理、スキルセキュリティ監査 | ビジュアルエージェントコンポーザー、LangChain Deep Agents 統合、対話型エージェントビルダー |
| 6 | **能守護** | 計画中 | Skill Guard セキュリティスキャン（次元 / 重大度 / リスクスコア）、基本的な機能ゲーティング | API キー暗号化ボールト、Profile ごとの支出上限、チームデプロイ向け RBAC |

[`label:roadmap`](https://github.com/openmaster-ai/clawmaster/issues?q=label%3Aroadmap) でオープンな issue を確認できます。作業を始める前に issue にコメントして、重複作業を避けてください。

## バージョニング

ClawMaster は [Pride Versioning](https://pridever.org/) を採用しています —— `PROUD.DEFAULT.SHAME`：

| セグメント | いつバンプするか |
|---|---|
| **Proud** | 心から誇れるリリース |
| **Default** | 普通の、堅実なリリース |
| **Shame** | 口に出すのも恥ずかしいバグの修正 |

プレリリースには `-rc.N` タグを使用します。

## 📰 ニュース

- **2026-04-22** 🚀 v0.3.0-rc.1 — 初のリリース候補。2 ステップセットアップウィザード、PaddleOCR、ERNIE 画像生成、コスト可観測性、cron 管理。CLI が推奨インストール方法、デスクトップ版は Beta。
- **2026-04-17** ✨ ブランドとポジショニングを正式公開 — ClawMaster は管理画面ではなく、日常で使える OpenClaw の相棒へ。新ワードマーク、Apache 2.0 ライセンス、Pride Versioning を採用。

## 開発

```bash
npm install
npm run dev:web       # フロントエンド + バックエンド
npm run dev           # フロントエンドのみ（ポート 16223）
npm run dev:backend   # バックエンドのみ（ポート 16224）
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

CI のカバー範囲: TypeScript チェック、単体テスト、デスクトップ / Web ビルド検証。

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

実行モデル: Desktop — React が Tauri コマンドを呼び出す。Web — React が `/api` 経由で Express にプロキシする。

</details>

## コントリビューション

開発者、デザイナー、テクニカルライター、テスター、そして実際に OpenClaw を使っているパワーユーザーからの貢献を広く歓迎しています。

ClawMaster を一般ユーザーにとってもっと役立つものにしたい方は、ぜひ参加してください。バグ修正、UX 改善、ドキュメント整備、オンボーディング改善、将来の Master Classes のアイデアなど、どれも価値があります。

まずはこちら：
- [AGENTS.md](./AGENTS.md) — エージェント向けの貢献ルール
- [CONTRIBUTING.md](./CONTRIBUTING.md) — セットアップ、テスト、コミット、PR のガイド
- [Ask DeepWiki](https://deepwiki.com/openmaster-ai/clawmaster) — 変更前にリポジトリを素早く理解

> [!IMPORTANT]
> PR を開く前にローカルで `npm test` を実行してください。生成ファイルやテストログはコミットしないでください。Node.js が唯一許可されているランタイムです — 新しい言語依存関係を追加しないでください。

コミュニティ: [GitHub Discussions](https://github.com/openmaster-ai/clawmaster/discussions) · [Discord](https://discord.gg/openclaw) · [Feishu](https://openclaw.feishu.cn/community)

## コントリビューター

[![Contributors](https://contrib.rocks/image?repo=openmaster-ai/clawmaster)](https://github.com/openmaster-ai/clawmaster/graphs/contributors)

<details>
<summary>謝辞</summary>

| プロジェクト | 役割 |
|---|---|
| [OpenClaw](https://github.com/openclaw/openclaw) | コアランタイムと設定モデル |
| [ClawProbe](https://github.com/openclaw/clawprobe) | 可観測デーモン |
| [PowerMem](https://github.com/openclaw/powermem) | メモリバックエンド |
| [seekdb](https://github.com/openclaw/seekdb) | 検索・リトリーバルワークフロー |
| [Tauri](https://tauri.app) | デスクトップアプリフレームワーク |
| [React](https://react.dev) | フロントエンド UI |
| [Vite](https://vitejs.dev) | フロントエンドツールチェーン |
| [Playwright](https://playwright.dev) | ブラウザ自動化とスモークテスト |

</details>

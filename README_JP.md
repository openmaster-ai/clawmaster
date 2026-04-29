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
  <a href="https://github.com/openmaster-ai/clawmaster-workshop"><img src="https://img.shields.io/badge/Workshop-hands--on-0A7EA4?style=flat" alt="Workshop" /></a>
</p>

<p align="center">
  <a href="#クイックスタート"><img src="https://img.shields.io/badge/Quick_Start-5_min-006DFF?style=for-the-badge" alt="Quick Start" /></a>
  <a href="#ロードマップ"><img src="https://img.shields.io/badge/Roadmap-6_capabilities-ff69b4?style=for-the-badge" alt="Roadmap" /></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contributing-welcome-21bb42?style=for-the-badge" alt="Contributing" /></a>
</p>

<p align="center">
  <a href="https://github.com/openmaster-ai/clawmaster/actions/workflows/build.yml"><img src="https://img.shields.io/github/actions/workflow/status/openmaster-ai/clawmaster/build.yml?branch=main" alt="Build" /></a>
  <a href="https://github.com/openmaster-ai/clawmaster/milestone/1"><img src="https://img.shields.io/badge/milestone-v0.4.0-6f42c1" alt="次のマイルストーン: v0.4.0" /></a>
  <a href="https://github.com/openmaster-ai/clawmaster/stargazers"><img src="https://img.shields.io/github/stars/openmaster-ai/clawmaster?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache 2.0" />
</p>

<p align="center">
  <a href="https://github.com/openmaster-ai/clawmaster/releases"><strong>📦 Releases</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/openmaster-ai/clawmaster/discussions"><strong>💬 Discussions</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/openmaster-ai/clawmaster/issues"><strong>🐛 Issues</strong></a> &nbsp;·&nbsp;
  <a href="https://deepwiki.com/openmaster-ai/clawmaster"><strong>📘 Ask DeepWiki</strong></a>
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
> 現在のバージョンは **v0.3.1** です。次のマイルストーンは [**v0.4.0**](https://github.com/openmaster-ai/clawmaster/milestone/1) —— マージ済みの機能はそこに集約されます。

### デスクトップアプリ（Beta）

[GitHub Releases](https://github.com/openmaster-ai/clawmaster/releases) からお使いのプラットフォーム向けインストーラーをダウンロードしてください：

| プラットフォーム | 形式 |
|---|---|
| macOS Apple Silicon | `.dmg` |
| macOS Intel | `.dmg` |
| Windows x64 | `.msi`、`.exe` |
| Linux x64 | `.deb`、`.AppImage` |

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

### 学び方を選ぶ

- 🧪 **ハンズオン** —— [**clawmaster-workshop**](https://github.com/openmaster-ai/clawmaster-workshop) を順に進めてください。3 言語（EN / 中文 / 日本語）のタスクが 6 つのコア機能に沿ってまとめられ、タスクを連結した日付付きラボもあります。*実際に手を動かす*のに最適。
- 🖼️ **図示ツアー** —— 下の[プロダクト機能ツアー](#プロダクト機能ツアー)を眺めるだけ。各スクリーンショットが具体的なタスクに対応しているので、インストールしなくても全体像を掴めます。

## なぜ ClawMaster なのか

多くの OpenClaw ツールは設定を整えるところで止まります。ClawMaster は**日常で使える OpenClaw の相棒** —— OpenClaw の強力さと日常での使いやすさをつなぐ橋です。OpenClaw を設定するだけでなく実生活で役立てたい人、JSON やターミナルに触れ続けたくない人、チームや家族のために OpenClaw を管理している人のための製品です。

## メモリハイライト

メモリは**能節約**機能の背骨です。独自実装ではなく [**PowerMem**](https://github.com/oceanbase/powermem)（[Python](https://github.com/oceanbase/powermem) · [TypeScript SDK](https://github.com/ob-labs/powermem-ts) · [OpenClaw プラグイン](https://github.com/ob-labs/memory-powermem)）を基盤に採用しています：

- **ネイティブな OpenClaw 市民** —— PowerMem には OpenClaw 向けメモリプラグインが最初から備わっており、エージェントのターンごとに自動 recall / capture が行われます。
- **チャンク投棄ではなく賢い抽出** —— 会話を持続的な事実に蒸留し、エビングハウス減衰で想起を駆動します。私たちの「作ったら育てる」方向性に合致します。
- **マルチエージェントの分離が最初から** —— ユーザー / エージェント / ワークスペース単位で自動分離。自分で ID 基盤を再発明する必要はありません。
- **データベース級の永続性** —— [OceanBase seekdb](https://github.com/oceanbase/seekdb) と組み合わせてベクトル + 全文 + SQL のハイブリッド検索、クロスプラットフォームでは SQLite にフォールバック。
- **オープンソースで多言語 SDK** —— 特定ランタイムに縛られず、JS から Python、Go まで一貫したセマンティクス。

**実装済み**

- 管理対象 PowerMem ランタイム + OpenClaw ブリッジを Web・バックエンド・デスクトップに展開 —— エージェントのターンで自動 recall / capture がそのまま動きます。
- ローカルワークスペースインポート —— markdown / `memory/` を管理対象 PowerMem に取り込み、seekdb が使える場合は seekdb、それ以外は SQLite にフォールバック。
- 管理対象メモリで動く初のエンドツーエンドスキル：npm ダウンロード日次ダイジェストと期間比較。
- メモリ近傍の可観測性：セッション単位のコスト、スケジュール済みコストダイジェスト、models.dev 価格情報。

**次（v0.4.0）**：完全な seekdb ハイブリッド検索と、自己保守する LLM Wiki モジュール —— 取り込みごとに交差リンクされて積み上がる永続ページ、エビングハウス減衰と新鮮度重み付けで内容を生かし続けます。詳細は [v0.4.0 マイルストーン](https://github.com/openmaster-ai/clawmaster/milestone/1) を参照。

## プロダクト機能ツアー

<table>
  <tr>
    <td align="center" width="25%">
      <a href="./docs/screenshots/wizard-provider.png"><img src="./docs/screenshots/wizard-provider.png" alt="ティア表示のセットアップウィザード" /></a><br/>
      <sub><b>セットアップウィザード</b> · 2 ステップ、ティア表示のプロバイダー</sub>
    </td>
    <td align="center" width="25%">
      <a href="./docs/screenshots/page-dashboard.png"><img src="./docs/screenshots/page-dashboard.png" alt="概要ダッシュボード" /></a><br/>
      <sub><b>概要</b> · 稼働状況と次のアクション</sub>
    </td>
    <td align="center" width="25%">
      <a href="./docs/screenshots/page-models.png"><img src="./docs/screenshots/page-models.png" alt="モデルとプロバイダー" /></a><br/>
      <sub><b>モデル</b> · マルチプロバイダー設定とライブ検証</sub>
    </td>
    <td align="center" width="25%">
      <a href="./docs/screenshots/page-channels.png"><img src="./docs/screenshots/page-channels.png" alt="チャンネル接続" /></a><br/>
      <sub><b>チャンネル</b> · 6 つのメッセージプラットフォーム接続ガイド</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="./docs/screenshots/page-observe.png"><img src="./docs/screenshots/page-observe.png" alt="ClawProbe による可観測性" /></a><br/>
      <sub><b>可観測性</b> · ClawProbe によるコスト・トークン・セッション状態</sub>
    </td>
    <td align="center">
      <a href="./docs/screenshots/page-memory.png"><img src="./docs/screenshots/page-memory.png" alt="メモリワークスペース" /></a><br/>
      <sub><b>メモリ</b> · PowerMem ランタイム + seekdb / SQLite フォールバック</sub>
    </td>
    <td align="center">
      <a href="./docs/screenshots/page-mcp.png"><img src="./docs/screenshots/page-mcp.png" alt="MCP サーバー" /></a><br/>
      <sub><b>MCP</b> · サーバー・エンドポイント・スキル定義</sub>
    </td>
    <td align="center">
      <a href="./docs/screenshots/page-skills.png"><img src="./docs/screenshots/page-skills.png" alt="スキルマーケット" /></a><br/>
      <sub><b>スキル</b> · ClawHub マーケットでインストール＆監査</sub>
    </td>
  </tr>
</table>

## こんな方に

- **「ただ設定するだけでなく、実生活で使いたい。」** —— インストールから成果までの距離を縮めます。
- **「技術者ではないが強力な AI アシスタントが欲しい。」** —— ガイド付きセットアップと活用、JSON 知識は不要。
- **「チームや家族の OpenClaw を管理している。」** —— チャンネル、ランタイム、オンボーディングを 1 か所で。
- **「高度なエージェント運用もしたい。」** —— モデル管理・可観測・メモリ・セッション・プラグイン・スキル・MCP を 1 か所に。

## ロードマップ

6 つのコア機能 — それぞれインフラから日常利用へ向かいます：

| # | 機能 | ステータス | 実装済み | 次のステップ |
|---|---|---|---|---|
| 1 | **能管理** | 利用可能 | ガイド付きウィザード、6+ LLM プロバイダー（キー検証付き）、6 チャンネル（Feishu / WeChat / Discord / Slack / Telegram / WhatsApp）、Profile 切り替え | ワンクリック環境移行、Windows + WSL2 ファーストクラスサポート |
| 2 | **能観測** | 利用可能 | ClawProbe ベースのダッシュボード、セッションごとのコスト・トークン追跡、ゲートウェイヘルス監視 | 履歴コスト分析、異常アラート、マルチ Profile 比較 |
| 3 | **能節約** | 開発中 | 管理対象 PowerMem ランタイム + OpenClaw ブリッジ、ワークスペースインポート、初のメモリ駆動スキル —— 詳細は[メモリハイライト](#メモリハイライト) | 完全な seekdb ハイブリッド検索、自己保守 LLM Wiki —— 詳細は [v0.4.0 マイルストーン](https://github.com/openmaster-ai/clawmaster/milestone/1) |
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

- **2026-04-25** 🚀 v0.3.0 — 最初の正式版。セットアップウィザード、PaddleOCR、ERNIE 画像生成、コスト可観測性、cron 管理、バンドル済みスキル更新、管理対象 PowerMem 対応を含みます。CLI が推奨インストール方法で、デスクトップ版は引き続き Beta です。
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
| [PowerMem](https://github.com/oceanbase/powermem) · [TS SDK](https://github.com/ob-labs/powermem-ts) | メモリバックエンド |
| [OceanBase seekdb](https://github.com/oceanbase/seekdb) | 検索・リトリーバルワークフロー |
| [Tauri](https://tauri.app) | デスクトップアプリフレームワーク |
| [React](https://react.dev) | フロントエンド UI |
| [Vite](https://vitejs.dev) | フロントエンドツールチェーン |
| [Playwright](https://playwright.dev) | ブラウザ自動化とスモークテスト |

</details>

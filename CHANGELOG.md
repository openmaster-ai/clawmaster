# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-03-30

### Setup & Onboarding
- Multi-step setup wizard: detect environment, install OpenClaw, onboard (API key, model, gateway, channel)
- API key validation via real HTTP request before saving
- Provider API key links for all 16 providers (direct links to console/key pages)
- Per-page capability install guard (redirects to setup if not installed)

### Providers & Models
- 16 LLM providers: OpenAI, Anthropic, Google Gemini, xAI, Mistral, Groq, DeepSeek, MiniMax, Kimi, SiliconFlow, OpenRouter, Amazon Bedrock, Google Vertex, Azure OpenAI, Cerebras, Custom OpenAI-compatible
- Provider-specific configuration fields and model lists

### Channels
- 6 channel types: Discord, Slack, Telegram, Feishu, WeChat, WhatsApp
- Channel setup guides with step-by-step navigation paths for each platform
- Feishu permissions template with 26 scopes (one-click copy)
- WeChat and WhatsApp QR code scan login (no manual token entry)

### Observability
- Observability dashboard with real ClawProbe integration
- Cost tracking, token usage monitoring, context health metrics
- Demo mode with realistic mock data for offline development

### Internationalization
- Full i18n with react-i18next: Chinese, English, Japanese
- 386 translation keys across all pages and components
- Language switcher in header and setup wizard
- localStorage persistence for language preference

### UI/UX
- Dark mode toggle (independent from color theme)
- Color themes: Lobster Orange, Ocean Blue
- Responsive layout with mobile hamburger menu
- Lucide React icons throughout (replaced emoji icons)
- Docs page with live search via openclaw CLI

### Infrastructure
- CI/CD: test gate (TypeScript check + vitest) before multi-platform Tauri build
- Express backend uses execFile (no shell injection)
- 74 unit tests (vitest + jsdom + testing-library)
- 85 YAML-based UI test cases
- Config management with JSON editor

## [0.1.0] - 2026-03-20

### Added
- Initial release
- Dashboard with system info, gateway status, channels, and agents overview
- Gateway management (start/stop/restart, view config)
- Channels management (Feishu, Telegram, Discord, WhatsApp, Signal, Slack)
- Models configuration page
- Skills management page
- Agents management page
- Config editor (visual + JSON modes)
- Documentation center
- Logs viewer
- Settings page
- Web version for testing
- Tauri desktop support
- CI/CD for multi-platform builds (macOS, Windows, Linux)

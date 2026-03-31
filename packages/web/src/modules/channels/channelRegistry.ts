/**
 * 通道结构化配置与接入引导（字段与文案对齐 clawpanel 渠道向导，略去本仓库未实现的插件安装 / 配对 API）。
 */

export type FieldType = 'text' | 'password' | 'number' | 'select'

export type ChannelFieldDef = {
  key: string
  label: string
  type?: FieldType
  placeholder?: string
  /** 表单项下方说明 */
  hint?: string
  options?: Array<{ value: string; label: string }>
  required?: boolean
  requiredWhen?: { key: string; value: string }
}

export type GuideStep = {
  text: string
  link?: { href: string; label: string }
}

export type ChannelRegistryEntry = {
  fields: ChannelFieldDef[]
  guideSteps: GuideStep[]
  /** 引导区底部补充说明（纯文本） */
  guideFooter?: string
  /** 设备配对 / 审批说明（纯文本，本应用内可配合终端执行 openclaw 命令） */
  pairingNote?: string
}

const policyOptions = [
  { value: '', label: '默认' },
  { value: 'allow', label: '允许私信' },
  { value: 'deny', label: '拒绝私信' },
]

const groupPolicyOptionsCommon = [
  { value: '', label: '默认' },
  { value: 'all', label: '全部' },
  { value: 'mentioned', label: '仅 @ 提及' },
  { value: 'allowlist', label: '白名单' },
  { value: 'disabled', label: '禁用群聊' },
]

export const CHANNEL_REGISTRY: Record<string, ChannelRegistryEntry> = {
  feishu: {
    guideSteps: [
      {
        text: '前往飞书开放平台创建企业自建应用',
        link: { href: 'https://open.feishu.cn/app', label: '飞书开放平台' },
      },
      { text: '在「添加应用能力」中添加「机器人」' },
      { text: '在「凭证与基础信息」中获取 App ID 和 App Secret' },
      { text: '事件回调选择「长连接」方式（无需公网 IP）' },
      {
        text: '权限管理中开通 im:message、im:message.group_at_msg 等消息相关权限',
      },
      { text: '创建版本并发布后，将机器人添加到目标群' },
    ],
    guideFooter:
      '推荐使用长连接方式，无需公网地址即可接收消息。飞书/Lark 插件需已安装（如 @larksuite/openclaw-lark），详见 OpenClaw 文档。',
    pairingNote:
      '若机器人提示需配对或 access not configured，可在本机终端执行：openclaw devices list，再 openclaw devices approve <请求 ID>。',
    fields: [
      {
        key: 'appId',
        label: 'App ID',
        required: true,
        placeholder: 'cli_xxx',
        hint: '飞书应用「凭证与基础信息」中的 App ID',
      },
      {
        key: 'appSecret',
        label: 'App Secret',
        type: 'password',
        required: true,
        placeholder: 'sec_xxx',
        hint: '飞书应用「凭证与基础信息」中的 App Secret',
      },
      {
        key: 'domain',
        label: '平台域名',
        type: 'select',
        options: [
          { value: '', label: '飞书 (feishu.cn)' },
          { value: 'lark', label: 'Lark (larksuite.com)' },
        ],
        hint: '国际版 Lark 请选择 Lark',
      },
      {
        key: 'dmPolicy',
        label: '私信策略',
        type: 'select',
        options: policyOptions,
        hint: '留空表示使用 OpenClaw 默认策略',
      },
      {
        key: 'groupPolicy',
        label: '群组策略',
        type: 'select',
        options: groupPolicyOptionsCommon,
      },
      {
        key: 'allowFrom',
        label: 'Allow From',
        placeholder: '可选，逗号分隔用户/群组 ID',
        hint: '限制允许的用户或会话 ID，留空不限制',
      },
    ],
  },
  telegram: {
    guideSteps: [
      {
        text: '在 Telegram 中搜索 @BotFather 并发送 /newbot',
        link: { href: 'https://t.me/BotFather', label: '@BotFather' },
      },
      { text: '按提示设置机器人名称和用户名' },
      { text: '复制 BotFather 返回的 Bot Token' },
      { text: '将 Token 填入下方并保存；Webhook 路径如需自定义可填写' },
    ],
    guideFooter:
      'Webhook 模式通常需要公网可达的 Gateway 地址；若仅用轮询等模式，请按 OpenClaw 文档配置。',
    pairingNote:
      '若连接网关时提示配对码，请在终端执行 openclaw devices list / openclaw devices approve。',
    fields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'password',
        required: true,
        placeholder: '123456:ABC-DEF...',
      },
      {
        key: 'webhookPath',
        label: 'Webhook Path',
        placeholder: '/telegram/webhook',
        hint: '与 Gateway 事件回调路径一致时填写',
      },
      {
        key: 'dmPolicy',
        label: '私信策略',
        type: 'select',
        options: policyOptions,
      },
      {
        key: 'groupPolicy',
        label: '群组策略',
        type: 'select',
        options: groupPolicyOptionsCommon,
      },
      {
        key: 'allowFrom',
        label: 'Allow From',
        placeholder: '可选，逗号分隔 chat id',
      },
    ],
  },
  discord: {
    guideSteps: [
      {
        text: '前往 Discord Developer Portal 创建 Application',
        link: {
          href: 'https://discord.com/developers/applications',
          label: 'Discord Developer Portal',
        },
      },
      { text: '在 Bot 页面点击 Reset Token 获取 Bot Token' },
      { text: '开启 MESSAGE CONTENT INTENT 以接收消息正文' },
      { text: '使用 OAuth2 URL Generator 将 Bot 邀请进服务器' },
    ],
    guideFooter: '务必开启 Message Content Intent，否则无法读取频道消息内容。',
    pairingNote:
      '若提示设备配对，请在运行 Gateway 的机器上执行 openclaw devices approve（见终端列表中的 requestId）。',
    fields: [
      {
        key: 'token',
        label: 'Bot Token',
        type: 'password',
        required: true,
        placeholder: 'MTQx...',
      },
      {
        key: 'dmPolicy',
        label: '私信策略',
        type: 'select',
        options: policyOptions,
      },
      {
        key: 'groupPolicy',
        label: '群组策略',
        type: 'select',
        options: groupPolicyOptionsCommon,
      },
      {
        key: 'allowFrom',
        label: 'Allow From',
        placeholder: '可选，逗号分隔用户/频道 ID',
      },
    ],
  },
  slack: {
    guideSteps: [
      {
        text: '前往 Slack API 创建 App（推荐 From a manifest）',
        link: { href: 'https://api.slack.com/apps', label: 'Slack API' },
      },
      {
        text: '在 OAuth & Permissions 中添加 Bot Token Scopes：chat:write、app_mentions:read 等',
      },
      { text: '安装 App 到工作区，获取 Bot Token（xoxb-）' },
      {
        text: 'Socket Mode：在 Basic Information 中开启 Socket Mode，获取 App-Level Token（xapp-）',
      },
      { text: 'HTTP Mode：在 Event Subscriptions 中配置请求 URL，并填写 Signing Secret' },
    ],
    guideFooter:
      'Socket Mode 无需公网回调地址；HTTP Mode 需公网可访问的事件订阅 URL。',
    fields: [
      {
        key: 'mode',
        label: '连接模式',
        type: 'select',
        required: true,
        options: [
          { value: 'socket', label: 'Socket Mode（推荐）' },
          { value: 'http', label: 'HTTP Mode' },
        ],
      },
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'password',
        required: true,
        placeholder: 'xoxb-...',
      },
      {
        key: 'appToken',
        label: 'App-Level Token (xapp-)',
        type: 'password',
        requiredWhen: { key: 'mode', value: 'socket' },
        hint: '仅 Socket Mode 需要',
      },
      {
        key: 'signingSecret',
        label: 'Signing Secret',
        type: 'password',
        requiredWhen: { key: 'mode', value: 'http' },
        hint: 'HTTP Mode 下用于校验 Slack 请求签名',
      },
      {
        key: 'teamId',
        label: 'Team ID',
        placeholder: '可选，如 T01234567',
      },
      {
        key: 'webhookPath',
        label: 'Webhook Path',
        placeholder: '可选，如 /slack/events',
      },
      {
        key: 'dmPolicy',
        label: '私信策略',
        type: 'select',
        options: policyOptions,
      },
      {
        key: 'groupPolicy',
        label: '群组策略',
        type: 'select',
        options: [
          { value: '', label: '默认' },
          { value: 'all', label: '所有频道' },
          { value: 'mentioned', label: '仅 @ 提及' },
          { value: 'allowlist', label: '白名单' },
          { value: 'disabled', label: '禁用' },
        ],
      },
      {
        key: 'allowFrom',
        label: 'Allow From',
        placeholder: '可选，逗号分隔用户/频道 ID',
        hint: '限制允许的用户或频道，留空不限制',
      },
    ],
  },
  whatsapp: {
    guideSteps: [
      { text: '确保 Gateway 已启动，且已安装并加载 WhatsApp 相关插件（见 OpenClaw 文档）' },
      { text: '在 OpenClaw 控制 UI 或官方流程中完成扫码登录（web.login.start / web.login.wait）' },
      { text: '若使用自建 WhatsApp API，填写下方 API URL 与 Token' },
    ],
    guideFooter:
      '本面板仅保存配置项；扫码登录需在 Gateway 侧完成。若插件未加载，请先按文档安装对应插件。',
    fields: [
      {
        key: 'apiUrl',
        label: 'API URL',
        placeholder: 'http://127.0.0.1:3002',
        hint: '自建桥接或本地 API 地址',
      },
      {
        key: 'token',
        label: 'Token',
        type: 'password',
      },
      {
        key: 'dmPolicy',
        label: '私信策略',
        type: 'select',
        options: policyOptions,
      },
      {
        key: 'groupPolicy',
        label: '群组策略',
        type: 'select',
        options: groupPolicyOptionsCommon,
      },
      {
        key: 'allowFrom',
        label: 'Allow From',
        placeholder: '可选，逗号分隔',
      },
    ],
  },
  qq: {
    guideSteps: [
      { text: '选择并部署 QQ 桥接（例如 OneBot / NapCat / LLOneBot）并确认可用' },
      { text: '在桥接侧获取 Access Token，并确认事件回调或 WebSocket 地址' },
      { text: '将机器人加入目标群，确认能收到群消息与私聊消息' },
    ],
    guideFooter:
      'QQ 接入通常依赖第三方桥接实现；字段命名与 OpenClaw 常见 QQ/OneBot 配置对齐。',
    fields: [
      {
        key: 'endpoint',
        label: 'Endpoint',
        required: true,
        placeholder: 'ws://127.0.0.1:3001 或 http://127.0.0.1:3001',
        hint: 'QQ 桥接服务地址（WebSocket 或 HTTP）',
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        placeholder: '可选，按桥接配置填写',
      },
      {
        key: 'mode',
        label: '连接模式',
        type: 'select',
        options: [
          { value: '', label: '默认' },
          { value: 'ws', label: 'WebSocket' },
          { value: 'http', label: 'HTTP 回调' },
        ],
      },
      {
        key: 'selfId',
        label: '机器人 QQ 号',
        placeholder: '可选，数字 ID',
      },
      {
        key: 'dmPolicy',
        label: '私信策略',
        type: 'select',
        options: policyOptions,
      },
      {
        key: 'groupPolicy',
        label: '群组策略',
        type: 'select',
        options: groupPolicyOptionsCommon,
      },
      { key: 'allowFrom', label: 'Allow From', placeholder: '可选，逗号分隔用户/群号' },
    ],
  },
  dingtalk: {
    guideSteps: [
      {
        text: '在钉钉开放平台创建企业内部应用并启用机器人能力',
        link: { href: 'https://open.dingtalk.com/', label: '钉钉开放平台' },
      },
      { text: '获取 Client ID / Client Secret 或机器人 Access Token（按接入模式）' },
      { text: '在事件订阅中配置回调地址与加签信息，并完成验证' },
    ],
    guideFooter:
      '钉钉存在内部应用、群机器人等多种模式；优先按你已接入的桥接方式填写字段。',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'dingxxxxxxxx',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
      },
      {
        key: 'appKey',
        label: 'App Key',
        placeholder: '可选，部分模式使用',
      },
      {
        key: 'appSecret',
        label: 'App Secret',
        type: 'password',
        hint: '可与 Client Secret 二选一，按实际接入方式填写',
      },
      {
        key: 'token',
        label: '事件订阅 Token',
        type: 'password',
      },
      {
        key: 'aesKey',
        label: 'AES Key',
        type: 'password',
      },
      { key: 'corpId', label: 'Corp ID', placeholder: 'dingxxxxxxxx' },
      { key: 'dmPolicy', label: '私信策略', type: 'select', options: policyOptions },
      { key: 'groupPolicy', label: '群组策略', type: 'select', options: groupPolicyOptionsCommon },
      { key: 'allowFrom', label: 'Allow From', placeholder: '可选，逗号分隔用户/会话 ID' },
    ],
  },
  wechat: {
    guideSteps: [
      { text: '确认使用企业微信机器人或微信桥接服务，并准备好回调地址' },
      { text: '填写企业 ID、Agent ID、Secret / Token / EncodingAESKey 等凭证' },
      { text: '在企业侧完成消息事件订阅并将机器人加入目标群聊' },
    ],
    guideFooter:
      '微信生态接入形态较多（企业微信/个人号桥接）；当前字段按企业微信常见配置给出。',
    fields: [
      { key: 'corpId', label: 'Corp ID', placeholder: 'wwxxxxxxxxxxxxxxxx' },
      { key: 'agentId', label: 'Agent ID', placeholder: '1000002' },
      { key: 'secret', label: 'Secret', type: 'password' },
      { key: 'token', label: 'Token', type: 'password' },
      { key: 'encodingAESKey', label: 'EncodingAESKey', type: 'password' },
      { key: 'apiUrl', label: 'API URL', placeholder: '可选，自建桥接地址' },
      { key: 'dmPolicy', label: '私信策略', type: 'select', options: policyOptions },
      { key: 'groupPolicy', label: '群组策略', type: 'select', options: groupPolicyOptionsCommon },
      { key: 'allowFrom', label: 'Allow From', placeholder: '可选，逗号分隔用户/群组 ID' },
    ],
  },
  matrix: {
    guideSteps: [
      {
        text: '准备 Matrix homeserver 与机器人账号（或 access token）',
        link: { href: 'https://matrix.org/docs/', label: 'Matrix Docs' },
      },
      { text: '将机器人加入目标 room，并确保具备读取/发送权限' },
      { text: '填写 homeserver URL、userId 与 access token 后保存并验证连接' },
    ],
    guideFooter: 'Matrix 建议先在测试 room 验证权限与事件同步，再切换到正式房间。',
    fields: [
      { key: 'homeserver', label: 'Homeserver URL', required: true, placeholder: 'https://matrix.org' },
      { key: 'userId', label: 'User ID', required: true, placeholder: '@bot:example.com' },
      { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
      { key: 'deviceId', label: 'Device ID', placeholder: '可选，如 BOTDEVICE1' },
      { key: 'roomId', label: '默认 Room ID', placeholder: '可选，如 !abcdef:example.com' },
      { key: 'dmPolicy', label: '私信策略', type: 'select', options: policyOptions },
      { key: 'groupPolicy', label: '群组策略', type: 'select', options: groupPolicyOptionsCommon },
      { key: 'allowFrom', label: 'Allow From', placeholder: '可选，逗号分隔用户/room ID' },
    ],
  },
  teams: {
    guideSteps: [
      {
        text: '在 Azure / Microsoft Bot Framework 创建 Teams Bot',
        link: { href: 'https://learn.microsoft.com/microsoftteams/platform/', label: 'Teams Platform' },
      },
      { text: '获取 App ID 与 App Password（或 Client Secret）' },
      { text: '在消息扩展/权限中开启机器人所需会话能力，并安装到团队或聊天' },
    ],
    guideFooter:
      'Teams 常见部署依赖公开可访问回调地址；若使用中转网关，请同时填写 endpoint。',
    fields: [
      { key: 'appId', label: 'App ID', required: true, placeholder: '00000000-0000-0000-0000-000000000000' },
      { key: 'appPassword', label: 'App Password', type: 'password', required: true },
      { key: 'tenantId', label: 'Tenant ID', placeholder: '可选，多租户场景可留空' },
      { key: 'endpoint', label: 'Endpoint', placeholder: '可选，事件入口 URL' },
      { key: 'dmPolicy', label: '私信策略', type: 'select', options: policyOptions },
      { key: 'groupPolicy', label: '群组策略', type: 'select', options: groupPolicyOptionsCommon },
      { key: 'allowFrom', label: 'Allow From', placeholder: '可选，逗号分隔用户/团队/频道 ID' },
    ],
  },
  signal: {
    guideSteps: [
      {
        text: '安装 signal-cli 并完成账号注册或链接',
        link: { href: 'https://github.com/AsamK/signal-cli', label: 'signal-cli' },
      },
      { text: '确认本机 signal-cli 可正常收发消息' },
      { text: '填写 Signal 账号（通常为 E.164 手机号）与可选 CLI 路径、HTTP 守护参数' },
    ],
    guideFooter: '需要本机安装 signal-cli；HTTP 模式需自行保证端口与 Gateway 可达。',
    fields: [
      {
        key: 'account',
        label: 'Signal 账号',
        required: true,
        placeholder: '+8613800138000',
      },
      {
        key: 'cliPath',
        label: 'signal-cli 路径',
        placeholder: '可选，默认从 PATH 查找',
      },
      {
        key: 'httpUrl',
        label: 'HTTP URL',
        placeholder: 'http://127.0.0.1:8080',
      },
      {
        key: 'httpHost',
        label: 'HTTP Host',
        placeholder: '127.0.0.1',
      },
      {
        key: 'httpPort',
        label: 'HTTP Port',
        type: 'number',
        placeholder: '8080',
      },
      {
        key: 'dmPolicy',
        label: '私信策略',
        type: 'select',
        options: policyOptions,
      },
      {
        key: 'groupPolicy',
        label: '群组策略',
        type: 'select',
        options: [
          { value: '', label: '默认' },
          { value: 'all', label: '所有群组' },
          { value: 'mentioned', label: '仅 @ 机器人' },
          { value: 'allowlist', label: '白名单' },
          { value: 'disabled', label: '禁用' },
        ],
      },
      {
        key: 'allowFrom',
        label: 'Allow From',
        placeholder: '可选，逗号分隔',
      },
    ],
  },
}

export function getChannelRegistryEntry(typeId: string): ChannelRegistryEntry | null {
  return CHANNEL_REGISTRY[typeId] ?? null
}

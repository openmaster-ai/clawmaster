import type { TFunction } from 'i18next'
import type { ChannelFieldDef, ChannelRegistryEntry, GuideStep } from './registryTypes'

function tr(t: TFunction, key: string): string {
  return t(key)
}

type GuideSpec =
  | { k: string }
  | { k: string; link: { href: string; labelKey: string } }

function guide(t: TFunction, specs: GuideSpec[]): GuideStep[] {
  return specs.map((s) => {
    const text = tr(t, s.k)
    if (!('link' in s)) return { text }
    return { text, link: { href: s.link.href, label: tr(t, s.link.labelKey) } }
  })
}

export function buildChannelRegistry(t: TFunction): Record<string, ChannelRegistryEntry> {
  const policyDm: ChannelFieldDef['options'] = [
    { value: '', label: tr(t, 'policy_dm_default') },
    { value: 'allow', label: tr(t, 'policy_dm_allow') },
    { value: 'deny', label: tr(t, 'policy_dm_deny') },
  ]
  const groupCommon: ChannelFieldDef['options'] = [
    { value: '', label: tr(t, 'policy_group_default') },
    { value: 'all', label: tr(t, 'policy_group_all') },
    { value: 'mentioned', label: tr(t, 'policy_group_mentioned') },
    { value: 'allowlist', label: tr(t, 'policy_group_allowlist') },
    { value: 'disabled', label: tr(t, 'policy_group_disabled') },
  ]
  const groupSlack: ChannelFieldDef['options'] = [
    { value: '', label: tr(t, 'policy_group_default') },
    { value: 'all', label: tr(t, 'policy_group_slack_all') },
    { value: 'mentioned', label: tr(t, 'policy_group_mentioned') },
    { value: 'allowlist', label: tr(t, 'policy_group_allowlist') },
    { value: 'disabled', label: tr(t, 'policy_group_slack_disabled') },
  ]
  const groupSignal: ChannelFieldDef['options'] = [
    { value: '', label: tr(t, 'policy_group_default') },
    { value: 'all', label: tr(t, 'policy_group_signal_all') },
    { value: 'mentioned', label: tr(t, 'policy_group_signal_mentioned') },
    { value: 'allowlist', label: tr(t, 'policy_group_allowlist') },
    { value: 'disabled', label: tr(t, 'policy_group_signal_disabled') },
  ]

  return {
    feishu: {
      guideSteps: guide(t, [
        { k: 'feishu_g0', link: { href: 'https://open.feishu.cn/app', labelKey: 'feishu_g0_link' } },
        { k: 'feishu_g1' },
        { k: 'feishu_g2' },
        { k: 'feishu_g3' },
        { k: 'feishu_g4' },
        { k: 'feishu_g5' },
      ]),
      guideFooter: tr(t, 'feishu_footer'),
      pairingNote: tr(t, 'feishu_pairing'),
      fields: [
        {
          key: 'appId',
          label: 'App ID',
          required: true,
          placeholder: 'cli_xxx',
          hint: tr(t, 'feishu_hint_appId'),
        },
        {
          key: 'appSecret',
          label: 'App Secret',
          type: 'password',
          required: true,
          placeholder: 'sec_xxx',
          hint: tr(t, 'feishu_hint_appSecret'),
        },
        {
          key: 'domain',
          label: tr(t, 'label_platform_domain'),
          type: 'select',
          options: [
            { value: '', label: tr(t, 'feishu_domain_feishu') },
            { value: 'lark', label: tr(t, 'feishu_domain_lark') },
          ],
          hint: tr(t, 'feishu_hint_domain'),
        },
        {
          key: 'dmPolicy',
          label: tr(t, 'label_dm_policy'),
          type: 'select',
          options: policyDm,
          hint: tr(t, 'hint_dm_policy_default'),
        },
        {
          key: 'groupPolicy',
          label: tr(t, 'label_group_policy'),
          type: 'select',
          options: groupCommon,
        },
        {
          key: 'allowFrom',
          label: 'Allow From',
          placeholder: tr(t, 'placeholder_allowfrom_users'),
          hint: tr(t, 'hint_allowfrom_sessions'),
        },
      ],
    },
    telegram: {
      guideSteps: guide(t, [
        { k: 'tg_g0', link: { href: 'https://t.me/BotFather', labelKey: 'tg_link_botfather' } },
        { k: 'tg_g1' },
        { k: 'tg_g2' },
        { k: 'tg_g3' },
      ]),
      guideFooter: tr(t, 'tg_footer'),
      pairingNote: tr(t, 'tg_pairing'),
      fields: [
        { key: 'botToken', label: 'Bot Token', type: 'password', required: true, placeholder: '123456:ABC-DEF...' },
        {
          key: 'webhookPath',
          label: 'Webhook Path',
          placeholder: '/telegram/webhook',
          hint: tr(t, 'tg_hint_webhook'),
        },
        { key: 'dmPolicy', label: tr(t, 'label_dm_policy'), type: 'select', options: policyDm },
        { key: 'groupPolicy', label: tr(t, 'label_group_policy'), type: 'select', options: groupCommon },
        { key: 'allowFrom', label: 'Allow From', placeholder: tr(t, 'placeholder_allowfrom_chat') },
      ],
    },
    discord: {
      guideSteps: guide(t, [
        {
          k: 'dc_g0',
          link: { href: 'https://discord.com/developers/applications', labelKey: 'dc_g0_link' },
        },
        { k: 'dc_g1' },
        { k: 'dc_g2' },
        { k: 'dc_g3' },
      ]),
      guideFooter: tr(t, 'dc_footer'),
      pairingNote: tr(t, 'dc_pairing'),
      fields: [
        { key: 'token', label: 'Bot Token', type: 'password', required: true, placeholder: 'MTQx...' },
        { key: 'dmPolicy', label: tr(t, 'label_dm_policy'), type: 'select', options: policyDm },
        { key: 'groupPolicy', label: tr(t, 'label_group_policy'), type: 'select', options: groupCommon },
        { key: 'allowFrom', label: 'Allow From', placeholder: tr(t, 'placeholder_allowfrom_channels') },
      ],
    },
    slack: {
      guideSteps: guide(t, [
        { k: 'sl_g0', link: { href: 'https://api.slack.com/apps', labelKey: 'sl_g0_link' } },
        { k: 'sl_g1' },
        { k: 'sl_g2' },
        { k: 'sl_g3' },
        { k: 'sl_g4' },
      ]),
      guideFooter: tr(t, 'sl_footer'),
      fields: [
        {
          key: 'mode',
          label: tr(t, 'label_connection_mode'),
          type: 'select',
          required: true,
          options: [
            { value: 'socket', label: tr(t, 'sl_mode_socket') },
            { value: 'http', label: tr(t, 'sl_mode_http') },
          ],
        },
        { key: 'botToken', label: 'Bot Token', type: 'password', required: true, placeholder: 'xoxb-...' },
        {
          key: 'appToken',
          label: 'App-Level Token (xapp-)',
          type: 'password',
          requiredWhen: { key: 'mode', value: 'socket' },
          hint: tr(t, 'sl_hint_app_token'),
        },
        {
          key: 'signingSecret',
          label: 'Signing Secret',
          type: 'password',
          requiredWhen: { key: 'mode', value: 'http' },
          hint: tr(t, 'sl_hint_signing'),
        },
        { key: 'teamId', label: 'Team ID', placeholder: tr(t, 'sl_placeholder_team') },
        { key: 'webhookPath', label: 'Webhook Path', placeholder: tr(t, 'sl_placeholder_webhook') },
        { key: 'dmPolicy', label: tr(t, 'label_dm_policy'), type: 'select', options: policyDm },
        {
          key: 'groupPolicy',
          label: tr(t, 'label_group_policy'),
          type: 'select',
          options: groupSlack,
        },
        {
          key: 'allowFrom',
          label: 'Allow From',
          placeholder: tr(t, 'placeholder_allowfrom_slack'),
          hint: tr(t, 'hint_allowfrom_slack'),
        },
      ],
    },
    whatsapp: {
      guideSteps: guide(t, [{ k: 'wa_g0' }, { k: 'wa_g1' }, { k: 'wa_g2' }]),
      guideFooter: tr(t, 'wa_footer'),
      fields: [
        {
          key: 'apiUrl',
          label: 'API URL',
          placeholder: 'http://127.0.0.1:3002',
          hint: tr(t, 'wa_hint_api'),
        },
        { key: 'token', label: 'Token', type: 'password' },
        { key: 'dmPolicy', label: tr(t, 'label_dm_policy'), type: 'select', options: policyDm },
        { key: 'groupPolicy', label: tr(t, 'label_group_policy'), type: 'select', options: groupCommon },
        { key: 'allowFrom', label: 'Allow From', placeholder: tr(t, 'placeholder_optional_csv') },
      ],
    },
    qq: {
      guideSteps: guide(t, [{ k: 'qq_g0' }, { k: 'qq_g1' }, { k: 'qq_g2' }]),
      guideFooter: tr(t, 'qq_footer'),
      fields: [
        {
          key: 'endpoint',
          label: 'Endpoint',
          required: true,
          placeholder: 'ws://127.0.0.1:3001',
          hint: tr(t, 'qq_hint_endpoint'),
        },
        {
          key: 'accessToken',
          label: 'Access Token',
          type: 'password',
          placeholder: tr(t, 'qq_placeholder_token'),
        },
        {
          key: 'mode',
          label: tr(t, 'label_connection_mode'),
          type: 'select',
          options: [
            { value: '', label: tr(t, 'qq_mode_default') },
            { value: 'ws', label: tr(t, 'qq_mode_ws') },
            { value: 'http', label: tr(t, 'qq_mode_http') },
          ],
        },
        { key: 'selfId', label: tr(t, 'qq_label_selfid'), placeholder: tr(t, 'qq_placeholder_selfid') },
        { key: 'dmPolicy', label: tr(t, 'label_dm_policy'), type: 'select', options: policyDm },
        { key: 'groupPolicy', label: tr(t, 'label_group_policy'), type: 'select', options: groupCommon },
        { key: 'allowFrom', label: 'Allow From', placeholder: tr(t, 'qq_placeholder_allow') },
      ],
    },
    dingtalk: {
      guideSteps: guide(t, [
        { k: 'dt_g0', link: { href: 'https://open.dingtalk.com/', labelKey: 'dt_g0_link' } },
        { k: 'dt_g1' },
        { k: 'dt_g2' },
      ]),
      guideFooter: tr(t, 'dt_footer'),
      fields: [
        { key: 'clientId', label: 'Client ID', placeholder: 'dingxxxxxxxx' },
        { key: 'clientSecret', label: 'Client Secret', type: 'password' },
        { key: 'appKey', label: 'App Key', placeholder: tr(t, 'dt_placeholder_appkey') },
        { key: 'appSecret', label: 'App Secret', type: 'password', hint: tr(t, 'dt_hint_appsecret') },
        { key: 'token', label: tr(t, 'dt_label_evt_token'), type: 'password' },
        { key: 'aesKey', label: 'AES Key', type: 'password' },
        { key: 'corpId', label: 'Corp ID', placeholder: 'dingxxxxxxxx' },
        { key: 'dmPolicy', label: tr(t, 'label_dm_policy'), type: 'select', options: policyDm },
        { key: 'groupPolicy', label: tr(t, 'label_group_policy'), type: 'select', options: groupCommon },
        { key: 'allowFrom', label: 'Allow From', placeholder: tr(t, 'placeholder_allowfrom_sessions') },
      ],
    },
    wechat: {
      guideSteps: guide(t, [{ k: 'wc_g0' }, { k: 'wc_g1' }, { k: 'wc_g2' }]),
      guideFooter: tr(t, 'wc_footer'),
      fields: [
        { key: 'corpId', label: 'Corp ID', placeholder: 'wwxxxxxxxxxxxxxxxx' },
        { key: 'agentId', label: 'Agent ID', placeholder: '1000002' },
        { key: 'secret', label: 'Secret', type: 'password' },
        { key: 'token', label: 'Token', type: 'password' },
        { key: 'encodingAESKey', label: 'EncodingAESKey', type: 'password' },
        { key: 'apiUrl', label: 'API URL', placeholder: tr(t, 'wc_placeholder_api') },
        { key: 'dmPolicy', label: tr(t, 'label_dm_policy'), type: 'select', options: policyDm },
        { key: 'groupPolicy', label: tr(t, 'label_group_policy'), type: 'select', options: groupCommon },
        { key: 'allowFrom', label: 'Allow From', placeholder: tr(t, 'placeholder_allowfrom_users') },
      ],
    },
    matrix: {
      guideSteps: guide(t, [
        { k: 'mx_g0', link: { href: 'https://matrix.org/docs/', labelKey: 'mx_g0_link' } },
        { k: 'mx_g1' },
        { k: 'mx_g2' },
      ]),
      guideFooter: tr(t, 'mx_footer'),
      fields: [
        { key: 'homeserver', label: 'Homeserver URL', required: true, placeholder: 'https://matrix.org' },
        { key: 'userId', label: 'User ID', required: true, placeholder: '@bot:example.com' },
        { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
        { key: 'deviceId', label: 'Device ID', placeholder: tr(t, 'mx_placeholder_device') },
        { key: 'roomId', label: tr(t, 'mx_label_room'), placeholder: tr(t, 'mx_placeholder_room') },
        { key: 'dmPolicy', label: tr(t, 'label_dm_policy'), type: 'select', options: policyDm },
        { key: 'groupPolicy', label: tr(t, 'label_group_policy'), type: 'select', options: groupCommon },
        { key: 'allowFrom', label: 'Allow From', placeholder: tr(t, 'mx_placeholder_allow') },
      ],
    },
    teams: {
      guideSteps: guide(t, [
        {
          k: 'tm_g0',
          link: { href: 'https://learn.microsoft.com/microsoftteams/platform/', labelKey: 'tm_g0_link' },
        },
        { k: 'tm_g1' },
        { k: 'tm_g2' },
      ]),
      guideFooter: tr(t, 'tm_footer'),
      fields: [
        {
          key: 'appId',
          label: 'App ID',
          required: true,
          placeholder: '00000000-0000-0000-0000-000000000000',
        },
        { key: 'appPassword', label: 'App Password', type: 'password', required: true },
        { key: 'tenantId', label: 'Tenant ID', placeholder: tr(t, 'tm_placeholder_tenant') },
        { key: 'endpoint', label: 'Endpoint', placeholder: tr(t, 'tm_placeholder_endpoint') },
        { key: 'dmPolicy', label: tr(t, 'label_dm_policy'), type: 'select', options: policyDm },
        { key: 'groupPolicy', label: tr(t, 'label_group_policy'), type: 'select', options: groupCommon },
        { key: 'allowFrom', label: 'Allow From', placeholder: tr(t, 'tm_placeholder_allow') },
      ],
    },
    signal: {
      guideSteps: guide(t, [
        { k: 'sg_g0', link: { href: 'https://github.com/AsamK/signal-cli', labelKey: 'sg_g0_link' } },
        { k: 'sg_g1' },
        { k: 'sg_g2' },
      ]),
      guideFooter: tr(t, 'sg_footer'),
      fields: [
        { key: 'account', label: tr(t, 'sg_label_account'), required: true, placeholder: '+8613800138000' },
        { key: 'cliPath', label: tr(t, 'sg_label_clipath'), placeholder: tr(t, 'sg_placeholder_clipath') },
        { key: 'httpUrl', label: 'HTTP URL', placeholder: 'http://127.0.0.1:8080' },
        { key: 'httpHost', label: 'HTTP Host', placeholder: '127.0.0.1' },
        { key: 'httpPort', label: 'HTTP Port', type: 'number', placeholder: '8080' },
        { key: 'dmPolicy', label: tr(t, 'label_dm_policy'), type: 'select', options: policyDm },
        { key: 'groupPolicy', label: tr(t, 'label_group_policy'), type: 'select', options: groupSignal },
        { key: 'allowFrom', label: 'Allow From', placeholder: tr(t, 'placeholder_optional_csv') },
      ],
    },
  }
}

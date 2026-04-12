import legacy from '@/i18n/zh.json'
import main from './main/zh'
import channelReg from './channelReg/zh'

const legacyNamespaces = Object.fromEntries(
  Object.entries(legacy).filter(([key]) =>
    key.startsWith('dashboard.task.') || key.startsWith('docs.') || key.startsWith('logs.'),
  ),
)

export default { ...main, ...legacyNamespaces, ...channelReg }

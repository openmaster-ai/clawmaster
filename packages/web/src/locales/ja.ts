import legacy from '@/i18n/ja.json'
import main from './main/ja'
import channelReg from './channelReg/ja'

const legacyNamespaces = Object.fromEntries(
  Object.entries(legacy).filter(([key]) =>
    key.startsWith('dashboard.task.') || key.startsWith('docs.') || key.startsWith('logs.'),
  ),
)

export default { ...main, ...legacyNamespaces, ...channelReg }

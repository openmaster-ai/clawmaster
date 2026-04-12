import legacy from '@/i18n/en.json'
import main from './main/en'
import channelReg from './channelReg/en'

const legacyNamespaces = Object.fromEntries(
  Object.entries(legacy).filter(([key]) =>
    key.startsWith('dashboard.task.') || key.startsWith('docs.') || key.startsWith('logs.'),
  ),
)

export default { ...main, ...legacyNamespaces, ...channelReg }

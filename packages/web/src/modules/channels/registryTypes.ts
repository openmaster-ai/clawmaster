/**
 * Channel wizard types (shared by buildChannelRegistry).
 */

export type FieldType = 'text' | 'password' | 'number' | 'select'

export type ChannelFieldDef = {
  key: string
  label: string
  type?: FieldType
  placeholder?: string
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
  guideFooter?: string
  pairingNote?: string
}

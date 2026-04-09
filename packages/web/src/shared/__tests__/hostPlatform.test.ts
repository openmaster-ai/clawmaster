import { describe, expect, it } from 'vitest'

import { isWindowsHostPlatform } from '../hostPlatform'

describe('isWindowsHostPlatform', () => {
  it('accepts Node and Tauri Windows platform spellings', () => {
    expect(isWindowsHostPlatform('win32')).toBe(true)
    expect(isWindowsHostPlatform('windows')).toBe(true)
  })

  it('rejects non-Windows platform spellings', () => {
    expect(isWindowsHostPlatform('darwin')).toBe(false)
    expect(isWindowsHostPlatform('linux')).toBe(false)
    expect(isWindowsHostPlatform(undefined)).toBe(false)
  })
})

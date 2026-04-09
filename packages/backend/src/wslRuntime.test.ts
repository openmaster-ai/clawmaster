import assert from 'node:assert/strict'
import test from 'node:test'

import { parseWslListVerbose, resolveSelectedWslDistroFromList } from './wslRuntime.js'

test('parseWslListVerbose extracts distro state, version, and default flag', () => {
  const distros = parseWslListVerbose(`
  NAME                   STATE           VERSION
* Ubuntu-24.04           Running         2
  Debian                 Stopped         2
  docker-desktop         Running         2
`)

  assert.deepEqual(distros, [
    { name: 'Ubuntu-24.04', state: 'Running', version: 2, isDefault: true },
    { name: 'Debian', state: 'Stopped', version: 2, isDefault: false },
    { name: 'docker-desktop', state: 'Running', version: 2, isDefault: false },
  ])
})

test('resolveSelectedWslDistroFromList returns null when a saved distro is missing', () => {
  const distros = parseWslListVerbose(`
  NAME                   STATE           VERSION
* Ubuntu-24.04           Running         2
  Debian                 Stopped         2
`)

  assert.equal(
    resolveSelectedWslDistroFromList(distros, {
      mode: 'wsl2',
      wslDistro: 'Renamed-Ubuntu',
    }),
    null
  )
})

test('resolveSelectedWslDistroFromList falls back only when no distro is selected', () => {
  const distros = parseWslListVerbose(`
  NAME                   STATE           VERSION
* Ubuntu-24.04           Running         2
  Debian                 Stopped         2
`)

  assert.equal(resolveSelectedWslDistroFromList(distros, { mode: 'wsl2' }), 'Ubuntu-24.04')
})

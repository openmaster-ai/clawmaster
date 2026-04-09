import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeExecRequest } from './execRoutes.js'

test('keeps bash unresolved when dispatching into WSL', () => {
  const normalized = normalizeExecRequest('bash', ['-lc', 'printf %s "$HOME"', '~/probe'], {
    useWslRuntime: true,
  })

  assert.equal(normalized.cmd, 'bash')
  assert.deepEqual(normalized.args, ['-lc', 'printf %s "$HOME"', '~/probe'])
})

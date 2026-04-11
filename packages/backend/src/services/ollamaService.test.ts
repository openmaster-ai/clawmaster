import assert from 'node:assert/strict'
import test from 'node:test'

import {
  OLLAMA_USER_LOCAL_INSTALL_SCRIPT,
  runOllamaInstallWithFallback,
} from './ollamaService.js'

test('runOllamaInstallWithFallback returns the primary install output when it succeeds', async () => {
  const result = await runOllamaInstallWithFallback(
    async () => ({ code: 0, stdout: 'installed via script\n', stderr: '' }),
    async () => ({ code: 0, stdout: 'installed via fallback\n', stderr: '' }),
  )

  assert.equal(result, 'installed via script')
})

test('runOllamaInstallWithFallback falls back to the per-user install when the official script fails', async () => {
  let fallbackCalled = false
  const result = await runOllamaInstallWithFallback(
    async () => ({ code: 1, stdout: '', stderr: 'sudo required' }),
    async () => {
      fallbackCalled = true
      return { code: 0, stdout: 'Installed ollama v0.9.0 to ~/.local/bin/ollama\n', stderr: '' }
    },
  )

  assert.equal(fallbackCalled, true)
  assert.equal(result, 'Installed ollama v0.9.0 to ~/.local/bin/ollama')
})

test('runOllamaInstallWithFallback surfaces the fallback failure when both install paths fail', async () => {
  await assert.rejects(
    () => runOllamaInstallWithFallback(
      async () => ({ code: 1, stdout: '', stderr: 'script failed' }),
      async () => ({ code: 1, stdout: '', stderr: 'zstd not found' }),
    ),
    /zstd not found/,
  )
})

test('runOllamaInstallWithFallback can skip the fallback path entirely', async () => {
  let fallbackCalled = false
  await assert.rejects(
    () => runOllamaInstallWithFallback(
      async () => ({ code: 1, stdout: '', stderr: 'primary failed' }),
      async () => {
        fallbackCalled = true
        return { code: 0, stdout: 'should not run', stderr: '' }
      },
      { enableFallback: false },
    ),
    /primary failed/,
  )
  assert.equal(fallbackCalled, false)
})

test('OLLAMA_USER_LOCAL_INSTALL_SCRIPT installs into the per-user ~/.local prefix', () => {
  assert.match(OLLAMA_USER_LOCAL_INSTALL_SCRIPT, /mkdir -p ~\/\.local\/bin ~\/\.local\/lib\/ollama/)
  assert.match(OLLAMA_USER_LOCAL_INSTALL_SCRIPT, /tar x -C ~\/\.local/)
  assert.match(OLLAMA_USER_LOCAL_INSTALL_SCRIPT, /Installed ollama \$\{LATEST\} to ~\/\.local\/bin\/ollama/)
})

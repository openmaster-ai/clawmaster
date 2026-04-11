import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWslSkillCandidateArrayForTest,
  getHostCommandExecOptionsForTest,
  resolveHostCommandPathForTest,
} from './skillGuardService.js'

test('resolveHostCommandPathForTest keeps non-Windows commands unchanged', () => {
  assert.equal(
    resolveHostCommandPathForTest('npm', { platform: 'linux' }),
    'npm',
  )
})

test('resolveHostCommandPathForTest prefers the first where result on Windows', () => {
  assert.equal(
    resolveHostCommandPathForTest('npm', {
      platform: 'win32',
      whereOutput: 'C:\\Program Files\\nodejs\\npm.cmd\r\nC:\\other\\npm.exe\r\n',
    }),
    'C:\\Program Files\\nodejs\\npm.cmd',
  )
})

test('resolveHostCommandPathForTest falls back to the bare command when where output is empty', () => {
  assert.equal(
    resolveHostCommandPathForTest('npm', {
      platform: 'win32',
      whereOutput: '',
    }),
    'npm',
  )
})

test('getHostCommandExecOptionsForTest enables shell execution for Windows npm.cmd shims', () => {
  assert.deepEqual(
    getHostCommandExecOptionsForTest({ platform: 'win32' }),
    {
      shell: true,
      windowsHide: true,
    },
  )
})

test('getHostCommandExecOptionsForTest keeps direct exec on non-Windows hosts', () => {
  assert.deepEqual(
    getHostCommandExecOptionsForTest({ platform: 'linux' }),
    {
      shell: false,
      windowsHide: true,
    },
  )
})

test('buildWslSkillCandidateArrayForTest shell-quotes untrusted skill tokens', () => {
  assert.equal(
    buildWslSkillCandidateArrayForTest(['$(touch /tmp/pwn)', `o'hai`]),
    `'$(touch /tmp/pwn)' 'o'"'"'hai'`,
  )
})

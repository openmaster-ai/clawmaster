import assert from 'node:assert/strict'
import test from 'node:test'

import {
  defaultManagedEngineForTest,
  ensureMemoryIndexCompatibilityCommandForTest,
} from './index.js'

class FakeCommand {
  commands: FakeCommand[] = []
  constructor(private readonly commandName: string) {}

  name(): string {
    return this.commandName
  }

  command(name: string): FakeCommand {
    const child = new FakeCommand(name)
    this.commands.push(child)
    return child
  }

  description(_text: string): FakeCommand {
    return this
  }

  option(_flags: string, _description: string, _defaultValue?: string): FakeCommand {
    return this
  }

  action(_handler: (...args: unknown[]) => unknown): FakeCommand {
    return this
  }
}

test('defaultManagedEngineForTest only enables seekdb on supported Linux architectures', () => {
  assert.equal(defaultManagedEngineForTest('linux', 'x64'), 'powermem-seekdb')
  assert.equal(defaultManagedEngineForTest('linux', 'arm64'), 'powermem-seekdb')
  assert.equal(defaultManagedEngineForTest('linux', 'ia32'), 'powermem-sqlite')
  assert.equal(defaultManagedEngineForTest('linux', 'riscv64'), 'powermem-sqlite')
  assert.equal(defaultManagedEngineForTest('darwin', 'arm64'), 'powermem-sqlite')
  assert.equal(defaultManagedEngineForTest('win32', 'x64'), 'powermem-sqlite')
})

test('ensureMemoryIndexCompatibilityCommandForTest adds memory index to an existing top-level memory command', () => {
  const program = new FakeCommand('root')
  const memory = program.command('memory').description('native memory')
  memory.command('status').description('native status')

  ensureMemoryIndexCompatibilityCommandForTest(program, () => undefined)

  assert.deepEqual(
    memory.commands.map((command) => command.name()),
    ['status', 'index'],
  )
})

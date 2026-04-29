import { describe, expect, it } from 'vitest'

import { createWebVitestTestConfig } from '../../../vitest.testConfig'

describe('createWebVitestTestConfig', () => {
  it('uses a single thread worker on Windows to avoid fork startup timeouts', () => {
    expect(createWebVitestTestConfig('win32')).toMatchObject({
      pool: 'threads',
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
    })
  })

  it('does not constrain worker settings on non-Windows platforms', () => {
    expect(createWebVitestTestConfig('linux')).not.toMatchObject({
      pool: expect.any(String),
      fileParallelism: expect.any(Boolean),
      maxWorkers: expect.any(Number),
      minWorkers: expect.any(Number),
    })
  })
})

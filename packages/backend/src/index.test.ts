import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createApp, resolveFrontendDistDir } from './index.js'

function withFrontendDist(dir: string, fn: () => Promise<void> | void) {
  const previous = process.env['CLAWMASTER_FRONTEND_DIST']
  process.env['CLAWMASTER_FRONTEND_DIST'] = dir
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) {
        delete process.env['CLAWMASTER_FRONTEND_DIST']
      } else {
        process.env['CLAWMASTER_FRONTEND_DIST'] = previous
      }
    })
}

function withServiceToken(token: string | undefined, fn: () => Promise<void> | void) {
  const previous = process.env['CLAWMASTER_SERVICE_TOKEN']
  if (token === undefined) {
    delete process.env['CLAWMASTER_SERVICE_TOKEN']
  } else {
    process.env['CLAWMASTER_SERVICE_TOKEN'] = token
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) {
        delete process.env['CLAWMASTER_SERVICE_TOKEN']
      } else {
        process.env['CLAWMASTER_SERVICE_TOKEN'] = previous
      }
    })
}

test('resolveFrontendDistDir prefers the explicit packaged frontend dist', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-frontend-dist-'))
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>ClawMaster</title>', 'utf8')

  await withFrontendDist(dir, () => {
    assert.equal(resolveFrontendDistDir(), dir)
  })
})

test('createApp serves the packaged frontend index for non-api routes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-frontend-serve-'))
  const html = '<!doctype html><html><body>ClawMaster Service</body></html>'
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8')

  await withFrontendDist(dir, async () => {
    const app = createApp()
    const server = app.listen(0, '127.0.0.1')

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve)
        server.once('error', reject)
      })

      const address = server.address()
      assert.ok(address && typeof address === 'object')

      const response = await fetch(`http://127.0.0.1:${address.port}/settings`)
      assert.equal(response.status, 200)
      assert.match(await response.text(), /ClawMaster Service/)
    } finally {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error)
            else resolve()
          })
        })
      }
    }
  })
})

test('createApp protects api routes when a service token is configured', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-frontend-auth-'))
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><body>ClawMaster Service</body></html>', 'utf8')

  await withFrontendDist(dir, async () => {
    await withServiceToken('secret-token', async () => {
      const app = createApp()
      const server = app.listen(0, '127.0.0.1')

      try {
        await new Promise<void>((resolve, reject) => {
          server.once('listening', resolve)
          server.once('error', reject)
        })

        const address = server.address()
        assert.ok(address && typeof address === 'object')

        const apiResponse = await fetch(`http://127.0.0.1:${address.port}/api/system/detect`)
        assert.equal(apiResponse.status, 401)

        const authedResponse = await fetch(`http://127.0.0.1:${address.port}/api/system/detect`, {
          headers: { Authorization: 'Bearer secret-token' },
        })
        assert.equal(authedResponse.status, 200)

        const htmlResponse = await fetch(`http://127.0.0.1:${address.port}/settings`)
        assert.equal(htmlResponse.status, 200)
      } finally {
        if (server.listening) {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error)
              else resolve()
            })
          })
        }
      }
    })
  })
})

test('createApp rejects destructive settings actions without the danger header in service mode', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-frontend-danger-'))
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><body>ClawMaster Service</body></html>', 'utf8')

  await withFrontendDist(dir, async () => {
    await withServiceToken('secret-token', async () => {
      const app = createApp()
      const server = app.listen(0, '127.0.0.1')

      try {
        await new Promise<void>((resolve, reject) => {
          server.once('listening', resolve)
          server.once('error', reject)
        })

        const address = server.address()
        assert.ok(address && typeof address === 'object')
        const baseUrl = `http://127.0.0.1:${address.port}`

        const removeResponse = await fetch(`${baseUrl}/api/settings/remove-openclaw-data`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer secret-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ confirm: 'DELETE' }),
        })
        assert.equal(removeResponse.status, 403)

        const resetResponse = await fetch(`${baseUrl}/api/settings/reset-config`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer secret-token',
          },
        })
        assert.equal(resetResponse.status, 403)

        const restoreResponse = await fetch(`${baseUrl}/api/settings/openclaw-restore`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer secret-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tarPath: '' }),
        })
        assert.equal(restoreResponse.status, 403)

        const managedResetResponse = await fetch(`${baseUrl}/api/memory/managed/reset`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer secret-token',
          },
        })
        assert.equal(managedResetResponse.status, 403)

        const bridgeSyncResponse = await fetch(`${baseUrl}/api/memory/managed/bridge/sync`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer secret-token',
          },
        })
        assert.equal(bridgeSyncResponse.status, 403)
      } finally {
        if (server.listening) {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error)
              else resolve()
            })
          })
        }
      }
    })
  })
})

test('createApp allows destructive restore validation when the danger header is present', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-frontend-danger-ok-'))
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><body>ClawMaster Service</body></html>', 'utf8')

  await withFrontendDist(dir, async () => {
    await withServiceToken('secret-token', async () => {
      const app = createApp()
      const server = app.listen(0, '127.0.0.1')

      try {
        await new Promise<void>((resolve, reject) => {
          server.once('listening', resolve)
          server.once('error', reject)
        })

        const address = server.address()
        assert.ok(address && typeof address === 'object')
        const baseUrl = `http://127.0.0.1:${address.port}`

        const restoreResponse = await fetch(`${baseUrl}/api/settings/openclaw-restore`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer secret-token',
            'X-Clawmaster-Danger-Token': 'secret-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tarPath: '' }),
        })
        assert.equal(restoreResponse.status, 400)
      } finally {
        if (server.listening) {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error)
              else resolve()
            })
          })
        }
      }
    })
  })
})

test('createApp rejects unsafe config dot-path writes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-frontend-config-'))
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><body>ClawMaster Service</body></html>', 'utf8')

  await withFrontendDist(dir, async () => {
    await withServiceToken('secret-token', async () => {
      const app = createApp()
      const server = app.listen(0, '127.0.0.1')

      try {
        await new Promise<void>((resolve, reject) => {
          server.once('listening', resolve)
          server.once('error', reject)
        })

        const address = server.address()
        assert.ok(address && typeof address === 'object')
        const baseUrl = `http://127.0.0.1:${address.port}`

        const response = await fetch(`${baseUrl}/api/config/${encodeURIComponent('__proto__.polluted')}`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer secret-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ value: true }),
        })

        assert.equal(response.status, 400)
        assert.match(await response.text(), /Unsafe config path segment: __proto__/)
        assert.equal(({} as Record<string, unknown>).polluted, undefined)
      } finally {
        if (server.listening) {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error)
              else resolve()
            })
          })
        }
      }
    })
  })
})

import { describe, expect, it } from 'vitest'
import { buildGatewayChatUrl, buildGatewayUrl, buildGatewayWebUiUrl } from '../gatewayUrl'

describe('buildGatewayUrl', () => {
  it('maps loopback bind to a browser-safe local host', () => {
    expect(buildGatewayUrl({
      gateway: {
        port: 18789,
        bind: 'loopback',
      },
    })).toBe('http://127.0.0.1:18789')
  })

  it('maps wildcard binds to loopback for browser access', () => {
    expect(buildGatewayUrl({
      gateway: {
        port: 3010,
        bind: '0.0.0.0',
      },
    })).toBe('http://127.0.0.1:3010')
  })

  it('maps ipv6 wildcard binds to ipv6 loopback for browser access', () => {
    expect(buildGatewayUrl({
      gateway: {
        port: 3010,
        bind: '::',
      },
    })).toBe('http://[::1]:3010')
  })

  it('brackets bare ipv6 binds for browser-safe urls', () => {
    expect(buildGatewayUrl({
      gateway: {
        port: 3010,
        bind: '::1',
      },
    })).toBe('http://[::1]:3010')
  })

  it('includes the control ui base path when requested', () => {
    expect(buildGatewayUrl({
      gateway: {
        port: 3010,
        bind: 'loopback',
        controlUi: { basePath: '/openclaw' },
      },
    }, { includeBasePath: true })).toBe('http://127.0.0.1:3010/openclaw')
  })

  it('normalizes malformed control ui base paths before building urls', () => {
    expect(buildGatewayUrl({
      gateway: {
        port: 3010,
        bind: 'loopback',
        controlUi: { basePath: 'openclaw/' },
      },
    }, { includeBasePath: true })).toBe('http://127.0.0.1:3010/openclaw')
  })

  it('builds an authenticated webui url when token auth is enabled', () => {
    expect(buildGatewayWebUiUrl({
      gateway: {
        port: 3010,
        bind: 'loopback',
        auth: { mode: 'token', token: 'secret-token' },
        controlUi: { basePath: '/openclaw' },
      },
    })).toBe('http://127.0.0.1:3010/openclaw?token=secret-token')
  })

  it('does not append a token when gateway auth is disabled', () => {
    expect(buildGatewayWebUiUrl({
      gateway: {
        port: 3010,
        bind: 'loopback',
        auth: { mode: 'none', token: 'secret-token' },
      },
    })).toBe('http://127.0.0.1:3010/')
  })

  it('builds an authenticated chat url for a specific session key', () => {
    expect(buildGatewayChatUrl({
      gateway: {
        port: 3010,
        bind: 'loopback',
        auth: { mode: 'token', token: 'secret-token' },
        controlUi: { basePath: '/openclaw' },
      },
    }, 'agent:main:daily-report')).toBe(
      'http://127.0.0.1:3010/openclaw/chat?token=secret-token&session=agent%3Amain%3Adaily-report',
    )
  })

  it('does not throw when the configured web ui base path misses a leading slash', () => {
    expect(buildGatewayWebUiUrl({
      gateway: {
        port: 3010,
        bind: 'loopback',
        auth: { mode: 'token', token: 'secret-token' },
        controlUi: { basePath: 'openclaw' },
      },
    })).toBe('http://127.0.0.1:3010/openclaw?token=secret-token')
  })

  it('builds authenticated webui and chat urls for ipv6 binds', () => {
    expect(buildGatewayWebUiUrl({
      gateway: {
        port: 3010,
        bind: '::1',
        auth: { mode: 'token', token: 'secret-token' },
        controlUi: { basePath: '/openclaw' },
      },
    })).toBe('http://[::1]:3010/openclaw?token=secret-token')

    expect(buildGatewayChatUrl({
      gateway: {
        port: 3010,
        bind: '::1',
        auth: { mode: 'token', token: 'secret-token' },
        controlUi: { basePath: '/openclaw' },
      },
    }, 'agent:main:daily-report')).toBe(
      'http://[::1]:3010/openclaw/chat?token=secret-token&session=agent%3Amain%3Adaily-report',
    )
  })

  it('uses ipv6 loopback for authenticated urls when the gateway bind is an ipv6 wildcard', () => {
    expect(buildGatewayWebUiUrl({
      gateway: {
        port: 3010,
        bind: '::',
        auth: { mode: 'token', token: 'secret-token' },
      },
    })).toBe('http://[::1]:3010/?token=secret-token')
  })
})

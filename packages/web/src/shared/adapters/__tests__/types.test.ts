import { describe, it, expect } from 'vitest'
import { ok, fail, wrapAsync } from '../types'

describe('AdapterResult helpers', () => {
  describe('ok', () => {
    it('creates success result with data', () => {
      const result = ok({ count: 42 })
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ count: 42 })
      expect(result.error).toBeUndefined()
    })

    it('works with string data', () => {
      const result = ok('hello')
      expect(result.success).toBe(true)
      expect(result.data).toBe('hello')
    })

    it('works with null data', () => {
      const result = ok(null)
      expect(result.success).toBe(true)
      expect(result.data).toBeNull()
    })
  })

  describe('fail', () => {
    it('creates failure result with error message', () => {
      const result = fail('something went wrong')
      expect(result.success).toBe(false)
      expect(result.error).toBe('something went wrong')
      expect(result.data).toBeUndefined()
    })
  })

  describe('wrapAsync', () => {
    it('returns ok on success', async () => {
      const result = await wrapAsync(async () => 'hello')
      expect(result.success).toBe(true)
      expect(result.data).toBe('hello')
    })

    it('returns fail on Error throw', async () => {
      const result = await wrapAsync(async () => {
        throw new Error('boom')
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('boom')
    })

    it('returns fail on string throw', async () => {
      const result = await wrapAsync(async () => {
        throw 'string error'
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('string error')
    })

    it('returns fail on non-string throw', async () => {
      const result = await wrapAsync(async () => {
        throw 42
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('42')
    })
  })
})

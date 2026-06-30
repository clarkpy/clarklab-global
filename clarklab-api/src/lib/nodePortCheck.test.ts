import { describe, expect, it } from 'vitest'
import { validateHostPort } from './nodePortCheck.js'

describe('validateHostPort', () => {
  it('accepts valid host ports', () => {
    expect(validateHostPort(3000)).toBeNull()
    expect(validateHostPort(65535)).toBeNull()
  })

  it('rejects invalid host ports', () => {
    expect(validateHostPort(0)).toMatch(/between 1 and 65535/)
    expect(validateHostPort(70000)).toMatch(/between 1 and 65535/)
    expect(validateHostPort(1.5)).toMatch(/between 1 and 65535/)
  })
})

import { describe, expect, it } from 'vitest'
import { toMajorUnits, toMinorUnits } from './money'

describe('money', () => {
  describe('toMinorUnits', () => {
    it('converts a major-unit amount string to an integer minor-unit value', () => {
      expect(toMinorUnits('45.99')).toBe(4599)
      expect(toMinorUnits('10')).toBe(1000)
      expect(toMinorUnits('0.1')).toBe(10)
    })

    it('rounds to the nearest cent to avoid floating point drift', () => {
      expect(toMinorUnits('19.999')).toBe(2000)
    })
  })

  describe('toMajorUnits', () => {
    it('converts an integer minor-unit value to a display string', () => {
      expect(toMajorUnits(4599)).toBe('45.99')
      expect(toMajorUnits(1000)).toBe('10.00')
    })
  })
})

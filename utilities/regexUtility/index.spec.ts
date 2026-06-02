import { RegexUtility } from '../../../src/utilities/regexUtility'

describe('RegexUtility Unit Test', () => {
  describe('isValidTimeFormat()', () => {
    it('WHEN input valid time THEN should return true', () => {
      const result = RegexUtility.isValidTimeFormat('00:20')
      expect(result).toBe(true)
    })

    it('WHEN input invalid time THEN should return false', () => {
      expect(RegexUtility.isValidTimeFormat('00:70')).toBe(false)
      expect(RegexUtility.isValidTimeFormat('24:00')).toBe(false)
      expect(RegexUtility.isValidTimeFormat('x00:00')).toBe(false)
    })
  })

  describe('isValidDateFormat()', () => {
    it('WHEN input valid time THEN should return true', () => {
      const result = RegexUtility.isValidDateFormat('2025-06-15')
      expect(result).toBe(true)
    })

    it('WHEN input invalid date THEN should return false', () => {
      expect(RegexUtility.isValidDateFormat('2025-x6-15')).toBe(false)
      expect(RegexUtility.isValidDateFormat('2025-06-x5')).toBe(false)
      expect(RegexUtility.isValidDateFormat('202x-06-15')).toBe(false)
    })
  })

  describe('formatNumberWithCommas()', () => {
    it('WHEN input valid number THEN should return comma sparete correctly', () => {
      const result10 = RegexUtility.formatNumberWithCommas(10)
      const result100 = RegexUtility.formatNumberWithCommas(100)
      const result1000 = RegexUtility.formatNumberWithCommas(1000)
      const result10000 = RegexUtility.formatNumberWithCommas(10000)
      const result100000 = RegexUtility.formatNumberWithCommas(100000)
      const result1000000 = RegexUtility.formatNumberWithCommas(1000000)
      const result10000000 = RegexUtility.formatNumberWithCommas(10000000)

      expect(result10).toBe('10')
      expect(result100).toBe('100')
      expect(result1000).toBe('1,000')
      expect(result10000).toBe('10,000')
      expect(result100000).toBe('100,000')
      expect(result1000000).toBe('1,000,000')
      expect(result10000000).toBe('10,000,000')
    })
  })
 
})

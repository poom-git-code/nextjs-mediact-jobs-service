import { vi } from 'vitest'
import { DateUtility } from '../../../src/utilities/dateUtility'

describe('DateUtility Unit Test', () => {
  describe('sleep()', () => {
    it('WHEN input 1 sec THEN should wait for 1 sec', async () => {
      const start = Date.now()
      await DateUtility.sleep(1000)
      const end = Date.now()
      expect(end - start).toBeGreaterThanOrEqual(1000)
    })
  })
  describe('convertIsoDateStringToDate()', () => {
    it('WHEN input Date type THEN should convert correctly', async () => {
      const result = DateUtility.convertIsoDateStringToDate(new Date('2023-10-01T00:00:00.000Z'))
      expect(result).toBeInstanceOf(Date)
      expect(result.toISOString()).toEqual('2023-10-01T00:00:00.000Z')
    })

    it('WHEN input Date String THEN should convert correctly', async () => {
      const result = DateUtility.convertIsoDateStringToDate('2023-10-01T00:00:00.000Z')
      expect(result).toBeInstanceOf(Date)
      expect(result.toISOString()).toEqual('2023-10-01T00:00:00.000Z')
    })

    it('WHEN input invalid Date String THEN should error', async () => {
      try {
        DateUtility.convertIsoDateStringToDate('invalid-date-string')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }
    })
  })

  describe('convertUnixToDate()', () => {
    it('WHEN input Unix timestamp THEN should convert correctly', async () => {
      const result = DateUtility.convertUnixToDate(1696118400)
      expect(result).toBeInstanceOf(Date)
      expect(result.toISOString()).toEqual('2023-10-01T00:00:00.000Z')
    })

    it('WHEN input invalid Unix timestamp THEN should error', async () => {
      try {
        DateUtility.convertUnixToDate(-1)
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }
    })
  })

  describe('formattedYYYYMMDD()', () => {
    it('WHEN input iso string THEN should convert correctly', async () => {
      const result = DateUtility.formattedYYYYMMDD('2023-10-01T00:00:00.000Z')
      expect(result).toEqual('2023-10-01')
    })

    it('WHEN input invalid iso string THEN should error', async () => {
      try {
        DateUtility.formattedYYYYMMDD('not-a-date')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }
    })
  })

  describe('firstValidDefaultDate()', () => {
    it('WHEN input iso string THEN should convert correctly', async () => {
      const result = DateUtility.firstValidDefaultDate()
      expect(result.toISOString()).toEqual('1969-12-31T17:00:00.000Z')
    })
  })

  describe('getDifferenceMinutes()', () => {
    it('WHEN input time diff 1 min THEN should output 1 min', async () => {
      const result = DateUtility.getDifferenceMinutes(
        new Date('2023-10-01T00:00:00.000Z'),
        new Date('2023-10-01T01:00:00.000Z'),
      )
      expect(result).toEqual(60)
    })
  })

  describe('getDifferenceSecond()', () => {
    it('WHEN input time diff 1 sec THEN should output 1 sec', async () => {
      const result = DateUtility.getDifferenceSecond(
        new Date('2023-10-01T00:00:00.000Z'),
        new Date('2023-10-01T00:00:01.000Z'),
      )
      expect(result).toEqual(1)
    })
  })

  describe('getHoursAndMinutes()', () => {
    it('WHEN input iso date string THEN should output correctly', async () => {
      const result = DateUtility.getHoursAndMinutes(DateUtility.convertIsoDateStringToDate('2023-10-01T12:34:00.000Z'))
      expect(result).toEqual('19:34')
    })
  })

  describe('calculateAge()', () => {
    it('WHEN input iso date string THEN should cal age correctly', async () => {
      vi.useFakeTimers().setSystemTime(new Date('2000-11-15T17:00:00.000Z'))
      const result = DateUtility.calculateAge(DateUtility.convertIsoDateStringToDate('1998-11-15T17:00:00.000Z'))
      expect(result).toEqual(2)
      vi.useRealTimers()
    })
    it('WHEN input undefined THEN should return 0', async () => {
      const result = DateUtility.calculateAge(undefined)
      expect(result).toEqual(0)
    })
  })

  describe('getDateStartOfDay()', () => {
    it('WHEN input iso date string THEN should return start of day correctly', async () => {
      const result = DateUtility.getDateStartOfDay('1998-11-15T23:12:00.000Z')
      expect(result.toISOString()).toEqual('1998-11-15T17:00:00.000Z')
    })
  })

  describe('getDateEndOfDay()', () => {
    it('WHEN input iso date string THEN should return end of day correctly', async () => {
      const result = DateUtility.getDateEndOfDay('1998-11-15T23:12:00.000Z')
      expect(result.toISOString()).toEqual('1998-11-16T16:59:59.999Z')
    })
  })


  describe('addMinutes()', () => {
    it('WHEN input iso date string and add 1 min THEN should return correctly', async () => {
      const result = DateUtility.addMinutes('1998-11-15T23:59:00.000Z', 1)
      expect(result.toISOString()).toEqual('1998-11-16T00:00:00.000Z')
    })

    it('WHEN input iso date string and add -1 min THEN should return correctly', async () => {
      const result = DateUtility.addMinutes('1998-11-15T23:59:00.000Z', -1)
      expect(result.toISOString()).toEqual('1998-11-15T23:58:00.000Z')
    })
  })

  describe('getAllDateInMonthAndYear()', () => {
    it('WHEN input month,year = 6,2025 THEN should return 30', async () => {
      const result = DateUtility.getAllDateInMonthAndYear(6, 2025)
      expect(result.length).toEqual(30)
      expect(result[0].toISOString()).toEqual('2025-05-31T17:00:00.000Z')
      expect(result[29].toISOString()).toEqual('2025-06-29T17:00:00.000Z')
    })
  })

  describe('getMonthAndYear()', () => {
    it('WHEN input date in 6/2025 THEN should return month=6 year=2025 correctly', async () => {
      const result = DateUtility.getMonthAndYear('2025-06-14T17:00:00.000Z')

      expect(result.month).toEqual(6)
      expect(result.year).toEqual(2025)
    })
  })

  describe('getEndOfMonth()', () => {
    it('WHEN input date 15/06/2025 THEN should return 30/06/2025 correctly', async () => {
      const result = DateUtility.getEndOfMonth('2025-06-14T17:00:00.000Z')
      expect(result.toISOString()).toEqual('2025-06-30T16:59:59.999Z')
    })
  })

  describe('getStartOfMonth()', () => {
    it('WHEN input date 15/06/2025 THEN should return 01/06/2025 correctly', async () => {
      const result = DateUtility.getStartOfMonth('2025-06-14T17:00:00.000Z')
      expect(result.toISOString()).toEqual('2025-05-31T17:00:00.000Z')
    })
  })

  describe('getDateRangeInMonth()', () => {
    it('WHEN input 6/2025 THEN should return 01/06/2025,30/06/2025 correctly', async () => {
      const result = DateUtility.getDateRangeInMonth(6,2025)
      expect(result[0].toISOString()).toEqual('2025-05-31T17:00:00.000Z')
      expect(result[1].toISOString()).toEqual('2025-06-30T16:59:59.999Z')
    })
  })

  describe('resolveThaiHumanReadableDuration()', () => {
    it('WHEN input 6/2025 THEN should return 01/06/2025,30/06/2025 correctly', async () => {
      const result0m = DateUtility.resolveThaiHumanReadableDuration(0)
      const result30m = DateUtility.resolveThaiHumanReadableDuration(30)
      const result1h = DateUtility.resolveThaiHumanReadableDuration(60)
      const result1h30m = DateUtility.resolveThaiHumanReadableDuration(90)

      expect(result0m).toEqual('0 น.')
      expect(result30m).toEqual('30 น.')
      expect(result1h).toEqual('1 ชม.')
      expect(result1h30m).toEqual('1 ชม. 30 น.')
    })
  })

  describe('resolveThaiHumanReadableDate()', () => {
    it('WHEN input 6/2025 THEN should return 01/06/2025,30/06/2025 correctly', async () => {
      const result = DateUtility.resolveThaiHumanReadableDate(new Date('2025-06-26T17:00:00.000Z'))

      expect(result).toEqual('27 มิ.ย. 68')
    })
  })

  describe('addDays()', () => {
    it('WHEN adding positive days THEN should return correct future date', () => {
      const baseDate = new Date('2025-07-19T00:00:00.000Z')
      const result = DateUtility.addDays(baseDate, 5)
      expect(result.toISOString().slice(0, 10)).toBe('2025-07-24')
    })

    it('WHEN adding zero days THEN should return the same date', () => {
      const baseDate = new Date('2025-07-19T00:00:00.000Z')
      const result = DateUtility.addDays(baseDate, 0)
      expect(result.toISOString().slice(0, 10)).toBe('2025-07-19')
    })

    it('WHEN adding negative days THEN should return correct past date', () => {
      const baseDate = new Date('2025-07-19T00:00:00.000Z')
      const result = DateUtility.addDays(baseDate, -3)
      expect(result.toISOString().slice(0, 10)).toBe('2025-07-16')
    })

    it('WHEN input is a string date THEN should handle correctly', () => {
      const baseDate = '2025-07-19T00:00:00.000Z'
      const result = DateUtility.addDays(baseDate, 2)
      expect(result.toISOString().slice(0, 10)).toBe('2025-07-21')
    })
  })

  
})

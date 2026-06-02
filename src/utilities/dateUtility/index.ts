import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

export class DateUtility {
  static resolveTimeHHmmss(date: Date): string {
    return dayjs.utc(date).format('HH:mm:ss')
  }
  static parseTimeHHmmss(timeString: string): Date {
    const [hours, minutes, second] = timeString.split(':').map(Number)
    return dayjs.utc().hour(hours).minute(minutes).second(second).millisecond(0).toDate()
  }
  static convertUnixToDate(unixTimestamp: number): Date {
    return dayjs.unix(unixTimestamp).toDate()
  }
  static formattedYYYYMMDD(date: Date | string): string {
    return dayjs(date).format('YYYY-MM-DD')
  }
  static convertIsoDateStringToDate(date: Date | string): Date {
    return dayjs(date).toDate()
  }
  static firstValidDefaultDate(): Date {
    return dayjs('1970-01-01T00:00:00.000Z').add(new Date().getTimezoneOffset(), 'minutes').toDate()
  }
  static getDifferenceMinutes(startDate: Date, endDate: Date): number {
    return dayjs(endDate).diff(dayjs(startDate), 'minutes')
  }
  static getDifferenceSecond(startDate: Date, endDate: Date): number {
    return dayjs(endDate).diff(dayjs(startDate), 'seconds')
  }
  static getHoursAndMinutes(date: Date): string {
    return dayjs(date).format('HH:mm')
  }
  static calculateAge(date_of_birth: Date): number {
    return date_of_birth ? dayjs().diff(dayjs(date_of_birth), 'years') : 0
  }
  static getDateStartOfDay(date: Date | string): Date {
    return dayjs(date).startOf('day').toDate()
  }
  static getDateEndOfDay(date: Date | string): Date {
    return dayjs(date).endOf('day').toDate()
  }
  static addMinutes(date: Date | string, min: number): Date {
    return dayjs(date).add(min, 'minutes').toDate()
  }
  static getAllDateInMonthAndYear(month: number, year: number): Date[] {
    const startDate = dayjs(`${year}-${month}-01`).startOf('month')
    const endDate = dayjs(startDate).endOf('month')
    const dates: Date[] = []
    for (let date = startDate; date.isBefore(endDate); date = date.add(1, 'days')) {
      dates.push(date.toDate())
    }
    return dates
  }
  static getMonthAndYear(date: Date | string): { month: number; year: number } {
    const dayjsDate = dayjs(date)
    return {
      month: dayjsDate.month() + 1,
      year: dayjsDate.year(),
    }
  }
  static getEndOfMonth(date: Date | string): Date {
    return dayjs(date).endOf('month').toDate()
  }
  static getStartOfMonth(date: Date | string): Date {
    return dayjs(date).startOf('month').toDate()
  }
  static getDateRangeInMonth(month: number, year: number): [Date, Date] {
    const start = dayjs(`${year}-${month}-01`).startOf('month').toDate()
    const end = dayjs(start).endOf('month').toDate()
    return [start, end]
  }

  static addDays(date: Date | string, days: number): Date {
    return dayjs(date).add(days, 'day').toDate()
  }

  static parseDurationToMilliseconds(duration: string): number {
    const regex = /^(\d+)([smhdwMy])$/
    const match = duration.match(regex)

    if (!match) {
      throw new Error(`Invalid duration format: ${duration}. Expected format: number + unit (s, m, h, d, w, M, y)`)
    }

    const [, amount, unit] = match
    const value = parseInt(amount, 10)

    switch (unit) {
      case 's':
        return value * 1000
      case 'm':
        return value * 60 * 1000
      case 'h':
        return value * 60 * 60 * 1000
      case 'd':
        return value * 24 * 60 * 60 * 1000
      case 'w':
        return value * 7 * 24 * 60 * 60 * 1000
      case 'M':
        return value * 30 * 24 * 60 * 60 * 1000
      case 'y':
        return value * 365 * 24 * 60 * 60 * 1000
      default:
        throw new Error(`Unsupported time unit: ${unit}`)
    }
  }

  static addDuration(date: Date | string, duration: string): Date {
    const milliseconds = this.parseDurationToMilliseconds(duration)
    return dayjs(date).add(milliseconds, 'milliseconds').toDate()
  }
}

export class RegexUtility {
  static isValidTimeFormat(time: string): boolean {
    const regex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/
    return regex.test(time)
  }
  static isValidDateFormat(date: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/ // YYYY-MM-DD format
    return regex.test(date)
  }
  static formatNumberWithCommas(num: number): string {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
}

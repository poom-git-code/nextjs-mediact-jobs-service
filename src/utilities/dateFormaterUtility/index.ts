export class DateFormatterUtility {
  static formatDate(date: Date, lang: Intl.LocalesArgument): string {
    return date.toLocaleDateString(lang, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  static formatShortDate(date: Date, lang: Intl.LocalesArgument): string {
    return date.toLocaleDateString(lang, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  static formatDayName(date: Date, lang: Intl.LocalesArgument): string {
    return date.toLocaleDateString(lang, {
      weekday: 'short',
    })
  }

  static formatMonthYear(month: number, year: number, lang: Intl.LocalesArgument): string {
    const date = new Date(year, month - 1, 1)
    return date.toLocaleDateString(lang, {
      year: 'numeric',
      month: 'long',
    })
  }

  static formatDateTime(date: Date, lang: Intl.LocalesArgument): string {
    return date.toLocaleString(lang, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
}

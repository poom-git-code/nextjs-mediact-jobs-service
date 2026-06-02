export enum Languages {
  TH = 'th',
  EN = 'en',
}

export class Localize {
  constructor(private messages: Record<Languages, string>) {}

  static resolveIntlLocales(ln: Languages): Intl.LocalesArgument {
    if (ln == Languages.TH) return 'th-TH'
    return 'en-EN'
  }

  translate(language: Languages) {
    return this.messages[language]
  }
}

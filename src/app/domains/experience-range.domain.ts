export class ExperienceRange {
  public readonly min: number
  public readonly max: number

  static createFromRange(min: number, max?: number) {
    return new ExperienceRange(min, max)
  }

  constructor(min: number, max?: number) {
    this.min = min
    this.max = max != null ? max : Number.POSITIVE_INFINITY
  }

  toString() {
    if (this.max === Number.POSITIVE_INFINITY) {
      return `${this.min}+`
    }
    return `${this.min}-${this.max}`
  }
}

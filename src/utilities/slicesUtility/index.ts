export class SlicesUtility {
  static KeyBy<T, K extends keyof T>(array: T[], key: K): Record<string, T> {
    const result: Record<string, T> = {} as Record<string, T>
    array.forEach((item) => {
      const keyValue = item[key]
      result[keyValue as unknown as string] = item
    })
    return result
  }
}

import { stringify } from 'node:querystring'

export class QueryStringUtility {
  static concatUrlWithQueryString(url: string, object: Record<string, any>): string {
    if (!object || !Object.values(object).length) return url
    return url + '?' + QueryStringUtility.buildQueryString(object)
  }

  static buildQueryString(object: Record<string, any>): string {
    return stringify(object)
  }
}

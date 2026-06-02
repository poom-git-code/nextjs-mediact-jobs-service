import { QueryStringUtility } from '../../../src/utilities/queryStringUtility'

describe('QueryStringUtility Unit Test', () => {
  describe('buildQueryString()', () => {
    it('WHEN input valid object THEN should build query string correctly', () => {
      const params = { name: 'John', age: '30', city: 'New York' }
      const result = QueryStringUtility.buildQueryString(params)
      expect(result).toBe('name=John&age=30&city=New%20York')
    })

    it('WHEN input empty object THEN should return empty query string', () => {
      const params = {}
      const result = QueryStringUtility.buildQueryString(params)
      expect(result).toBe('')
    })
  })

  describe('concatUrlWithQueryString()', () => {
    it('WHEN input valid URL and query string THEN should concatenate correctly', () => {
      const url = 'https://example.com/api'
      const queryString = { name: 'John', age: '30' }
      const result = QueryStringUtility.concatUrlWithQueryString(url, queryString)
      expect(result).toBe('https://example.com/api?name=John&age=30')
    })

    it('WHEN input valid URL and empty query string THEN should concatenate correctly', () => {
      const url = 'https://example.com/api'
      const queryString = { }
      const result = QueryStringUtility.concatUrlWithQueryString(url, queryString)
      expect(result).toBe('https://example.com/api')
    })
  })

})

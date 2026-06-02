import { EncryptUtility } from '../../../src/utilities/encryptUtility'

describe('EncryptUtility Unit Test', () => {
  describe('generateRandomPassword()', () => {
    it('WHEN called THEN should return a random password and its hash', async () => {
      const { plain, hashed } = EncryptUtility.generateRandomPassword()
      expect(typeof plain).toBe('string')
      expect(typeof hashed).toBe('string')
      expect(plain.length).toBeGreaterThan(0)
      expect(hashed.length).toBeGreaterThan(0)
    })
  })
  describe('hashPlainPassword()', () => {
    it('WHEN called THEN should return a hashed password', async () => {
      const password = 'testPassword'
      const hashed = EncryptUtility.hashPlainPassword(password)
      expect(typeof hashed).toBe('string')
      expect(hashed.length).toBeGreaterThan(0)
      expect(hashed).toEqual('fed3b61b26081849378080b34e693d2e') // Ensure consistent hashing
    })
  })

  describe('generateUUID()', () => {
    it('WHEN called THEN should return a valid UUID', async () => {
      const uuid = EncryptUtility.generateUUID()
      expect(typeof uuid).toBe('string')
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
    })
  })

  describe('generateRandomString()', () => {
    it('WHEN called THEN should return a random string A-Z 0-9', async () => {
      const randomChar = EncryptUtility.generateRandomString(3)
      expect(typeof randomChar).toBe('string')
      expect(randomChar).toMatch(/^[0-9A-Z]{3}$/i)
    })
  })


  describe('randomFromArray()', () => {
    it('WHEN called with an empty array THEN should return null', async () => {
      const result = EncryptUtility.randomFromArray([])
      expect(result).toBeNull()
    })

    it('WHEN called with a non-empty array THEN should return a random element', async () => {
      const array = [1, 2, 3, 4, 5]
      const result = EncryptUtility.randomFromArray(array)
      expect(array).toContain(result)
    })
  })
})

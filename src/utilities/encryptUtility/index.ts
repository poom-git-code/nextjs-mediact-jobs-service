import { randomUUID, createDecipheriv, scryptSync, randomBytes, createCipheriv, createHash } from 'crypto'
import bcrypt from 'bcrypt'

const cryptoConfigs = {
  algorithm: 'aes-256-gcm',
  ivLength: 16,
  tagLength: 16,
  keyLength: 32,
  masterKey: scryptSync(process.env.ENCRYPTION_MASTER_KEY || 'default-master-key-32-chars-long!', 'pipeda-salt', 32),
  searchSalt: process.env.SEARCH_SALT || 'default-search-salt-32-chars-long!',
}

export class EncryptUtility {
  static generateUUID(): string {
    return randomUUID()
  }

  static hashPlainPassword(password: string): string {
    return bcrypt.hashSync(password, 10)
  }

  static compareHashPassword(password: string, passwordHash: string): boolean {
    return bcrypt.compareSync(password, passwordHash)
  }

  static generateRandomPassword(): { plain: string; hashed: string } {
    const password = randomUUID().replace(/-/g, '').slice(0, 8)
    return {
      plain: password,
      hashed: EncryptUtility.hashPlainPassword(password),
    }
  }

  static generateRandomString(length: number): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return result
  }

  static randomFromArray<T>(array: T[]): T | null {
    if (array.length === 0) return null
    const randomIndex = Math.floor(Math.random() * array.length)
    return array[randomIndex]
  }

  static decryptAES(encryptedData: string): string {
    const iv = Buffer.from(encryptedData.slice(0, cryptoConfigs.ivLength * 2), 'hex')
    const tag = Buffer.from(
      encryptedData.slice(cryptoConfigs.ivLength * 2, (cryptoConfigs.ivLength + cryptoConfigs.tagLength) * 2),
      'hex',
    )
    const encrypted = encryptedData.slice((cryptoConfigs.ivLength + cryptoConfigs.tagLength) * 2)

    const decipher = createDecipheriv(cryptoConfigs.algorithm, cryptoConfigs.masterKey, iv) as any
    decipher.setAuthTag(tag)

    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }

  static encryptAES(plaintext: string): string {
    const iv = randomBytes(cryptoConfigs.ivLength)
    const cipher = createCipheriv(cryptoConfigs.algorithm, cryptoConfigs.masterKey, iv)

    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const tag = (cipher as any).getAuthTag()

    return iv.toString('hex') + tag.toString('hex') + encrypted
  }

  static hashSha256(data: string | null): string | null {
    return createHash('sha256')
      .update(data.toLowerCase() + cryptoConfigs.searchSalt)
      .digest('hex')
  }
}

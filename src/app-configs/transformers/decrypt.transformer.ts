import { EncryptUtility } from '../../utilities/encryptUtility'

export const decryptTransformer = (fieldName: string) => {
  return ({ value, obj }) => {
    if (obj[fieldName] === null || obj[fieldName] === undefined || obj[fieldName] === '') {
      return value
    }
    if (value === null || value === undefined || value === '') {
      const decrypted = EncryptUtility.decryptAES(obj[fieldName])
      return decrypted || value
    }
    return value
  }
}

import { EncryptUtility } from '../../utilities/encryptUtility'

export const hashTransformer = (fieldName: string) => {
  return ({ value, obj }) => {
    if (obj[fieldName] === null || obj[fieldName] === undefined || obj[fieldName] === '') {
      return value
    }
    if (value === null || value === undefined || value === '') {
      const encrypted = EncryptUtility.hashSha256(obj[fieldName])
      return encrypted || value
    }
    return value
  }
}

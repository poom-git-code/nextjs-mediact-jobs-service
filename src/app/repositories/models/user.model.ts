import { users } from '@prisma/client'
import { type JsonValue } from '@prisma/client/runtime/client'
import { Expose, Transform } from 'class-transformer'
import { decryptTransformer } from '../../../app-configs/transformers/decrypt.transformer'
import { encryptTransformer } from '../../../app-configs/transformers/encrypt.transformer'
import { hashTransformer } from '../../../app-configs/transformers/hash.transformer'

export class Users implements users {
  @Expose() keycloak_user_id: string
  @Expose() id: number
  @Expose() username: string
  @Expose() password: string
  @Expose() need_password_reset: boolean
  @Expose() @Transform(decryptTransformer('email_encrypted')) email: string
  @Expose() is_verified_email: boolean
  @Expose() verified_email_date: Date
  @Expose() @Transform(decryptTransformer('first_name_encrypted')) first_name: string
  @Expose() @Transform(decryptTransformer('last_name_encrypted')) last_name: string
  @Expose() country_code: string
  @Expose() @Transform(decryptTransformer('phone_number_encrypted')) phone_number: string
  @Expose() is_verified_phone: boolean
  @Expose() verified_phone_date: Date
  @Expose() @Transform(decryptTransformer('date_of_birth_encrypted')) date_of_birth: Date
  @Expose() gender_id: number
  @Expose() profile_picture: string
  @Expose() @Transform(decryptTransformer('id_card_number_encrypted')) id_card_number: string
  @Expose() id_card_url: string
  @Expose() @Transform(decryptTransformer('passport_number_encrypted')) passport_number: string
  @Expose() passport_url: string
  @Expose() last_password_change: Date
  @Expose() reset_password_token: string
  @Expose() reset_password_ref: string
  @Expose() reset_password_expires: Date
  @Expose() verification_token: string
  @Expose() verification_ref: string
  @Expose() verification_expires: Date
  @Expose() status_id: number
  @Expose() status_reason: string
  @Expose() referral_code: string
  @Expose() preferences: JsonValue
  @Expose() last_login: Date
  @Expose() occupation_passed_unit: string
  @Expose() occupation_document_url: string
  @Expose() occupation_number: string
  @Expose() occupation_expired: Date
  @Expose() nickname: string
  @Expose() ID_line: string

  @Expose() @Transform(encryptTransformer('email')) email_encrypted: string
  @Expose() @Transform(encryptTransformer('first_name')) first_name_encrypted: string
  @Expose() @Transform(encryptTransformer('last_name')) last_name_encrypted: string
  @Expose() @Transform(encryptTransformer('phone_number')) phone_number_encrypted: string
  @Expose() @Transform(encryptTransformer('date_of_birth')) date_of_birth_encrypted: string
  @Expose() @Transform(encryptTransformer('id_card_number')) id_card_number_encrypted: string
  @Expose() @Transform(encryptTransformer('passport_number')) passport_number_encrypted: string
  @Expose() @Transform(encryptTransformer('occupation_number')) occupation_number_encrypted: string
  @Expose() @Transform(encryptTransformer('ID_line')) ID_line_encrypted: string
  @Expose() @Transform(encryptTransformer('username')) username_encrypted: string
  @Expose() @Transform(hashTransformer('email')) email_hash: string
  @Expose() @Transform(hashTransformer('phone_number')) phone_number_hash: string
  @Expose() @Transform(hashTransformer('id_card_number')) id_card_number_hash: string
  @Expose() @Transform(hashTransformer('username')) username_hash: string
  @Expose() data_retention_date: Date
  @Expose() consent_given_date: Date
  @Expose() consent_withdrawn_date: Date
  @Expose() encryption_migrated_at: Date
  @Expose() privacy_policy_version: string

  @Expose() gender: string
  @Expose() role_id: number
  @Expose() status: string
  @Expose() signup_date: Date

  @Expose() two_factor_enabled: boolean = false
  @Expose() failed_login_attempts: number = 0
  @Expose() is_encrypted: boolean = true
  @Expose() encryption_version: string = 'v1.0'

  @Expose() created_by: number
  @Expose() updated_by: number
  @Expose() created_at: Date
  @Expose() updated_at: Date
}

import { user_job_match_settings } from '@prisma/client'
import { Expose } from 'class-transformer'

export class UserMatchSettings implements Pick<user_job_match_settings, 'user_id' | 'auto_accept' | 'is_monday' | 'is_tuesday' | 'is_wednesday' | 'is_thursday' | 'is_friday' | 'is_saturday' | 'is_sunday'> {
  @Expose() user_id: number
  @Expose() auto_accept: boolean
  @Expose() is_monday: boolean
  @Expose() is_tuesday: boolean
  @Expose() is_wednesday: boolean
  @Expose() is_thursday: boolean
  @Expose() is_friday: boolean
  @Expose() is_saturday: boolean
  @Expose() is_sunday: boolean
}

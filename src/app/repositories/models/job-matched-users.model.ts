import { job_matched_users } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/client'
import { Expose } from 'class-transformer'

export class JobMatchedUsers implements job_matched_users {
  @Expose() fit_score: Decimal
  @Expose() id: number
  @Expose() job_id: number
  @Expose() user_id: number
  @Expose() matched_at: Date
  @Expose() created_at: Date
}

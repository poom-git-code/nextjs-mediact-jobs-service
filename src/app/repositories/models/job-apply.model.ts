import { job_applies } from '@prisma/client'
import { Expose } from 'class-transformer'

export class JobApplies implements job_applies {
  @Expose() withdraw_date: Date
  @Expose() id: number
  @Expose() job_id: number
  @Expose() user_id: number
  @Expose() status_id: number
  @Expose() apply_date: Date | null
  @Expose() remark: string | null
  @Expose() approve_user_id: number | null
  @Expose() approve_date: Date | null
  @Expose() created_by: number | null
  @Expose() updated_by: number | null
  @Expose() created_at: Date | null
  @Expose() updated_at: Date | null
}

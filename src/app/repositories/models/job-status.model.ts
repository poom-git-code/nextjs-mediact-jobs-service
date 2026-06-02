import { job_statuses } from '@prisma/client'
import { Expose } from 'class-transformer'

export class JobStatuses implements job_statuses {
  @Expose() id: number
  @Expose() name: string
  @Expose() description: string | null
  @Expose() is_active: boolean | null
  @Expose() created_by: number | null
  @Expose() updated_by: number | null
  @Expose() created_at: Date | null
  @Expose() updated_at: Date | null
}

export class JobStatusAll {
  @Expose()
  id: number

  @Expose()
  name: string
}

import { job_types } from '@prisma/client'
import { Expose } from 'class-transformer'

export class JobTypes implements job_types {
  @Expose() id: number
  @Expose() job_type_code: string
  @Expose() job_type_name_th: string
  @Expose() job_type_name_en: string
  @Expose() description: string | null
  @Expose() is_active: boolean
  @Expose() created_at: Date
  @Expose() updated_at: Date
}

import { JobAutoCloseType, JobPublishGroup, jobs, wage_type } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/client'
import { Expose, Transform } from 'class-transformer'

export class Jobs implements Omit<jobs, 'job_fee'> {
  @Expose() job_code: string
  @Expose() approved_by: number
  @Expose() approved_at: Date
  @Expose() id: number
  @Expose() source_schedule_id: number | null
  @Expose() job_title: string
  @Expose() job_description: string | null
  @Expose() work_date: Date
  @Expose() start_time: Date
  @Expose() end_time: Date
  @Expose() required_role_id: number | null
  @Expose() required_department_id: number | null
  @Expose() @Transform(({ value }) => JobPublishGroup[value]) publish_group: JobPublishGroup
  @Expose() is_public: boolean | null
  @Expose() status_id: number
  @Expose() rejection_reason: string | null
  @Expose() created_by: number | null
  @Expose() updated_by: number | null
  @Expose() created_at: Date | null
  @Expose() updated_at: Date | null
  @Expose() max_applicants: number | null
  @Expose() application_deadline: Date | null
  @Expose() job_fee: number | null
  @Expose() job_fee_vat_included: boolean | null
  @Expose() auto_close_type: JobAutoCloseType
  @Expose() experience_range: string | null
  @Expose() shift_type_id: number | null

  // New Fields
  @Expose() min_wage: Decimal | null
  @Expose() max_wage: Decimal | null
  @Expose() currency: string | null
  @Expose() wage_type: wage_type | null
  @Expose() hide_compensation: boolean | null
  @Expose() switch_to_next_audience: boolean | null
  @Expose() publish_group_interval_min: number | null
  @Expose() is_schedule: boolean | null
  @Expose() schedule_start_at: Date | null
  @Expose() facility_package_id: number | null
  @Expose() min_experience_year: number | null
  @Expose() max_experience_year: number | null
}

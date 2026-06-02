import { Expose } from 'class-transformer'

export class FindJobsToScheduleStart {
  @Expose() id: number
}

export class FindJobsToAutoSwitchAudience {
  @Expose() id: number
  @Expose() job_code: string
  @Expose() publish_group: string
  @Expose() job_title: string
  @Expose() required_department_id: number | null
  @Expose() created_by: number | null
  @Expose() max_applicants: number | null
  @Expose() work_date: Date
  @Expose() start_time: Date
  @Expose() end_time: Date
  @Expose() created_at: Date | null
}

export class FindJobsToSwitchToFormerWorker {
  @Expose() id: number
  @Expose() max_applicants: number | null
}

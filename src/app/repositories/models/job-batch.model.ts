import { JobPublishGroup, job_batch_status, job_batches } from '@prisma/client'
import { Expose, Transform } from 'class-transformer'

export class JobBatches implements job_batches {
  @Expose() id: bigint
  @Expose() job_id: bigint
  @Expose() batch_no: number
  @Expose() @Transform(({ value }) => JobPublishGroup[value]) publish_group: JobPublishGroup
  @Expose() criteria_snapshot: any
  @Expose() start_id: bigint
  @Expose() end_id: bigint
  @Expose() status: job_batch_status
  @Expose() attempt_count: number
  @Expose() last_error: string | null
  @Expose() created_at: Date
  @Expose() updated_at: Date
  @Expose() correlation_id: string | null
}

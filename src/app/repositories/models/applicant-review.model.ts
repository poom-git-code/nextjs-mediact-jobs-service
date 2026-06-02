import { applicant_reviews } from '@prisma/client'
import { Expose } from 'class-transformer'

export class ApplicantReviews implements applicant_reviews {
  @Expose() id: number
  @Expose() job_apply_id: number
  @Expose() reviewer_id: number | null
  @Expose() rating: number
  @Expose() comment: string | null
  @Expose() is_active: boolean
  @Expose() created_at: Date
}

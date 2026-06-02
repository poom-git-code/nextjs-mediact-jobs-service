import { Expose } from 'class-transformer'
import { JobApplies } from './job-apply.model'

export class JobApplyWithReview extends JobApplies {
  @Expose() rating: number | null
  @Expose() isReviewed: boolean
  @Expose() fitScore: number | null
}

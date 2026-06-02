import { Injectable } from '@nestjs/common'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { ApplicantReviews } from './models/applicant-review.model'
import { plainToInstance } from 'class-transformer'
import { getUserId } from '../../app-configs/contexts/consumer.context'

@Injectable()
export class ApplicantReviewRepository {
  constructor(private prismaService: PrismaService) {}

  async findActiveByJobApplyId(
    jobApplyId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<ApplicantReviews[]> {
    const reviews = await transaction.applicant_reviews.findMany({
      where: { job_apply_id: jobApplyId, is_active: true },
    })
    if (!reviews.length) return []
    return plainToInstance(ApplicantReviews, reviews, { excludeExtraneousValues: true })
  }

  async findByUserId(userId: number, transaction: Transaction = this.prismaService): Promise<any[]> {
    const reviews = await transaction.$queryRaw<any[]>`
      SELECT 
        ar.id,
        ar.rating,
        ar.comment,
        ar.created_at,
        f.name as reviewer_name
      FROM applicant_reviews ar
      LEFT JOIN job_applies ja ON ar.job_apply_id = ja.id
      LEFT JOIN users u ON ar.reviewer_id = u.id
      LEFT JOIN user_employments ue ON u.id = ue.user_id AND ue.is_active = TRUE
      LEFT JOIN departments d ON ue.department_id = d.id
      LEFT JOIN facilities f ON d.facility_id = f.id
      WHERE ja.user_id = ${userId}
        AND ja.id IS NOT NULL
        AND ar.is_active = true
      ORDER BY ar.created_at DESC
    `
    return reviews
  }

  async create(
    review: Omit<ApplicantReviews, 'id' | 'created_at' | 'reviewer_id'>,
    transaction: Transaction = this.prismaService,
  ): Promise<ApplicantReviews> {
    const actionBy = +getUserId()
    const createdReview = await transaction.applicant_reviews.create({
      data: {
        ...review,
        reviewer_id: actionBy,
        created_at: new Date(),
      },
    })
    return plainToInstance(ApplicantReviews, createdReview, { excludeExtraneousValues: true })
  }
}

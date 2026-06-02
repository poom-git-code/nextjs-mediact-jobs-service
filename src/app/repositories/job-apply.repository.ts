import { Injectable } from '@nestjs/common'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { JobApplies } from './models/job-apply.model'
import { JobApplyWithReview } from './models/job-apply.read.model'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { getUserId } from '../../app-configs/contexts/consumer.context'
import { ApplicantStatus } from '../domains/applicant-status.domain'

@Injectable()
export class JobApplyRepository {
  constructor(private prismaService: PrismaService) {}

  async findOneById(id: number, transaction: Transaction = this.prismaService): Promise<JobApplies | null> {
    const jobApply = await transaction.job_applies.findUnique({
      where: { id },
    })
    if (!jobApply) return null
    return plainToInstance(JobApplies, jobApply, { excludeExtraneousValues: true })
  }

  async findOneByUserIdAndJobId(
    userId: number,
    jobId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<JobApplies | null> {
    const jobApply = await transaction.job_applies.findFirst({
      where: { user_id: userId, job_id: jobId },
    })
    if (!jobApply) return null
    return plainToInstance(JobApplies, jobApply, { excludeExtraneousValues: true })
  }

  async findByJobIdAndUserId(
    jobId: number,
    userId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<JobApplies | null> {
    const jobApply = await transaction.job_applies.findFirst({
      where: { job_id: jobId, user_id: userId },
    })
    if (!jobApply) return null
    return plainToInstance(JobApplies, jobApply, { excludeExtraneousValues: true })
  }

  async findByJobId(jobId: number, transaction: Transaction = this.prismaService): Promise<JobApplies[]> {
    const jobApplies = await transaction.job_applies.findMany({
      where: { job_id: jobId },
    })
    if (!jobApplies.length) return []
    return plainToInstance(JobApplies, jobApplies, { excludeExtraneousValues: true })
  }

  async findByUserId(userId: number, transaction: Transaction = this.prismaService): Promise<JobApplies[]> {
    const jobApplies = await transaction.job_applies.findMany({
      where: { user_id: userId },
    })
    if (!jobApplies.length) return []
    return plainToInstance(JobApplies, jobApplies, { excludeExtraneousValues: true })
  }

  async create(
    jobApply: Omit<JobApplies, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>,
    transaction: Transaction = this.prismaService,
  ): Promise<JobApplies> {
    const actionBy = +getUserId()
    const data = plainToInstance(JobApplies, instanceToPlain(jobApply), { excludeExtraneousValues: true })
    const createdJobApply = await transaction.job_applies.create({
      data: {
        ...data,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: actionBy,
        updated_by: actionBy,
      },
    })
    return plainToInstance(JobApplies, createdJobApply, { excludeExtraneousValues: true })
  }

  async save(jobApply: JobApplies, transaction: Transaction = this.prismaService): Promise<JobApplies> {
    const actionBy = +getUserId()
    const data = plainToInstance(JobApplies, instanceToPlain(jobApply), { excludeExtraneousValues: true })
    const updatedJobApply = await transaction.job_applies.update({
      where: { id: jobApply.id },
      data: {
        ...data,
        updated_at: new Date(),
        updated_by: actionBy,
      },
    })
    return plainToInstance(JobApplies, updatedJobApply, { excludeExtraneousValues: true })
  }

  async delete(id: number, transaction: Transaction = this.prismaService): Promise<void> {
    await transaction.job_applies.delete({
      where: { id },
    })
  }

  async countByJobIdAndStatus(
    jobId: number,
    statusId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<number> {
    return transaction.job_applies.count({
      where: { job_id: jobId, status_id: statusId },
    })
  }

  async countByJobId(jobId: number, transaction: Transaction = this.prismaService): Promise<number> {
    return transaction.job_applies.count({
      where: { job_id: jobId },
    })
  }

  async countPositiveByJobId(jobId: number, transaction: Transaction = this.prismaService): Promise<number> {
    return transaction.job_applies.count({
      where: { job_id: jobId, status_id: { not: ApplicantStatus.rejected } },
    })
  }
}

@Injectable()
export class JobApplyReadRepository {
  constructor(private prismaService: PrismaService) {}

  async findPendingApplicants(jobId: number, transaction: Transaction = this.prismaService): Promise<number[]> {
    const results = await transaction.job_applies.findMany({
      where: {
        status_id: ApplicantStatus.pending,
        job_id: jobId,
      },
      select: {
        user_id: true,
      },
    })
    return results.map((e) => e.user_id)
  }

  async findByJobIdWithReview(jobId: number): Promise<JobApplyWithReview[]> {
    const results = await this.prismaService.$queryRaw<any[]>`
      WITH applicants AS (
        SELECT DISTINCT user_id
        FROM job_applies
        WHERE job_id = ${jobId}
      )
      SELECT ja.id, ja.job_id, ja.user_id, ja.status_id, ja.apply_date, ja.remark, ja.approve_user_id, ja.approve_date, ja.created_by, ja.updated_by, ja.created_at, ja.updated_at, b.rating, ar.id as review_id, jmu.fit_score
      FROM job_applies as ja
      LEFT JOIN (
        SELECT
          a.user_id,
          IFNULL(AVG(ar.rating), 0) AS rating
        FROM applicants a
        LEFT JOIN job_applies ja ON ja.user_id = a.user_id
        LEFT JOIN applicant_reviews ar ON ar.job_apply_id = ja.id
        GROUP BY a.user_id
      ) as b ON ja.user_id = b.user_id
      LEFT JOIN applicant_reviews ar ON ar.job_apply_id = ja.id
      LEFT JOIN job_matched_users jmu ON jmu.job_id = ja.job_id AND jmu.user_id = ja.user_id
      WHERE ja.job_id = ${jobId}
      ORDER BY jmu.fit_score DESC, ja.id ASC
    `

    if (!results.length) return []
    return plainToInstance(
      JobApplyWithReview,
      results.map((e) => ({
        ...e,
        rating: Number(e.rating),
        isReviewed: e.review_id !== null,
        fitScore: e.fit_score != null ? Number(e.fit_score) : null,
      })),
      { excludeExtraneousValues: true },
    )
  }
}

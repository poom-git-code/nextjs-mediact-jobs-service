import { Injectable } from '@nestjs/common'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { JobMatchedUsers } from './models/job-matched-users.model'
import { plainToInstance } from 'class-transformer'

@Injectable()
export class JobMatchedUsersRepository {
  constructor(private prismaService: PrismaService) {}

  async createMany(jobId: number, userIds: number[], transaction: Transaction = this.prismaService): Promise<void> {
    if (userIds.length === 0) return

    const now = new Date()
    await transaction.job_matched_users.createMany({
      data: userIds.map((userId) => ({
        job_id: jobId,
        user_id: userId,
        matched_at: now,
        created_at: now,
      })),
    })
  }

  async findByJobId(jobId: number, transaction: Transaction = this.prismaService): Promise<JobMatchedUsers[]> {
    const results = await transaction.job_matched_users.findMany({
      where: { job_id: jobId },
    })
    return results.map((result) => plainToInstance(JobMatchedUsers, result, { excludeExtraneousValues: true }))
  }

  async findByUserId(userId: number, transaction: Transaction = this.prismaService): Promise<JobMatchedUsers[]> {
    const results = await transaction.job_matched_users.findMany({
      where: { user_id: userId },
    })
    return results.map((result) => plainToInstance(JobMatchedUsers, result, { excludeExtraneousValues: true }))
  }

  async countByJobId(jobId: number, transaction: Transaction = this.prismaService): Promise<number> {
    return transaction.job_matched_users.count({
      where: { job_id: jobId },
    })
  }

  async deleteByJobId(jobId: number, transaction: Transaction = this.prismaService): Promise<void> {
    await transaction.job_matched_users.deleteMany({
      where: { job_id: jobId },
    })
  }

  async createManyForUser(userId: number, jobIds: number[], transaction: Transaction = this.prismaService): Promise<void> {
    if (jobIds.length === 0) return

    const now = new Date()
    await transaction.job_matched_users.createMany({
      data: jobIds.map((jobId) => ({
        job_id: jobId,
        user_id: userId,
        matched_at: now,
        created_at: now,
      })),
      skipDuplicates: true,
    })
  }

  async deleteByUserIdNotInJobIds(
    userId: number,
    jobIds: number[],
    transaction: Transaction = this.prismaService,
  ): Promise<void> {
    if (jobIds.length === 0) {
      await transaction.job_matched_users.deleteMany({
        where: { user_id: userId },
      })
    } else {
      await transaction.job_matched_users.deleteMany({
        where: {
          user_id: userId,
          job_id: { notIn: jobIds },
        },
      })
    }
  }
}

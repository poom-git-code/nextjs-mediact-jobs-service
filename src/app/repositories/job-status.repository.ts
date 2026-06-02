import { Injectable } from '@nestjs/common'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { JobStatusAll, JobStatuses } from './models/job-status.model'
import { plainToInstance } from 'class-transformer'

@Injectable()
export class JobStatusRepository {
  constructor(private prismaService: PrismaService) {}

  async findOneById(id: number, transaction: Transaction = this.prismaService): Promise<JobStatuses | null> {
    const status = await transaction.job_statuses.findUnique({
      where: { id },
    })
    if (!status) return null
    return plainToInstance(JobStatuses, status, { excludeExtraneousValues: true })
  }

  async findAll(transaction: Transaction = this.prismaService): Promise<JobStatusAll[]> {
    const items = await transaction.job_statuses.findMany({
      orderBy: { id: 'asc' },
    })

    if (!items) return []
    return plainToInstance(JobStatusAll, items, { excludeExtraneousValues: true })
  }
}

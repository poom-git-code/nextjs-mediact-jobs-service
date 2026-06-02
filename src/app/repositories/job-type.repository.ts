import { Injectable } from '@nestjs/common'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { JobTypes } from './models/job-type.model'
import { plainToInstance } from 'class-transformer'

@Injectable()
export class JobTypeRepository {
  constructor(private prismaService: PrismaService) {}

  async findOneById(id: number, transaction: Transaction = this.prismaService): Promise<JobTypes | null> {
    const jobType = await transaction.job_types.findUnique({
      where: { id },
    })
    if (!jobType) return null
    return plainToInstance(JobTypes, jobType, { excludeExtraneousValues: true })
  }
}

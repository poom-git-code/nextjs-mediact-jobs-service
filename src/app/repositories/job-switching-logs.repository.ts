import { Injectable } from '@nestjs/common'
import { PrismaService, Transaction } from '../../modules/prisma.module'

@Injectable()
export class JobSwitchingLogsRepository {
  constructor(private prismaService: PrismaService) {}

  async createLog(
    jobId: number,
    fromPublishGroup: string,
    toPublishGroup: string,
    switchedAt: Date,
    transaction: Transaction = this.prismaService,
  ): Promise<void> {
    await transaction.job_switching_logs.create({
      data: {
        job_id: jobId,
        from_publish_group: fromPublishGroup,
        to_publish_group: toPublishGroup,
        switched_at: switchedAt,
      },
    })
  }
}

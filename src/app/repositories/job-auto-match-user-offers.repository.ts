import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService, Transaction } from '../../modules/prisma.module'

@Injectable()
export class JobAutoMatchUserOffersRepository {
  constructor(private prismaService: PrismaService) {}

  async upsertMany(
    jobId: number,
    userIds: number[],
    expireAt: Date,
    transaction: Transaction = this.prismaService,
  ): Promise<void> {
    if (userIds.length === 0) return

    const rows = userIds.map((uid) => Prisma.sql`(${uid}, ${jobId}, ${'pending'}, ${expireAt}, NOW(), NOW())`)

    await transaction.$executeRaw`
      INSERT INTO job_auto_match_user_offers (user_id, job_id, status, expire_at, created_at, updated_at)
      VALUES ${Prisma.join(rows)}
      ON DUPLICATE KEY UPDATE
        status = 'pending',
        expire_at = VALUES(expire_at),
        updated_at = NOW()
    `
  }
}

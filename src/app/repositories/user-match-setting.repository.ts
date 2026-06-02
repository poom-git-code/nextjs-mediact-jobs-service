import { Injectable } from '@nestjs/common'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { UserMatchSettings } from './models/user-match-setting.model'
import { plainToInstance } from 'class-transformer'

@Injectable()
export class UserMatchSettingReadRepository {
  constructor(private prismaService: PrismaService) {}

  async findManyByUserIds(userIds: number[], transaction: Transaction = this.prismaService): Promise<UserMatchSettings[]> {
    if (userIds.length === 0) return []

    const results = await transaction.user_job_match_settings.findMany({
      where: { user_id: { in: userIds } },
      select: {
        user_id: true,
        auto_accept: true,
        is_monday: true,
        is_tuesday: true,
        is_wednesday: true,
        is_thursday: true,
        is_friday: true,
        is_saturday: true,
        is_sunday: true,
      },
    })

    return results.map((result) => plainToInstance(UserMatchSettings, result, { excludeExtraneousValues: true }))
  }
}

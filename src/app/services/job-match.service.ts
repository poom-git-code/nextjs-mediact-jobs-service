import { Injectable } from '@nestjs/common'
import { SqsService } from '@ssut/nestjs-sqs'
import { MessageAttributeValue } from '@aws-sdk/client-sqs'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { NotificationService } from '../external-services/notification.service'
import { Jobs } from '../repositories/models/job.model'
import { JobBatches } from '../repositories/models/job-batch.model'
import { UserMatchSettings } from '../repositories/models/user-match-setting.model'
import { UserReadRepository } from '../repositories/user.repository'
import { JobMatchedUsersRepository } from '../repositories/job-matched-users.repository'
import { UserMatchSettingReadRepository } from '../repositories/user-match-setting.repository'
import { JobAutoMatchUserOffersRepository } from '../repositories/job-auto-match-user-offers.repository'
import { JobMatch } from '../controllers/dto/consumer.dto'
import { MatchCriteria } from '../domains/match-criteria.domain'
import { JobPublishGroup } from '@prisma/client'
import { getCorrelationId, getUserId } from '../../app-configs/contexts/consumer.context'
import { getLanguage } from '../../app-configs/middleware/languages.middleware'
import { Constants } from '../../app-configs/configs/constant.config'

@Injectable()
export class JobMatchService {
  constructor(
    private prismaService: PrismaService,
    private notificationService: NotificationService,
    private userReadRepository: UserReadRepository,
    private jobMatchedUsersRepository: JobMatchedUsersRepository,
    private userMatchSettingReadRepository: UserMatchSettingReadRepository,
    private jobAutoMatchUserOffersRepository: JobAutoMatchUserOffersRepository,
    private sqsService: SqsService,
  ) {}

  async processBatch(input: JobMatch, job: Jobs, batch: JobBatches, transaction: Transaction = this.prismaService) {
    // 1. Re-query matched users for this batch range based on batch's publish_group snapshot
    //    (use batch.publish_group instead of job.publish_group to avoid race condition
    //     if job's publish_group was switched after batch creation)
    const criteria = MatchCriteria.createFromRawJson(batch.criteria_snapshot)
    let users: number[]
    if (batch.publish_group === JobPublishGroup.hospital) {
      users = await this.userReadRepository.findLoopHospitalUsers(
        Number(job.required_department_id),
        Number(batch.start_id),
        Number(batch.end_id),
        criteria.roleId,
        criteria.experience,
        criteria.certificationIds,
        transaction,
      )
    } else if (batch.publish_group === JobPublishGroup.part_time) {
      users = await this.userReadRepository.findLoopPartTimeUsers(
        Number(job.required_department_id),
        Number(batch.start_id),
        Number(batch.end_id),
        criteria.roleId,
        criteria.experience,
        criteria.certificationIds,
        transaction,
      )
    } else if (batch.publish_group === JobPublishGroup.former_worker) {
      users = await this.userReadRepository.findLoopFormerWorkerUsers(
        Number(job.required_department_id),
        Number(batch.start_id),
        Number(batch.end_id),
        criteria.roleId,
        criteria.experience,
        criteria.certificationIds,
        transaction,
      )
    } else {
      users = await this.userReadRepository.findMatchedCriteriaUsers(
        job.required_department_id,
        criteria,
        Number(batch.start_id),
        Number(batch.end_id),
        transaction,
      )
    }

    // 2. Batch-fetch user match settings (1 query, no N+1)
    const settings = await this.userMatchSettingReadRepository.findManyByUserIds(users, transaction)
    const settingsMap = new Map(settings.map((s) => [s.user_id, s]))

    // 3. Split into groups
    const normalGroup = users.filter((u) => !this.isAutoMatchEligible(job.work_date, u, settingsMap))
    const autoMatchedGroup = users.filter((u) => this.isAutoMatchEligible(job.work_date, u, settingsMap))

    // 4. INSERT matched users — fit_score=NULL, calculated async via SQS (TR-008)
    if (users.length > 0) {
      await this.jobMatchedUsersRepository.createMany(job.id, users, transaction)
    }

    // 5b. UPSERT job_auto_match_user_offers (autoMatchedGroup only)
    if (autoMatchedGroup.length > 0) {
      const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await this.jobAutoMatchUserOffersRepository.upsertMany(job.id, autoMatchedGroup, expireAt, transaction)
    }

    // 6. Send notifications per group
    if (normalGroup.length > 0) {
      await this.notificationService.sendNotificationBatch({
        notificationId: input.normalNotificationId,
        batchNumber: input.batchNumber,
        notifyUserIds: normalGroup,
      })
    }
    if (autoMatchedGroup.length > 0) {
      await this.notificationService.sendNotificationBatch({
        notificationId: input.autoMatchedNotificationId,
        batchNumber: input.batchNumber,
        notifyUserIds: autoMatchedGroup,
      })
    }

    // 7. Enqueue FitScore calculation per (job, user) — async via SQS (TR-008)
    await Promise.all(users.map((userId) => this.publishFitScoreRecalc(job.id, userId, input.correlationId)))
  }

  private async publishFitScoreRecalc(jobId: number, userId: number, correlationId: string): Promise<void> {
    const uniqueKey = `fit-score-recalc-${jobId}-${userId}-${correlationId}`
    const messageAttributes: Record<string, MessageAttributeValue> = {
      correlationId: { DataType: 'String', StringValue: getCorrelationId() },
      language: { DataType: 'String', StringValue: getLanguage() },
      userId: { DataType: 'String', StringValue: getUserId() },
    }
    await this.sqsService.send(Constants.SQS_QUEUE_FIT_SCORE_RECALC_NAME, {
      body: JSON.stringify({ jobId, userId, correlationId }),
      groupId: `fit-score-${jobId}-${userId}`,
      deduplicationId: uniqueKey,
      id: uniqueKey,
      messageAttributes,
    })
  }

  isAutoMatchEligible(workDate: Date, userId: number, settingsMap: Map<number, UserMatchSettings>): boolean {
    const setting = settingsMap.get(userId)
    if (!setting || !setting.auto_accept) return false

    // Map JS Date.getDay() index (0=Sun, 1=Mon, ..., 6=Sat) to the corresponding boolean column
    const dayFlags = [
      setting.is_sunday,
      setting.is_monday,
      setting.is_tuesday,
      setting.is_wednesday,
      setting.is_thursday,
      setting.is_friday,
      setting.is_saturday,
    ]

    return dayFlags[new Date(workDate).getDay()] === true
  }
}

import { Injectable } from '@nestjs/common'
import { SqsService } from '@ssut/nestjs-sqs'
import { MessageAttributeValue } from '@aws-sdk/client-sqs'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { FitScoreRecalc, JobMatch, JobRecipientGenerator, UserRematch } from '../controllers/dto/consumer.dto'
import { JobRepository } from '../repositories/job.repository'
import { CustomLogger } from 'nestjs-custom-module'
import { getCorrelationId } from '../../app-configs/contexts/consumer.context'
import { Event } from '../domains/event.domain'
import { Jobs } from '../repositories/models/job.model'
import { job_batch_status as JobBatchStatus, JobPublishGroup } from '@prisma/client'
import { RecipientGeneratorService } from '../services/recipient-generator.service'
import { JobBatchRepository } from '../repositories/job-batch.repository'
import { JobMatchService } from '../services/job-match.service'
import { NotificationService } from '../external-services/notification.service'
import { Constants } from '../../app-configs/configs/constant.config'
import { UserRematchService } from '../services/user-rematch.service'
import { FitScoreService } from '../services/fit-score.service'
import { JobStatus } from '../domains/job-status.domain'
import { getLanguage } from '../../app-configs/middleware/languages.middleware'
import { getUserId } from '../../app-configs/contexts/consumer.context'

@Injectable()
export class ConsumerUsecase {
  constructor(
    private customLogger: CustomLogger,
    private jobRepository: JobRepository,
    private recipientGeneratorService: RecipientGeneratorService,
    private jobBatchRepository: JobBatchRepository,
    private jobMatchService: JobMatchService,
    private notificationService: NotificationService,
    private prismaService: PrismaService,
    private userRematchService: UserRematchService,
    private fitScoreService: FitScoreService,
    private sqsService: SqsService,
  ) {}

  private async resolveRecipientOfCreatedOrUpdatedEvent(job: Jobs, transaction: Transaction = this.prismaService) {
    if (job.publish_group === JobPublishGroup.hospital) {
      return this.recipientGeneratorService.resolveRecipientInCaseDepartment(job, transaction)
    } else if (job.publish_group === JobPublishGroup.part_time) {
      return this.recipientGeneratorService.resolveRecipientInCaseFormerStaff(job, transaction)
    } else if (job.publish_group === JobPublishGroup.former_worker) {
      return this.recipientGeneratorService.resolveRecipientInCaseFormerWorker(job, transaction)
    } else if (job.publish_group === JobPublishGroup.system) {
      return this.recipientGeneratorService.resolveRecipientInCaseAllUser(job, transaction)
    }
  }

  async handleRecipientGenerator(retryCount: number, input: JobRecipientGenerator) {
    this.customLogger.log(`recipient generator received jobId=${input.jobId} eventName=${input.eventName} retryCount=${retryCount}`)

    if (retryCount > Constants.MAX_RECIPIENT_GENERATOR_RETRIES) {
      this.customLogger.error(`Retry count ${retryCount} exceeded`)
      // throw new Error(logInfo.message)
      return
    }
    const job = await this.jobRepository.findOneById(input.jobId)
    if (!job) {
      const logInfo = this.customLogger.error(`Job ${input.jobId} not found`)
      throw new Error(logInfo.message)
    }

    this.customLogger.log(`recipient generator routing jobId=${job.id} publishGroup=${job.publish_group} statusId=${job.status_id}`)

    await this.prismaService.$transaction(async (t) => {
      if ([Event.JOB_CREATED_EVENT, Event.JOB_UPDATED_EVENT].includes(input.eventName)) {
        return this.resolveRecipientOfCreatedOrUpdatedEvent(job, t)
      } else if (input.eventName === Event.JOB_CLOSED_EVENT) {
        return this.recipientGeneratorService.resolveRecipientOfClosedEvent(job, t)
      }
    })
  }

  async handleJobMatch(retryCount: number, input: JobMatch) {
    if (retryCount > Constants.MAX_JOB_MATCH_RETRIES) {
      this.customLogger.error(`Retry count ${retryCount} exceeded for batch ${input.batchId}`)
      await this.jobBatchRepository.updateStatus(BigInt(input.batchId), JobBatchStatus.failed)
      await this.jobBatchRepository.incrementAttemptCount(BigInt(input.batchId), 'Max retries exceeded')
      return
    }

    try {
      await this.prismaService.$transaction(async (t) => {
        const job = await this.jobRepository.findOneById(input.jobId)
        if (!job) {
          const logInfo = this.customLogger.error(`Job ${input.jobId} not found`)
          throw new Error(logInfo.message)
        }
        const batch = await this.jobBatchRepository.findOneById(BigInt(input.batchId))
        if (!batch) {
          const logInfo = this.customLogger.error(`Batch ${input.batchId} not found`)
          throw new Error(logInfo.message)
        }

        await this.jobBatchRepository.updateStatus(BigInt(input.batchId), JobBatchStatus.processing, t)

        await this.jobMatchService.processBatch(input, job, batch, t)

        await this.jobBatchRepository.updateStatus(BigInt(input.batchId), JobBatchStatus.completed, t)
      })
    } catch (error) {
      const lastError = error instanceof Error ? error.message : 'Unknown error'
      this.customLogger.error(`Job matching failed for batch ${input.batchId}: ${lastError}`)
      await this.jobBatchRepository.updateStatus(BigInt(input.batchId), JobBatchStatus.failed)
      await this.jobBatchRepository.incrementAttemptCount(BigInt(input.batchId), lastError)
      throw error
    }
  }

  async handleUserRematch(retryCount: number, input: UserRematch): Promise<void> {
    if (retryCount > Constants.MAX_USER_REMATCH_RETRIES) {
      this.customLogger.error(`Retry count ${retryCount} exceeded for user rematch ${input.userId}`)
      return
    }

    try {
      await this.userRematchService.rematchUser(input.userId)
    } catch (error: unknown) {
      const lastError = error instanceof Error ? error.message : 'Unknown error'
      this.customLogger.error(`User rematch failed for userId ${input.userId}: ${lastError}`)
      throw error
    }

    const matchedJobs = await this.prismaService.$queryRaw<{ job_id: number }[]>`
      SELECT jmu.job_id
      FROM job_matched_users jmu
      JOIN jobs j ON j.id = jmu.job_id
      WHERE jmu.user_id = ${input.userId}
        AND j.status_id = ${JobStatus.open}
    `

    this.customLogger.log(`fit-score recalc enqueue userId=${input.userId} jobCount=${matchedJobs.length}`)

    await Promise.all(matchedJobs.map(({ job_id: jobId }) => this.publishFitScoreRecalc(jobId, input.userId, input.correlationId)))
  }

  async handleFitScoreRecalc(retryCount: number, input: FitScoreRecalc): Promise<void> {
    if (retryCount > Constants.MAX_FIT_SCORE_RECALC_RETRIES) {
      this.customLogger.error(`Retry count ${retryCount} exceeded for fit-score recalc jobId=${input.jobId} userId=${input.userId}`)
      return
    }

    try {
      this.customLogger.log(`fit-score recalc start jobId=${input.jobId} userId=${input.userId}`)
      await this.fitScoreService.calculateAndSave(input.userId, input.jobId)
      this.customLogger.log(`fit-score recalc done jobId=${input.jobId} userId=${input.userId}`)
    } catch (error: unknown) {
      const lastError = error instanceof Error ? error.message : 'Unknown error'
      this.customLogger.error(`Fit-score recalc failed for jobId=${input.jobId} userId=${input.userId}: ${lastError}`)
      throw error
    }
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
}

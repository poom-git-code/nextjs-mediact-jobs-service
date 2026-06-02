import { Injectable } from '@nestjs/common'
import { UserReadRepository } from '../repositories/user.repository'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { SqsService } from '@ssut/nestjs-sqs'
import { MessageAttributeValue } from '@aws-sdk/client-sqs'
import { getLanguage } from '../../app-configs/middleware/languages.middleware'
import { getCorrelationId, getUserId } from '../../app-configs/contexts/consumer.context'
import { JobReadRepository, JobRepository } from '../repositories/job.repository'
import { Jobs } from '../repositories/models/job.model'
import { Constants } from '../../app-configs/configs/constant.config'
import { JobBatchRepository } from '../repositories/job-batch.repository'
import { job_batch_status as JobBatchStatus, JobPublishGroup } from '@prisma/client'
import { JobBatches } from '../repositories/models/job-batch.model'
import { JobMatch } from '../controllers/dto/consumer.dto'
import { MatchCriteria } from '../domains/match-criteria.domain'
import { ExperienceRange } from '../domains/experience-range.domain'
import { NotificationEvent, NotificationService } from '../external-services/notification.service'
import { JobApplyReadRepository } from '../repositories/job-apply.repository'
import { JobMatchedUsersRepository } from '../repositories/job-matched-users.repository'
import { JobStatus } from '../domains/job-status.domain'
import { BussinessException, CustomLogger } from 'nestjs-custom-module'

@Injectable()
export class RecipientGeneratorService {
  constructor(
    private readonly userReadRepository: UserReadRepository,
    private readonly jobRepository: JobRepository,
    private readonly jobReadRepository: JobReadRepository,
    private readonly sqsService: SqsService,
    private readonly jobBatchRepository: JobBatchRepository,
    private readonly jobApplyReadRepository: JobApplyReadRepository,
    private readonly notificationService: NotificationService,
    private readonly prismaService: PrismaService,
    private readonly jobMatchedUsersRepository: JobMatchedUsersRepository,
    private readonly customLogger: CustomLogger,
  ) {}

  private buildMessageAttributes(): Record<string, MessageAttributeValue> {
    return {
      correlationId: {
        DataType: 'String',
        StringValue: getCorrelationId(),
      },
      language: {
        DataType: 'String',
        StringValue: getLanguage(),
      },
      userId: {
        DataType: 'String',
        StringValue: getUserId(),
      },
    }
  }

  async createJobNotificationAndPublishToJobMatchQueue(job: Jobs, batches: JobBatches[]) {
    const messageAttributes = this.buildMessageAttributes()

    const [normalRes, autoMatchedRes] = await Promise.all([
      this.notificationService.sendNotification({
        eventName: NotificationEvent.JOB_BOARD_CAST_EVENT,
        payload: {
          jobId: job.id,
          title: job.job_title,
          description: job.job_description,
        },
      }),
      this.notificationService.sendNotification({
        eventName: NotificationEvent.JOB_AUTO_MATCHED_EVENT,
        payload: {
          jobId: job.id,
          title: job.job_title,
          description: job.job_description,
        },
      }),
    ])

    if (!normalRes || normalRes.notificationIds.length === 0) throw new Error('Failed to create normal notification')
    if (!autoMatchedRes || autoMatchedRes.notificationIds.length === 0)
      throw new Error('Failed to create autoMatched notification')

    const normalNotificationId = Number(normalRes.notificationIds.pop())
    const autoMatchedNotificationId = Number(autoMatchedRes.notificationIds.pop())
    const correlationId = getCorrelationId()

    await Promise.all(
      batches.map((batch) => {
        const uniqueKey = `${batch.job_id}-${batch.id}`

        const data = new JobMatch()
        data.jobId = Number(batch.job_id)
        data.batchId = Number(batch.id)
        data.normalNotificationId = normalNotificationId
        data.autoMatchedNotificationId = autoMatchedNotificationId
        data.batchNumber = batch.batch_no
        data.correlationId = correlationId

        return this.sqsService.send(Constants.SQS_QUEUE_JOB_MATCH_NAME, {
          groupId: uniqueKey,
          deduplicationId: uniqueKey,
          body: JSON.stringify(data),
          id: uniqueKey,
          messageAttributes,
        })
      }),
    )

    return batches.length
  }

  async resolveRecipientInCaseDepartment(job: Jobs, transaction: Transaction = this.prismaService): Promise<void> {
    // VR-001: job must be OPEN before triggering full match
    if (job.status_id !== JobStatus.open) {
      throw new BussinessException('Job is not in OPEN state', 8999)
    }

    // BR-TRIGGER-001: clear previous matched users once, before creating new batches
    await this.jobMatchedUsersRepository.deleteByJobId(job.id, transaction)

    const jobCertifications = await this.jobReadRepository.findJobCertificationsByJobId(job.id)

    const matchCriteria = MatchCriteria.createFromRawJson({
      roleId: job.required_role_id,
      certificationIds: jobCertifications.certifications,
      experience:
        job.min_experience_year != null
          ? ExperienceRange.createFromRange(job.min_experience_year, job.max_experience_year ?? undefined)
          : null,
    })

    this.customLogger.log(
      `job match start jobId=${job.id} publishGroup=${job.publish_group} departmentId=${job.required_department_id} roleId=${matchCriteria.roleId ?? null} experience=${matchCriteria.experience?.toString() ?? null} certificationIds=${JSON.stringify(matchCriteria.certificationIds ?? [])}`,
    )

    const chunks = await this.userReadRepository.findLoopHospitalChunk(
      Constants.JOB_MATCH_USER_BATCH_LIMIT,
      job.required_department_id,
      matchCriteria.roleId,
      matchCriteria.experience,
      matchCriteria.certificationIds,
      transaction,
    )

    this.customLogger.log(`job match chunks jobId=${job.id} publishGroup=${job.publish_group} chunkCount=${chunks.length}`)

    const batches = await this.jobBatchRepository.createMany(
      chunks.map((e) => ({
        attempt_count: 0,
        batch_no: e.chunk_no,
        job_id: BigInt(job.id),
        publish_group: JobPublishGroup.hospital,
        criteria_snapshot: matchCriteria,
        start_id: BigInt(e.chunk_min_id),
        end_id: BigInt(e.chunk_max_id),
        status: JobBatchStatus.pending,
        last_error: null,
      })),
      transaction,
    )
    await this.createJobNotificationAndPublishToJobMatchQueue(job, batches)
  }

  async resolveRecipientInCaseFormerStaff(job: Jobs, transaction: Transaction = this.prismaService): Promise<void> {
    // VR-001: job must be OPEN before triggering full match
    if (job.status_id !== JobStatus.open) {
      throw new BussinessException('Job is not in OPEN state', 8999)
    }

    // BR-TRIGGER-001: clear previous matched users once, before creating new batches
    await this.jobMatchedUsersRepository.deleteByJobId(job.id, transaction)

    const jobCertifications = await this.jobReadRepository.findJobCertificationsByJobId(job.id)

    const matchCriteria = MatchCriteria.createFromRawJson({
      roleId: job.required_role_id,
      certificationIds: jobCertifications.certifications,
      experience:
        job.min_experience_year != null
          ? ExperienceRange.createFromRange(job.min_experience_year, job.max_experience_year ?? undefined)
          : null,
    })

    this.customLogger.log(
      `job match start jobId=${job.id} publishGroup=${job.publish_group} departmentId=${job.required_department_id} roleId=${matchCriteria.roleId ?? null} experience=${matchCriteria.experience?.toString() ?? null} certificationIds=${JSON.stringify(matchCriteria.certificationIds ?? [])}`,
    )

    const chunks = await this.userReadRepository.findLoopPartTimeChunk(
      Constants.JOB_MATCH_USER_BATCH_LIMIT,
      job.required_department_id,
      matchCriteria.roleId,
      matchCriteria.experience,
      matchCriteria.certificationIds,
      transaction,
    )

    this.customLogger.log(`job match chunks jobId=${job.id} publishGroup=${job.publish_group} chunkCount=${chunks.length}`)

    const batches = await this.jobBatchRepository.createMany(
      chunks.map((e) => ({
        attempt_count: 0,
        batch_no: e.chunk_no,
        job_id: BigInt(job.id),
        publish_group: JobPublishGroup.part_time,
        criteria_snapshot: matchCriteria,
        start_id: BigInt(e.chunk_min_id),
        end_id: BigInt(e.chunk_max_id),
        status: JobBatchStatus.pending,
        last_error: null,
      })),
      transaction,
    )
    await this.createJobNotificationAndPublishToJobMatchQueue(job, batches)
  }

  async resolveRecipientInCaseFormerWorker(job: Jobs, transaction: Transaction = this.prismaService): Promise<void> {
    // VR-001: job must be OPEN before triggering full match
    if (job.status_id !== JobStatus.open) {
      throw new BussinessException('Job is not in OPEN state', 8999)
    }

    // BR-TRIGGER-001: clear previous matched users once, before creating new batches
    await this.jobMatchedUsersRepository.deleteByJobId(job.id, transaction)

    const jobCertifications = await this.jobReadRepository.findJobCertificationsByJobId(job.id)

    const matchCriteria = MatchCriteria.createFromRawJson({
      roleId: job.required_role_id,
      certificationIds: jobCertifications.certifications,
      experience:
        job.min_experience_year != null
          ? ExperienceRange.createFromRange(job.min_experience_year, job.max_experience_year ?? undefined)
          : null,
    })

    this.customLogger.log(
      `job match start jobId=${job.id} publishGroup=${job.publish_group} departmentId=${job.required_department_id} roleId=${matchCriteria.roleId ?? null} experience=${matchCriteria.experience?.toString() ?? null} certificationIds=${JSON.stringify(matchCriteria.certificationIds ?? [])}`,
    )

    const chunks = await this.userReadRepository.findLoopFormerWorkerChunk(
      Constants.JOB_MATCH_USER_BATCH_LIMIT,
      job.required_department_id,
      matchCriteria.roleId,
      matchCriteria.experience,
      matchCriteria.certificationIds,
      transaction,
    )

    this.customLogger.log(`job match chunks jobId=${job.id} publishGroup=${job.publish_group} chunkCount=${chunks.length}`)

    if (chunks.length === 0) return

    const batches = await this.jobBatchRepository.createMany(
      chunks.map((e) => ({
        attempt_count: 0,
        batch_no: e.chunk_no,
        job_id: BigInt(job.id),
        publish_group: JobPublishGroup.former_worker,
        criteria_snapshot: matchCriteria,
        start_id: BigInt(e.chunk_min_id),
        end_id: BigInt(e.chunk_max_id),
        status: JobBatchStatus.pending,
        last_error: null,
      })),
      transaction,
    )
    await this.createJobNotificationAndPublishToJobMatchQueue(job, batches)
  }

  async resolveRecipientInCaseAllUser(job: Jobs, transaction: Transaction = this.prismaService): Promise<void> {
    // VR-001: job must be OPEN before triggering full match
    if (job.status_id !== JobStatus.open) {
      throw new BussinessException('Job is not in OPEN state', 8999)
    }

    // BR-TRIGGER-001: clear previous matched users once, before creating new batches
    await this.jobMatchedUsersRepository.deleteByJobId(job.id, transaction)

    const jobCertifications = await this.jobReadRepository.findJobCertificationsByJobId(job.id)

    const matchCriteria = MatchCriteria.createFromRawJson({
      roleId: job.required_role_id,
      certificationIds: jobCertifications.certifications,
      experience:
        job.min_experience_year != null
          ? ExperienceRange.createFromRange(job.min_experience_year, job.max_experience_year ?? undefined)
          : null,
    })

    this.customLogger.log(
      `job match start jobId=${job.id} publishGroup=${job.publish_group} departmentId=${job.required_department_id} roleId=${matchCriteria.roleId ?? null} experience=${matchCriteria.experience?.toString() ?? null} certificationIds=${JSON.stringify(matchCriteria.certificationIds ?? [])}`,
    )

    const chunks = await this.userReadRepository.findMatchedCriteriaUserChunk(
      Constants.JOB_MATCH_USER_BATCH_LIMIT,
      job.required_department_id,
      matchCriteria,
      transaction,
    )

    this.customLogger.log(`job match chunks jobId=${job.id} publishGroup=${job.publish_group} chunkCount=${chunks.length}`)

    if (chunks.length === 0) return

    const batches = await this.jobBatchRepository.createMany(
      chunks.map((e) => ({
        attempt_count: 0,
        batch_no: e.chunk_no,
        job_id: BigInt(job.id),
        publish_group: JobPublishGroup.system,
        criteria_snapshot: matchCriteria,
        start_id: BigInt(e.chunk_min_id),
        end_id: BigInt(e.chunk_max_id),
        status: JobBatchStatus.pending,
        last_error: null,
      })),
      transaction,
    )
    await this.createJobNotificationAndPublishToJobMatchQueue(job, batches)
  }

  async resolveRecipientOfClosedEvent(job: Jobs, transaction: Transaction = this.prismaService): Promise<void> {
    const usersIds = await this.jobApplyReadRepository.findPendingApplicants(job.id, transaction)
    const notificationResponse = await this.notificationService.sendNotification({
      eventName: NotificationEvent.JOB_CLOSED_EVENT,
      payload: {
        jobId: job.id,
        jobTitle: job.job_title,
      },
    })
    if (!notificationResponse || notificationResponse.notificationIds.length === 0)
      throw new Error('Failed to create notification')

    await this.notificationService.sendNotificationBatch({
      batchNumber: 1,
      notifyUserIds: usersIds,
      notificationId: notificationResponse.notificationIds.pop(),
    })
  }
}

import { Injectable } from '@nestjs/common'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { SqsService } from '@ssut/nestjs-sqs'
import { getCorrelationId } from 'nestjs-custom-module'
import { getLanguage } from '../../app-configs/middleware/languages.middleware'
import { MessageAttributeValue } from '@aws-sdk/client-sqs'
import { Constants } from '../../app-configs/configs/constant.config'
import { getUserId } from '../../app-configs/contexts/consumer.context'
import { JobRecipientGenerator } from '../controllers/dto/consumer.dto'
import { Event } from '../domains/event.domain'
import { JobApplyRepository } from '../repositories/job-apply.repository'
import { JobApplies } from '../repositories/models/job-apply.model'
import { ApplicantStatus } from '../domains/applicant-status.domain'
import { Jobs } from '../repositories/models/job.model'
import { JobRepository } from '../repositories/job.repository'
import { JobStatus } from '../domains/job-status.domain'

@Injectable()
export class JobsService {
  constructor(
    private readonly sqsService: SqsService,
    private readonly prismaService: PrismaService,
    private readonly jobRepository: JobRepository,
    private readonly jobApplyRepository: JobApplyRepository,
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

  async createJob(jobId: number, transaction: Transaction = this.prismaService) {
    const job = new JobRecipientGenerator()
    job.jobId = jobId
    job.eventName = Event.JOB_CREATED_EVENT

    const uniqueKey = `job-${job.eventName}-${jobId}`
    await this.sqsService.send(Constants.SQS_QUEUE_RECIPIENT_NAME, {
      body: JSON.stringify(job),
      groupId: uniqueKey,
      deduplicationId: uniqueKey,
      messageAttributes: this.buildMessageAttributes(),
      id: uniqueKey,
    })
  }

  async updateJob(jobId: number, transaction: Transaction = this.prismaService) {
    const job = new JobRecipientGenerator()
    job.jobId = jobId
    job.eventName = Event.JOB_UPDATED_EVENT

    const uniqueKey = `job-${job.eventName}-${jobId}-${getCorrelationId()}`
    await this.sqsService.send(Constants.SQS_QUEUE_RECIPIENT_NAME, {
      body: JSON.stringify(job),
      groupId: uniqueKey,
      deduplicationId: uniqueKey,
      messageAttributes: this.buildMessageAttributes(),
      id: uniqueKey,
    })
  }

  async applyToJob(
    jobId: number,
    userId: number,
    remark: string | null,
    transaction: Transaction = this.prismaService,
  ): Promise<JobApplies> {
    const jobApply = await this.jobApplyRepository.create(
      {
        job_id: jobId,
        user_id: userId,
        status_id: ApplicantStatus.pending,
        apply_date: new Date(),
        remark: remark,
        approve_user_id: null,
        approve_date: null,
        withdraw_date: null,
      },
      transaction,
    )
    return jobApply
  }

  async approveApplicant(
    jobApply: JobApplies,
    remark: string | null,
    transaction: Transaction = this.prismaService,
  ): Promise<JobApplies> {
    jobApply.status_id = ApplicantStatus.hired
    jobApply.approve_user_id = +getUserId()
    jobApply.approve_date = new Date()
    jobApply.remark = remark
    return this.jobApplyRepository.save(jobApply, transaction)
  }

  async rejectApplicant(
    jobApply: JobApplies,
    remark: string | null,
    transaction: Transaction = this.prismaService,
  ): Promise<JobApplies> {
    jobApply.status_id = ApplicantStatus.rejected
    jobApply.remark = remark
    return this.jobApplyRepository.save(jobApply, transaction)
  }

  async closeJob(job: Jobs, transaction: Transaction = this.prismaService) {
    const count = await this.jobApplyRepository.countByJobIdAndStatus(job.id, ApplicantStatus.hired, transaction)

    const jobRecipient = new JobRecipientGenerator()
    jobRecipient.jobId = job.id
    jobRecipient.eventName = Event.JOB_CLOSED_EVENT

    if (count > 0) job.status_id = JobStatus.closed
    else job.status_id = JobStatus.cancelled

    await this.jobRepository.save(job, transaction)

    if (job.status_id === JobStatus.cancelled) return
    const uniqueKey = `job-${jobRecipient.eventName}-${jobRecipient.jobId}`
    await this.sqsService.send(Constants.SQS_QUEUE_RECIPIENT_NAME, {
      body: JSON.stringify(jobRecipient),
      groupId: uniqueKey,
      deduplicationId: uniqueKey,
      messageAttributes: this.buildMessageAttributes(),
      id: uniqueKey,
    })
  }
}

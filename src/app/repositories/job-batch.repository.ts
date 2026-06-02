import { Injectable } from '@nestjs/common'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { JobBatches } from './models/job-batch.model'
import { plainToInstance } from 'class-transformer'
import { job_batch_status as JobBatchStatus, JobPublishGroup } from '@prisma/client'
import { PublishGroupDomain } from '../domains/publish-group.domain'
import { getCorrelationId } from '../../app-configs/contexts/consumer.context'

@Injectable()
export class JobBatchRepository {
  constructor(private prismaService: PrismaService) {}

  async findOneById(id: bigint, transaction: Transaction = this.prismaService): Promise<JobBatches | null> {
    const batch = await transaction.job_batches.findUnique({
      where: { id },
    })
    if (!batch) return null
    return plainToInstance(JobBatches, batch, { excludeExtraneousValues: true })
  }

  async findByJobId(jobId: bigint, transaction: Transaction = this.prismaService): Promise<JobBatches[]> {
    const batches = await transaction.job_batches.findMany({
      where: { job_id: jobId },
    })
    return batches.map((batch) => plainToInstance(JobBatches, batch, { excludeExtraneousValues: true }))
  }

  async create(
    batch: Omit<JobBatches, 'id' | 'created_at' | 'updated_at'>,
    transaction: Transaction = this.prismaService,
  ): Promise<JobBatches> {
    const createdBatch = await transaction.job_batches.create({
      data: {
        ...batch,
        publish_group: PublishGroupDomain.resolvePublishGroup(batch.publish_group),
        created_at: new Date(),
        updated_at: new Date(),
        correlation_id: getCorrelationId(),
      },
    })
    return plainToInstance(JobBatches, createdBatch, { excludeExtraneousValues: true })
  }

  async createMany(
    batches: Omit<JobBatches, 'id' | 'created_at' | 'updated_at' | 'correlation_id'>[],
    transaction: Transaction = this.prismaService,
  ): Promise<JobBatches[]> {
    if (batches.length === 0) return []
    const now = new Date()
    await transaction.job_batches.createMany({
      data: batches.map((batch) => ({
        ...batch,
        publish_group: PublishGroupDomain.resolvePublishGroup(batch.publish_group),
        created_at: now,
        updated_at: now,
        correlation_id: getCorrelationId(),
      })),
    })
    const results = await transaction.job_batches.findMany({
      where: {
        correlation_id: getCorrelationId(),
        job_id: batches[0].job_id,
      },
    })
    return plainToInstance(JobBatches, results, {
      excludeExtraneousValues: true,
    })
  }

  async updateStatus(
    id: bigint,
    status: JobBatchStatus,
    transaction: Transaction = this.prismaService,
  ): Promise<JobBatches> {
    const updatedBatch = await transaction.job_batches.update({
      where: { id },
      data: {
        status,
        updated_at: new Date(),
      },
    })
    return plainToInstance(JobBatches, updatedBatch, { excludeExtraneousValues: true })
  }

  async incrementAttemptCount(
    id: bigint,
    lastError?: string,
    transaction: Transaction = this.prismaService,
  ): Promise<JobBatches> {
    const batch = await transaction.job_batches.findUnique({
      where: { id },
    })
    if (!batch) throw new Error(`Job batch ${id} not found`)

    const updatedBatch = await transaction.job_batches.update({
      where: { id },
      data: {
        attempt_count: batch.attempt_count + 1,
        last_error: lastError || batch.last_error,
        updated_at: new Date(),
      },
    })
    return plainToInstance(JobBatches, updatedBatch, { excludeExtraneousValues: true })
  }
}

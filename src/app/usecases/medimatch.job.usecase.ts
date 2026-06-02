import { Injectable } from '@nestjs/common'
import { CustomLogger } from 'nestjs-custom-module'
import { JobReadRepository, JobRepository } from '../repositories/job.repository'
import { JobSwitchingLogsRepository } from '../repositories/job-switching-logs.repository'
import { JobMatchedUsersRepository } from '../repositories/job-matched-users.repository'
import { JobApplyRepository } from '../repositories/job-apply.repository'
import { JobsService } from '../services/jobs.service'
import { JobAudienceExhaustedEmailService } from '../services/job-audience-exhausted-email.service'
import { ScheduleStart, AutoCloseResponse, AutoSwitchAudience, SwitchToFormerWorker } from '../controllers/dto/internal.job.dto'
import { PrismaService } from '../../modules/prisma.module'
import { PublishGroup, PUBLISH_GROUP_TO_PRISMA, SWITCH_MAP } from '../domains/publish-group.domain'

@Injectable()
export class MedimatchJobUsecase {
  constructor(
    private customLogger: CustomLogger,
    private jobsRepository: JobRepository,
    private jobsService: JobsService,
    private jobReadRepository: JobReadRepository,
    private prismaService: PrismaService,
    private jobSwitchingLogsRepository: JobSwitchingLogsRepository,
    private jobMatchedUsersRepository: JobMatchedUsersRepository,
    private jobAudienceExhaustedEmailService: JobAudienceExhaustedEmailService,
    private jobApplyRepository: JobApplyRepository,
  ) {}

  async autoCloseJobs(): Promise<AutoCloseResponse> {
    const now = new Date()
    const jobsToClose = await this.jobReadRepository.findJobsToAutoClose(now)
    if (jobsToClose.length === 0) {
      return { closedCount: 0 }
    }

    const jobIds = jobsToClose.map((j) => j.id)
    let closedCount = 0

    // การปิด Job แบบ Batch เพื่อประสิทธิภาพ
    try {
      const result = await this.jobsRepository.bulkUpdateToClosed(jobIds)
      closedCount = result.count

      await Promise.allSettled(jobsToClose.map((id) => this.jobsService.closeJob(id)))
      this.customLogger.log(`[Auto-Close] Successfully closed ${closedCount} jobs at ${now.toISOString()}`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.customLogger.error(`[Auto-Close] Error during batch update: ${errorMessage}`)
    }

    return { closedCount }
  }

  async scheduleStartJobs(): Promise<ScheduleStart> {
    const now = new Date()

    // 1. ดึงข้อมูล Job ที่ถึงเวลา Start ด้วย Raw SQL
    const jobsToStart = await this.jobsRepository.findJobsToScheduleStart(now)

    if (jobsToStart.length === 0) {
      return { startedCount: 0, failedIds: [] }
    }

    const jobIds = jobsToStart.map((j) => j.id)
    let startedCount = 0
    const failedIds: number[] = []

    // 2. ประมวลผลแบบรายตัวภายใน Transaction (เพื่อให้ Error per job แยกกันได้)
    for (const jobId of jobIds) {
      try {
        await this.prismaService.$transaction(async (t) => {
          await this.jobsRepository.activateJob(jobId, now, t)

          // เรียก External Services (Requirement: JobsService.createJob)
          await this.jobsService.createJob(jobId)
        })

        startedCount++
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.customLogger.error(`[Schedule-Start] Error processing job ID ${jobId}: ${errorMessage}`)
        failedIds.push(jobId)
      }
    }

    this.customLogger.log(
      `[Schedule-Start] Successfully started ${startedCount}/${jobIds.length} jobs at ${now.toISOString()}`,
    )

    return { startedCount, failedIds }
  }

  async autoSwitchAudience(): Promise<AutoSwitchAudience> {
    const now = new Date()

    // ค้นหา Job ที่เข้าเงื่อนไขต้อง Switch (hospital / part-time / former-worker)
    const jobsToSwitch = await this.jobReadRepository.findJobsToAutoSwitchAudience()

    if (jobsToSwitch.length === 0) {
      return { switchedCount: 0, failedIds: [] }
    }

    let switchedCount = 0
    const failedIds: number[] = []

    // ประมวลผลทีละ Job เพื่อความปลอดภัย (Error per job handling)
    for (const job of jobsToSwitch) {
      // FR-SWITCH-005/BR-SWITCH-004: quota check must happen before every other switch operation
      if (job.max_applicants !== null && job.max_applicants !== undefined) {
        const appliedCount = await this.jobApplyRepository.countPositiveByJobId(job.id)
        if (appliedCount >= job.max_applicants) {
          await this.jobsRepository.jobsDisableSwitch(job.id, now)
          this.customLogger.log(
            `[Auto-Switch] Job ID ${job.id} quota met (${appliedCount}/${job.max_applicants} applied), switch disabled`,
          )
          continue
        }
      }

      const currentGroup = job.publish_group as PublishGroup

      // FR-SWITCH-001: switch_to_next_audience = false is filtered upstream by findJobsToAutoSwitchAudience SQL (AND j.switch_to_next_audience = TRUE)

      const toGroup = SWITCH_MAP[currentGroup]
      if (!toGroup) {
        this.customLogger.warn(
          `[Auto-Switch] No switch mapping found for publish_group="${currentGroup}" (job ID ${job.id}) — skipped`,
        )
        continue
      }

      // FR-SWITCH-003: job reaches loop3 threshold → switch to system + disable future switching (atomic), then email
      if (toGroup === PublishGroup.system) {
        try {
          await this.prismaService.$transaction(async (t) => {
            await this.jobMatchedUsersRepository.deleteByJobId(job.id, t)
            await this.jobsRepository.jobsSwitchPublishGroupWithCleanup(job.id, PUBLISH_GROUP_TO_PRISMA[toGroup], now, t)
            await this.jobsRepository.jobsDisableSwitch(job.id, now, t)
            await this.jobSwitchingLogsRepository.createLog(job.id, currentGroup, toGroup, now, t)
          })
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          this.customLogger.error(
            `[Auto-Switch] Failed to switch job ID ${job.id} to system (loop3 threshold): ${errorMessage}`,
          )
          failedIds.push(job.id)
          continue
        }
        await this.jobAudienceExhaustedEmailService.notifyAudienceExhausted(job)
        this.customLogger.log(
          `[Auto-Switch] Job ID ${job.id} reached loop3 threshold (${currentGroup} → system), switch disabled, Partner Admin email triggered`,
        )
        switchedCount++
        continue
      }

      // BR-SWITCH-002: DELETE job_matched_users + UPDATE publish_group must be atomic
      try {
        await this.prismaService.$transaction(async (t) => {
          await this.jobMatchedUsersRepository.deleteByJobId(job.id, t)

          await this.jobsRepository.jobsSwitchPublishGroupWithCleanup(job.id, PUBLISH_GROUP_TO_PRISMA[toGroup], now, t)

          await this.jobSwitchingLogsRepository.createLog(job.id, currentGroup, toGroup, now, t)
        })
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.customLogger.error(
          `[Auto-Switch] Failed to switch job ID ${job.id} (publish_group="${job.publish_group}"): ${errorMessage}`,
        )
        failedIds.push(job.id)
        continue
      }

      // แจ้ง downstream ว่า job มีการเปลี่ยนแปลง (outside transaction — SQS call)
      // DB has already committed at this point; SQS failure is a separate concern requiring DLQ/retry at infra level.
      try {
        await this.jobsService.updateJob(job.id)
      } catch (sqsError: unknown) {
        const errorMessage = sqsError instanceof Error ? sqsError.message : 'Unknown error'
        this.customLogger.error(
          `[Auto-Switch] DB committed for job ID ${job.id} but downstream SQS trigger failed: ${errorMessage} — downstream match state may be stale`,
        )
      }

      this.customLogger.log(`[Auto-Switch] Job ID ${job.id} switched: ${currentGroup} → ${toGroup}`)
      switchedCount++
    }

    this.customLogger.log(`[Auto-Switch] Successfully switched ${switchedCount} jobs at ${now.toISOString()}`)

    return { switchedCount, failedIds }
  }

  async switchPartTimeToFormerWorker(): Promise<SwitchToFormerWorker> {
    const now = new Date()

    const jobsToSwitch = await this.jobReadRepository.findJobsToSwitchToFormerWorker()

    if (jobsToSwitch.length === 0) {
      return { switchedCount: 0, failedIds: [] }
    }

    let switchedCount = 0
    const failedIds: number[] = []

    for (const job of jobsToSwitch) {
      // FR-SWITCH-005/BR-SWITCH-004: quota check must happen before every other switch operation
      if (job.max_applicants !== null && job.max_applicants !== undefined) {
        const appliedCount = await this.jobApplyRepository.countPositiveByJobId(job.id)
        if (appliedCount >= job.max_applicants) {
          await this.jobsRepository.jobsDisableSwitch(job.id, now)
          this.customLogger.log(
            `[Timed-Switch] Job ID ${job.id} quota met (${appliedCount}/${job.max_applicants} applied), switch disabled`,
          )
          continue
        }
      }

      // BR-SWITCH-002: DELETE job_matched_users + UPDATE publish_group must be atomic
      try {
        await this.prismaService.$transaction(async (t) => {

          await this.jobsRepository.jobsSwitchPublishGroupWithCleanup(
            job.id,
            PUBLISH_GROUP_TO_PRISMA[PublishGroup.former_worker],
            now,
            t,
          )

          await this.jobSwitchingLogsRepository.createLog(
            job.id,
            PublishGroup.part_time,
            PublishGroup.former_worker,
            now,
            t,
          )
        })
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.customLogger.error(
          `[Timed-Switch] Failed to switch job ID ${job.id} (part-time → former-worker): ${errorMessage}`,
        )
        failedIds.push(job.id)
        continue
      }

      // Notify downstream outside transaction — SQS failure is non-fatal
      try {
        await this.jobsService.updateJob(job.id)
      } catch (sqsError: unknown) {
        const errorMessage = sqsError instanceof Error ? sqsError.message : 'Unknown error'
        this.customLogger.error(
          `[Timed-Switch] DB committed for job ID ${job.id} but downstream SQS trigger failed: ${errorMessage} — downstream match state may be stale`,
        )
      }

      this.customLogger.log(`[Timed-Switch] Job ID ${job.id} switched: part-time → former-worker`)
      switchedCount++
    }

    this.customLogger.log(`[Timed-Switch] Successfully switched ${switchedCount} jobs at ${now.toISOString()}`)

    return { switchedCount, failedIds }
  }
}

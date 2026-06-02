import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { CustomLogger } from 'nestjs-custom-module'
import { firstValueFrom, map } from 'rxjs'
import { PrismaService } from '../../modules/prisma.module'
import { Configs } from '../../app-configs/configs/env.config'
import { Constants } from '../../app-configs/configs/constant.config'
import { EmailEventName } from '../external-services/notification.service'
import { EncryptUtility } from '../../utilities/encryptUtility'

type JobForApprovalResult = {
  id: number
  job_code: string
  job_title: string
  required_department_id: number | null
  created_by: number | null
}

@Injectable()
export class JobApprovalResultEmailService {
  private readonly notificationApiUrl: string
  private readonly notificationApiKey: string

  constructor(
    private readonly prismaService: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService<Configs>,
    private readonly customLogger: CustomLogger,
  ) {
    this.notificationApiUrl = this.configService.get('notificationApiUrl')
    this.notificationApiKey = this.configService.get('notificationApiKey')
  }

  async notifyApproved(job: JobForApprovalResult, newStatus: 'OPEN' | 'PENDING_SCHEDULE'): Promise<void> {
    const supervisorEmail = await this.getSupervisorEmail(job.created_by)
    if (!supervisorEmail) {
      this.customLogger.warn(
        `[JobApprovalResultEmail] No supervisor email found for created_by=${job.created_by} (job ID ${job.id}) — skipped`,
      )
      return
    }

    const departmentName = await this.getDepartmentName(job.required_department_id)

    try {
      await firstValueFrom(
        this.httpService
          .post(
            `${this.notificationApiUrl}/api/email/send`,
            {
              emailEventName: EmailEventName.JOB_APPROVED_EVENT,
              payload: {
                to: [supervisorEmail],
                jobId: job.id,
                jobCode: job.job_code,
                jobTitle: job.job_title,
                departmentName,
                newStatus,
              },
            },
            {
              headers: {
                [Constants.HEADER_API_KEY]: this.notificationApiKey,
                'Content-Type': 'application/json',
                accept: 'application/json',
              },
            },
          )
          .pipe(map((res) => res.data)),
      )

      this.customLogger.log(
        `[JobApprovalResultEmail] Approved email sent for job ID ${job.id} to ${supervisorEmail}`,
      )
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.customLogger.error(
        `[JobApprovalResultEmail] Failed to send approved email for job ID ${job.id}: ${errorMessage}`,
      )
      // Do not re-throw — caller must continue
    }
  }

  async notifyRejected(job: JobForApprovalResult, rejectionReason: string): Promise<void> {
    const supervisorEmail = await this.getSupervisorEmail(job.created_by)
    if (!supervisorEmail) {
      this.customLogger.warn(
        `[JobApprovalResultEmail] No supervisor email found for created_by=${job.created_by} (job ID ${job.id}) — skipped`,
      )
      return
    }

    const departmentName = await this.getDepartmentName(job.required_department_id)

    try {
      await firstValueFrom(
        this.httpService
          .post(
            `${this.notificationApiUrl}/api/email/send`,
            {
              emailEventName: EmailEventName.JOB_REJECTED_EVENT,
              payload: {
                to: [supervisorEmail],
                jobId: job.id,
                jobCode: job.job_code,
                jobTitle: job.job_title,
                departmentName,
                rejectionReason,
              },
            },
            {
              headers: {
                [Constants.HEADER_API_KEY]: this.notificationApiKey,
                'Content-Type': 'application/json',
                accept: 'application/json',
              },
            },
          )
          .pipe(map((res) => res.data)),
      )

      this.customLogger.log(
        `[JobApprovalResultEmail] Rejected email sent for job ID ${job.id} to ${supervisorEmail}`,
      )
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.customLogger.error(
        `[JobApprovalResultEmail] Failed to send rejected email for job ID ${job.id}: ${errorMessage}`,
      )
      // Do not re-throw — caller must continue
    }
  }

  private async getSupervisorEmail(userId: number | null): Promise<string | null> {
    if (!userId) return null
    const rows = await this.prismaService.$queryRaw<{ email: string | null; email_encrypted: string | null }[]>`
      SELECT u.email, u.email_encrypted
      FROM users u
      WHERE u.id = ${userId}
        AND u.status_id = 1
      LIMIT 1
    `
    if (!rows.length) return null
    const row = rows[0]
    if (row.email) return row.email
    if (row.email_encrypted) return EncryptUtility.decryptAES(row.email_encrypted)
    return null
  }

  private async getDepartmentName(departmentId: number | null): Promise<string> {
    if (!departmentId) return 'ไม่ระบุแผนก'
    const dept = await this.prismaService.departments.findUnique({
      where: { id: departmentId },
    })
    return dept?.name ?? 'ไม่ระบุแผนก'
  }
}

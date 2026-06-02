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

type JobForPendingApproval = {
  id: number
  job_code: string
  job_title: string
  required_department_id: number | null
  created_by: number | null
  max_applicants: number | null
  work_date: Date
  start_time: Date
  end_time: Date
  created_at: Date | null
  publish_group: string
}

const PUBLISH_GROUP_LABEL: Record<string, string> = {
  hospital: 'Same Department',
  'part-time': 'Former Staff',
  'former-worker': 'Former Staff',
  system: 'Qualified Medi Act Users',
}

@Injectable()
export class JobPendingApprovalEmailService {
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

  async notifyPendingApproval(job: JobForPendingApproval): Promise<void> {
    if (!job.required_department_id) {
      this.customLogger.warn(`[JobPendingApprovalEmail] Job ID ${job.id} has no required_department_id — skipped`)
      return
    }

    const dept = await this.prismaService.departments.findUnique({
      where: { id: job.required_department_id },
    })
    if (!dept) {
      this.customLogger.warn(
        `[JobPendingApprovalEmail] Department ID ${job.required_department_id} not found for job ID ${job.id} — skipped`,
      )
      return
    }

    const adminEmails = await this.getPartnerAdminEmails(dept.facility_id)
    if (adminEmails.length === 0) {
      this.customLogger.warn(
        `[JobPendingApprovalEmail] No Partner Admin emails found for facility ID ${dept.facility_id} (job ID ${job.id}) — skipped`,
      )
      return
    }

    const supervisorName = await this.getSupervisorName(job.created_by)

    const formatShortDate = (d: Date) =>
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    const formatTime = (d: Date) =>
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
    const formatDateTime = (d: Date) => `${formatShortDate(d)} ${formatTime(d)}`

    try {
      await firstValueFrom(
        this.httpService
          .post(
            `${this.notificationApiUrl}/api/email/send`,
            {
              emailEventName: EmailEventName.JOB_PENDING_APPROVAL_EVENT,
              payload: {
                to: adminEmails,
                jobId: job.id,
                jobCode: job.job_code,
                jobTitle: job.job_title,
                departmentName: dept.name,
                supervisorName,
                publishGroupLabel: PUBLISH_GROUP_LABEL[job.publish_group] ?? job.publish_group,
                numberOfPositions: job.max_applicants ?? undefined,
                workDate: formatShortDate(job.work_date),
                startTime: formatTime(job.start_time),
                endTime: formatTime(job.end_time),
                submittedAt: job.created_at ? formatDateTime(job.created_at) : undefined,
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

      this.customLogger.log(`[JobPendingApprovalEmail] Email sent for job ID ${job.id} to ${adminEmails.join(', ')}`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.customLogger.error(`[JobPendingApprovalEmail] Failed to send email for job ID ${job.id}: ${errorMessage}`)
      // Do not re-throw — caller must continue
    }
  }

  private async getPartnerAdminEmails(facilityId: number): Promise<string[]> {
    const rows = await this.prismaService.$queryRaw<{ email: string | null; email_encrypted: string | null }[]>`
      SELECT DISTINCT u.email, u.email_encrypted
      FROM facility_admins fa
      JOIN users u ON u.id = fa.user_id
      JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = TRUE
      JOIN roles r ON r.id = ur.role_id AND r.name = 'Partner Admin'
      WHERE fa.facility_id = ${facilityId}
        AND fa.is_active = TRUE
        AND u.status_id = 1
        AND (
          (u.email IS NOT NULL AND u.email != '')
          OR (u.email_encrypted IS NOT NULL AND u.email_encrypted != '')
        )
    `

    return rows
      .map((row) => {
        if (row.email) return row.email
        if (row.email_encrypted) return EncryptUtility.decryptAES(row.email_encrypted)
        return null
      })
      .filter(Boolean) as string[]
  }

  private async getSupervisorName(userId: number | null): Promise<string> {
    if (!userId) return 'Supervisor'
    const rows = await this.prismaService.$queryRaw<{ first_name: string | null; last_name: string | null }[]>`
      SELECT first_name, last_name FROM users WHERE id = ${userId} LIMIT 1
    `
    if (!rows.length) return 'Supervisor'
    const { first_name, last_name } = rows[0]
    return [first_name, last_name].filter(Boolean).join(' ') || 'Supervisor'
  }
}

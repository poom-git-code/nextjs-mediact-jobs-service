import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Configs } from '../../app-configs/configs/env.config'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom, map } from 'rxjs'
import { Constants } from '../../app-configs/configs/constant.config'
import { getLanguage } from '../../app-configs/middleware/languages.middleware'

@Injectable()
export class NotificationService {
  private readonly apiUrl: string

  constructor(
    private httpService: HttpService,
    private configService: ConfigService<Configs>,
  ) {
    this.apiUrl = this.configService.get('notificationApiUrl')
  }

  async sendNotification<T>(request: NotificationRequest<T>): Promise<NotificationResponse> {
    return lastValueFrom(
      this.httpService
        .post(`${this.apiUrl}/api/send`, request, {
          headers: {
            [Constants.HEADER_LANGUAGE]: getLanguage(),
            accept: 'application/json',
            'Content-Type': 'application/json',
            [Constants.HEADER_API_KEY]: this.configService.get('notificationApiKey'),
          },
        })
        .pipe(map((res) => res.data.data)),
    )
  }

  async sendNotificationBatch(request: PostSendBatchUsersRequest): Promise<void> {
    await lastValueFrom(
      this.httpService
        .post(`${this.apiUrl}/api/send/batch/users`, request, {
          headers: {
            [Constants.HEADER_LANGUAGE]: getLanguage(),
            accept: 'application/json',
            'Content-Type': 'application/json',
            [Constants.HEADER_API_KEY]: this.configService.get('notificationApiKey'),
          },
        })
        .pipe(map((res) => res.data.data)),
    )
  }
}

export class PostSendBatchUsersRequest {
  notificationId: number
  batchNumber: number
  preferenceKey?: string
  notifyUserIds: number[]
}

export enum NotificationEvent {
  JOB_BOARD_CAST_EVENT = 'JOB_BOARD_CAST_EVENT',
  JOB_AUTO_MATCHED_EVENT = 'JOB_AUTO_MATCHED_EVENT',
  JOB_CLOSED_EVENT = 'JOB_CLOSED_EVENT',
  JOB_APPLICANT_APPROVED_EVENT = 'JOB_APPLICANT_APPROVED_EVENT',
  JOB_APPLICANT_REJECTED_EVENT = 'JOB_APPLICANT_REJECTED_EVENT',
  JOB_NEW_APPLICANT_EVENT = 'JOB_NEW_APPLICANT_EVENT',
}

export enum EmailEventName {
  JOB_AUDIENCE_EXHAUSTED_EVENT = 'JOB_AUDIENCE_EXHAUSTED_EVENT',
  JOB_PENDING_APPROVAL_EVENT = 'JOB_PENDING_APPROVAL_EVENT',
  JOB_APPROVED_EVENT = 'JOB_APPROVED_EVENT',
  JOB_REJECTED_EVENT = 'JOB_REJECTED_EVENT',
}

export class NotificationRequest<T> {
  eventName: NotificationEvent
  payload: T
}

export class NotificationResponse {
  notificationIds: number[]
}

export class JobBoardCastEventPayload {
  jobId: number
  title: string
  description?: string
}

export class JobClosedEventPayload {
  jobId: number
  jobTitle: string
}

export class JobApplicantRejectedEventPayload {
  jobId: number
  applicantId: number
  jobTitle: string
}

export class JobApplicantApprovedEventPayload {
  jobId: number
  jobTitle: string
  applicantId: number
}

export class JobNewApplicantEventPayload {
  jobId: number
  jobTitle: string
  applicantId: number
}

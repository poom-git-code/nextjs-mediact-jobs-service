// src/master-data/usecases/job-status.usecase.ts
import { Injectable } from '@nestjs/common'
import { JobStatusRepository } from '../repositories/job-status.repository'
import {
  GetCloseTypeResponse,
  GetJobExperienceYearsResponse,
  GetJobStatusesResponse,
  GetPublishGroupResponse,
} from '../controllers/dto/master-data.dto'
import { ExperienceRange } from '../domains/experience-range.domain'
import { getLanguage } from '../../app-configs/middleware/languages.middleware'
import { Languages, Localize } from '../domains/localize.domain'
import { JobAutoCloseType, JobPublishGroup } from '@prisma/client'

@Injectable()
export class MasterDataUsecase {
  constructor(private readonly jobStatusRepository: JobStatusRepository) {}

  async getJobStatuses(): Promise<GetJobStatusesResponse[]> {
    const statuses = await this.jobStatusRepository.findAll()
    // Mapping model to response DTO
    return statuses.map((status) => ({
      id: status.id,
      name: status.name,
    }))
  }

  async getJobExperienceYears(): Promise<GetJobExperienceYearsResponse[]> {
    const language = getLanguage()
    return [
      [0, 2],
      [2, 4],
      [4, 6],
      [6, 10],
      [10, undefined],
    ].map((e) => ({
      label: new Localize({
        [Languages.EN]: ExperienceRange.createFromRange(e[0], e[1]).toString() + ' years',
        [Languages.TH]: ExperienceRange.createFromRange(e[0], e[1]).toString() + ' ปี',
      }).translate(language),
      value: ExperienceRange.createFromRange(e[0], e[1]).toString(),
    }))
  }

  async getCloseType(): Promise<GetCloseTypeResponse[]> {
    const language = getLanguage()
    return [
      {
        label: new Localize({ [Languages.EN]: 'Manual Close', [Languages.TH]: 'ปิดด้วยตนเอง' }).translate(language),
        value: JobAutoCloseType.manual,
      },
      // {
      //   label: new Localize({ [Languages.EN]: 'Auto Close by Timer', [Languages.TH]: 'ปิดอัตโนมัติตามเวลา' }).translate(
      //     language,
      //   ),
      //   value: JobAutoCloseType.time,
      // },
      // {
      //   label: new Localize({
      //     [Languages.EN]: 'Close by Max Applicants',
      //     [Languages.TH]: 'ปิดด้วยจำนวนผู้สมัคร',
      //   }).translate(language),
      //   value: JobAutoCloseType.max_applicants,
      // },
    ]
  }

  async getPublishGroups(): Promise<GetPublishGroupResponse[]> {
    const language = getLanguage()
    return [
      {
        label: new Localize({
          [Languages.EN]: 'Same Department Only',
          [Languages.TH]: 'ภายในหน่วยงานเท่านั้น',
        }).translate(language),
        value: JobPublishGroup.hospital,
      },
      {
        label: new Localize({ [Languages.EN]: 'Former Staff', [Languages.TH]: 'ผู้ที่เคยทำงานกับโรงพยาบาล' }).translate(
          language,
        ),
        value: JobPublishGroup.part_time,
      },
      {
        label: new Localize({
          [Languages.EN]: 'Qualified Mediact Users',
          [Languages.TH]: 'ผู้ใช้ Mediact ที่มีคุณสมบัติตามเงื่อนไข',
        }).translate(language),
        value: JobPublishGroup.system,
      },
    ]
  }
}

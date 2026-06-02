import { Injectable } from '@nestjs/common'
import { CustomLogger } from 'nestjs-custom-module'
import { PrismaService } from '../../modules/prisma.module'
import { UserReadRepository } from '../repositories/user.repository'
import { JobRepository } from '../repositories/job.repository'
import { JobMatchedUsersRepository } from '../repositories/job-matched-users.repository'

@Injectable()
export class UserRematchService {
  constructor(
    private readonly userReadRepository: UserReadRepository,
    private readonly jobRepository: JobRepository,
    private readonly jobMatchedUsersRepository: JobMatchedUsersRepository,
    private readonly prismaService: PrismaService,
    private readonly customLogger: CustomLogger,
  ) {}

  async rematchUser(userId: number): Promise<void> {
    this.customLogger.log(`rematch start userId=${userId}`)

    // 1. Fetch active employments and user criteria in parallel
    const [employments, userCriteria] = await Promise.all([
      this.userReadRepository.findActiveEmploymentsByUserId(userId),
      this.userReadRepository.findUserCriteriaForRematch(userId),
    ])

    this.customLogger.log(
      `rematch criteria userId=${userId} roleIds=${JSON.stringify(userCriteria.roleIds)} totalExperienceYears=${userCriteria.totalExperienceYears} certificationIds=${JSON.stringify(userCriteria.certificationIds)}`,
    )

    this.customLogger.log(
      `rematch employments userId=${userId} count=${employments.length} detail=${JSON.stringify(employments)}`,
    )

    // 2. Derive department ID arrays per loop type (BR-REMATCH-003)
    const hospitalDepts = employments
      .filter((e) => !e.is_part_time && !e.is_job_applicant)
      .map((e) => e.department_id)

    const partTimeDepts = employments
      .filter((e) => e.is_part_time && !e.is_job_applicant)
      .map((e) => e.department_id)

    const formerWorkerDepts = employments
      .filter((e) => !e.is_part_time && e.is_job_applicant)
      .map((e) => e.department_id)

    const allDepts = Array.from(new Set(employments.map((e) => e.department_id)))

    this.customLogger.log(
      `rematch loop depts userId=${userId} loop1_hospital=${JSON.stringify(hospitalDepts)} loop2a_partTime=${JSON.stringify(partTimeDepts)} loop2b_formerWorker=${JSON.stringify(formerWorkerDepts)} loop3_system_allDepts=${JSON.stringify(allDepts)}`,
    )

    // 3. Query 4 loops in parallel — OPEN jobs matching user criteria (BR-REMATCH-001 + VR-004)
    const [l1, l2a, l2b, l3] = await Promise.all([
      hospitalDepts.length > 0
        ? this.jobRepository.findOpenJobIdsByLoopHospital(hospitalDepts, userCriteria)
        : Promise.resolve<number[]>([]),
      partTimeDepts.length > 0
        ? this.jobRepository.findOpenJobIdsByLoopPartTime(partTimeDepts, userCriteria)
        : Promise.resolve<number[]>([]),
      formerWorkerDepts.length > 0
        ? this.jobRepository.findOpenJobIdsByLoopFormerWorker(formerWorkerDepts, userCriteria)
        : Promise.resolve<number[]>([]),
      this.jobRepository.findOpenJobIdsByLoopSystem(allDepts, userCriteria),
    ])

    this.customLogger.log(
      `rematch loop results userId=${userId} loop1_hospital=${JSON.stringify(l1)} loop2a_partTime=${JSON.stringify(l2a)} loop2b_formerWorker=${JSON.stringify(l2b)} loop3_system=${JSON.stringify(l3)}`,
    )

    // 4. Union all matched job IDs
    const matchedJobIds = Array.from(new Set([...l1, ...l2a, ...l2b, ...l3]))

    this.customLogger.log(
      `rematch matched jobs userId=${userId} total=${matchedJobIds.length} jobIds=${JSON.stringify(matchedJobIds)}`,
    )

    // 5. Sync job_matched_users atomically (BR-REMATCH-002: no notification)
    await this.prismaService.$transaction(async (t) => {
      await this.jobMatchedUsersRepository.createManyForUser(userId, matchedJobIds, t)
      await this.jobMatchedUsersRepository.deleteByUserIdNotInJobIds(userId, matchedJobIds, t)
    })

    this.customLogger.log(`rematch done userId=${userId}`)
  }
}

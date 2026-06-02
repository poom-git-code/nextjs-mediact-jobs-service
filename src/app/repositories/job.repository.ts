import { Injectable } from '@nestjs/common'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { Jobs } from './models/job.model'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { getUserId } from '../../app-configs/contexts/consumer.context'
import { DepartmentJobCriteria } from './models/job.read.model'
import { FindJobsToAutoSwitchAudience, FindJobsToScheduleStart, FindJobsToSwitchToFormerWorker } from './models/job-internal.model'
import { JobPublishGroup, Prisma } from '@prisma/client'
import { PublishGroup, PublishGroupDomain } from '../domains/publish-group.domain'
import { JobStatus } from '../domains/job-status.domain'
import { UserRematchCriteria } from './models/user-rematch.model'

@Injectable()
export class JobRepository {
  constructor(private prismaService: PrismaService) {}

  async findOneByIdAndDepartmentId(
    id: number,
    departmentId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<Jobs | null> {
    const job = await transaction.jobs.findUnique({
      where: { id, required_department_id: departmentId },
    })
    if (!job) return null
    return plainToInstance(
      Jobs,
      { ...job, job_fee: Number(job.job_fee), min_wage: null, max_wage: null },
      { excludeExtraneousValues: true },
    )
  }

  async create(
    job: Omit<Jobs, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>,
    transaction: Transaction = this.prismaService,
  ) {
    const actionBy = +getUserId()
    const data = plainToInstance(Jobs, instanceToPlain(job), { excludeExtraneousValues: true })
    const createdJob = await transaction.jobs.create({
      data: {
        ...data,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: actionBy,
        updated_by: actionBy,
      },
    })
    return plainToInstance(
      Jobs,
      { ...createdJob, job_fee: Number(job.job_fee), min_wage: null, max_wage: null },
      { excludeExtraneousValues: true },
    )
  }

  async save(job: Jobs, transaction: Transaction = this.prismaService) {
    const actionBy = +getUserId()
    const data = plainToInstance(Jobs, instanceToPlain(job), { excludeExtraneousValues: true })
    const updatedJob = await transaction.jobs.update({
      where: { id: job.id },
      data: {
        ...data,
        updated_at: new Date(),
        updated_by: actionBy,
      },
    })
    return plainToInstance(
      Jobs,
      { ...updatedJob, job_fee: Number(job.job_fee), min_wage: null, max_wage: null },
      { excludeExtraneousValues: true },
    )
  }

  async findOneById(id: number, transaction: Transaction = this.prismaService): Promise<Jobs | null> {
    const job = await transaction.jobs.findUnique({
      where: { id },
    })
    if (!job) return null
    return plainToInstance(
      Jobs,
      { ...job, job_fee: Number(job.job_fee), min_wage: null, max_wage: null },
      { excludeExtraneousValues: true },
    )
  }

  async bulkUpdateToClosed(jobIds: number[], transaction: Transaction = this.prismaService) {
    const actionBy = +getUserId()

    return transaction.jobs.updateMany({
      where: { id: { in: jobIds } },
      data: {
        status_id: JobStatus.closed,
        updated_at: new Date(),
        updated_by: actionBy,
      },
    })
  }

  async jobsSwitchPublishGroupWithCleanup(
    id: number,
    toPublishGroup: JobPublishGroup,
    now: Date,
    transaction: Transaction = this.prismaService,
  ) {
    await transaction.jobs.update({
      where: { id: id },
      data: {
        publish_group: PublishGroupDomain.resolvePublishGroup(toPublishGroup),
        updated_at: now,
      },
    })
  }

  async jobsDisableSwitch(id: number, now: Date, transaction: Transaction = this.prismaService) {
    await transaction.jobs.update({
      where: { id: id },
      data: {
        switch_to_next_audience: false,
        updated_at: now,
      },
    })
  }

  async findJobsToScheduleStart(now: Date) {
    // ใช้ Driver-level binding เพื่อความปลอดภัยและแม่นยำ
    const result = await this.prismaService.$queryRaw<any[]>`
      SELECT 
        j.id
      FROM jobs j
      WHERE 
        j.status_id = ${JobStatus.pending_schedule}
        AND j.schedule_start_at <= ${now}
    `
    return plainToInstance(FindJobsToScheduleStart, result, { excludeExtraneousValues: true })
  }

  async activateJob(id: number, now: Date, transaction: Transaction = this.prismaService) {
    const actionBy = +getUserId()
    await transaction.jobs.update({
      where: { id: id },
      data: {
        status_id: JobStatus.open,
        updated_at: now,
        updated_by: actionBy,
      },
    })
  }

  // ─── User Rematch: find OPEN job IDs by loop type ─────────────

  private buildUserCriteriaSql({ roleIds, totalExperienceYears, certificationIds }: UserRematchCriteria): Prisma.Sql {
    const roleSql =
      roleIds.length > 0
        ? Prisma.sql`AND (j.required_role_id IS NULL OR j.required_role_id IN (${Prisma.join(roleIds)}))`
        : Prisma.sql`AND j.required_role_id IS NULL`

    const expSql = Prisma.sql`
      AND (j.min_experience_year IS NULL OR ${totalExperienceYears} >= j.min_experience_year)
      AND (j.max_experience_year IS NULL OR ${totalExperienceYears} <= j.max_experience_year)`

    const certSql =
      certificationIds.length > 0
        ? Prisma.sql`AND NOT EXISTS (
            SELECT 1 FROM job_specialties js
            WHERE js.job_id = j.id
              AND js.certification_id NOT IN (${Prisma.join(certificationIds)})
          )`
        : Prisma.sql`AND NOT EXISTS (
            SELECT 1 FROM job_specialties js
            WHERE js.job_id = j.id
          )`

    return Prisma.sql`${roleSql} ${expSql} ${certSql}`
  }

  async findOpenJobIdsByLoopHospital(
    departmentIds: number[],
    userCriteria: UserRematchCriteria,
    transaction: Transaction = this.prismaService,
  ): Promise<number[]> {
    if (departmentIds.length === 0) return []
    const criteriaSql = this.buildUserCriteriaSql(userCriteria)
    const results = await transaction.$queryRaw<{ id: number }[]>`
      SELECT j.id
      FROM jobs j
      WHERE j.status_id = ${JobStatus.open}
        AND j.publish_group = ${JobPublishGroup.hospital}
        AND j.required_department_id IN (${Prisma.join(departmentIds)})
        ${criteriaSql}
    `
    return results.map((r) => Number(r.id))
  }

  async findOpenJobIdsByLoopPartTime(
    departmentIds: number[],
    userCriteria: UserRematchCriteria,
    transaction: Transaction = this.prismaService,
  ): Promise<number[]> {
    if (departmentIds.length === 0) return []
    const criteriaSql = this.buildUserCriteriaSql(userCriteria)
    const results = await transaction.$queryRaw<{ id: number }[]>`
      SELECT j.id
      FROM jobs j
      WHERE j.status_id = ${JobStatus.open}
        AND j.publish_group = ${PublishGroup.part_time}
        AND j.required_department_id IN (${Prisma.join(departmentIds)})
        ${criteriaSql}
    `
    return results.map((r) => Number(r.id))
  }

  async findOpenJobIdsByLoopFormerWorker(
    departmentIds: number[],
    userCriteria: UserRematchCriteria,
    transaction: Transaction = this.prismaService,
  ): Promise<number[]> {
    if (departmentIds.length === 0) return []
    const criteriaSql = this.buildUserCriteriaSql(userCriteria)
    const results = await transaction.$queryRaw<{ id: number }[]>`
      SELECT j.id
      FROM jobs j
      WHERE j.status_id = ${JobStatus.open}
        AND j.publish_group = ${PublishGroup.former_worker}
        AND j.required_department_id IN (${Prisma.join(departmentIds)})
        ${criteriaSql}
    `
    return results.map((r) => Number(r.id))
  }

  async findOpenJobIdsByLoopSystem(
    excludeDepartmentIds: number[],
    userCriteria: UserRematchCriteria,
    transaction: Transaction = this.prismaService,
  ): Promise<number[]> {
    const excludeClause =
      excludeDepartmentIds.length > 0
        ? Prisma.sql`AND (j.required_department_id IS NULL OR j.required_department_id NOT IN (${Prisma.join(excludeDepartmentIds)}))`
        : Prisma.empty
    const criteriaSql = this.buildUserCriteriaSql(userCriteria)
    const results = await transaction.$queryRaw<{ id: number }[]>`
      SELECT j.id
      FROM jobs j
      WHERE j.status_id = ${JobStatus.open}
        AND j.publish_group = ${JobPublishGroup.system}
        ${excludeClause}
        ${criteriaSql}
    `
    return results.map((r) => Number(r.id))
  }
}

@Injectable()
export class JobReadRepository {
  constructor(private prismaService: PrismaService) {}

  async findJobCertificationsByJobId(jobId: number) {
    const result = await this.prismaService.$queryRaw<any[]>`
      SELECT JSON_ARRAYAGG(js.certification_id) as certifications
      FROM job_specialties js
      WHERE js.job_id = ${jobId} AND js.certification_id IS NOT NULL
      GROUP BY js.job_id`
    return plainToInstance(DepartmentJobCriteria, result[0] ?? {}, { excludeExtraneousValues: true })
  }

  async findJobsToAutoClose(now: Date) {
    // แปลง Date เป็น ISO String สำหรับ SQL (MySQL format: YYYY-MM-DD HH:mm:ss)
    const nowFormatted = now.toISOString().slice(0, 19).replace('T', ' ')

    const result: Jobs[] = await this.prismaService.$queryRaw`
        SELECT j.*
        FROM jobs j
        LEFT JOIN facility_packages fp ON j.facility_package_id = fp.id
        LEFT JOIN job_statuses js ON j.status_id = js.id
        WHERE 
          j.status_id = ${JobStatus.open}
          AND (
            -- 1. Work date reached
            (j.work_date <= ${nowFormatted})
            OR 
            -- 2. Package expired (เฉพาะ Job ที่มี facility_package_id)
            (j.facility_package_id IS NOT NULL AND fp.expires_at <= ${nowFormatted})
          )
      `

    return plainToInstance(
      Jobs,
      result.map((j) => ({
        ...j,
        job_fee: Number(j.job_fee),
        min_wage: Number(j.min_wage),
        max_wage: Number(j.max_wage),
      })),
      { excludeExtraneousValues: true },
    )
  }

  async findJobsToAutoSwitchAudience() {
    const result = await this.prismaService.$queryRaw<any[]>`
      SELECT
        j.id, j.job_code, j.publish_group, j.job_title,
        j.required_department_id, j.created_by, j.max_applicants,
        j.work_date, j.start_time, j.end_time, j.created_at
      FROM jobs j
      LEFT JOIN (
        SELECT job_id, MAX(switched_at) as last_switched
        FROM job_switching_logs
        GROUP BY job_id
      ) l ON l.job_id = j.id
      WHERE
        j.status_id = ${JobStatus.open}
        AND j.switch_to_next_audience = TRUE
        AND j.publish_group IN ('hospital', 'part-time', 'former-worker')
        AND DATE_ADD(
          COALESCE(l.last_switched, j.created_at),
          INTERVAL j.publish_group_interval_min MINUTE
        ) <= NOW()
    `
    return plainToInstance(FindJobsToAutoSwitchAudience, result, { excludeExtraneousValues: true })
  }

  async findJobsToSwitchToFormerWorker() {
    const result = await this.prismaService.$queryRaw<any[]>`
      SELECT j.id, j.max_applicants
      FROM jobs j
      LEFT JOIN (
        SELECT job_id, MAX(switched_at) as last_entered_part_time
        FROM job_switching_logs
        WHERE to_publish_group = 'part-time'
        GROUP BY job_id
      ) l ON l.job_id = j.id
      WHERE
        j.status_id = ${JobStatus.open}
        AND j.publish_group = 'part-time'
        AND DATE_ADD(
          COALESCE(l.last_entered_part_time, j.created_at),
          INTERVAL 15 MINUTE
        ) <= NOW()
    `
    return plainToInstance(FindJobsToSwitchToFormerWorker, result, { excludeExtraneousValues: true })
  }
}

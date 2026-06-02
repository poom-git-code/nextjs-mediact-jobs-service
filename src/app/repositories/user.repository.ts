import { Injectable } from '@nestjs/common'
import { PrismaService, Transaction } from '../../modules/prisma.module'
import { Users } from './models/user.model'
import { plainToInstance } from 'class-transformer'
import { Prisma } from '@prisma/client'
import { ExperienceRange } from '../domains/experience-range.domain'
import { UserRematchCriteria } from './models/user-rematch.model'

@Injectable()
export class UserRepository {
  constructor(private prismaService: PrismaService) {}

  async findOneById(id: number, transaction: Transaction = this.prismaService): Promise<Users | null> {
    const user = await transaction.users.findUnique({
      where: { id },
    })
    if (!user) return null
    return plainToInstance(Users, user, { excludeExtraneousValues: true })
  }
}

@Injectable()
export class UserReadRepository {
  constructor(private prismaService: PrismaService) {}

  // ─── Shared SQL fragment helpers ──────────────────────────────

  private experienceJoinSql(experience?: ExperienceRange) {
    if (!experience) return Prisma.empty
    const maxSql =
      experience.max === Number.POSITIVE_INFINITY
        ? Prisma.empty
        : Prisma.sql`AND SUM(ux.experience_years) + SUM(ux.experience_months) / 12.0 <= ${experience.max}`
    return Prisma.sql`JOIN (
      SELECT ux.user_id
      FROM user_experience ux
      GROUP BY ux.user_id
      HAVING SUM(ux.experience_years) + SUM(ux.experience_months) / 12.0 >= ${experience.min}
        ${maxSql}
    ) exp ON exp.user_id = u.id`
  }

  private roleFilterSql(roleId?: number) {
    if (!roleId) return Prisma.empty
    return Prisma.sql`AND EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = ${roleId}
    )`
  }

  private certificationAllMatchSql(certificationIds?: number[]) {
    if (!certificationIds || certificationIds.length === 0) return Prisma.empty
    return Prisma.sql`AND (
      SELECT COUNT(DISTINCT uc.certification_id)
      FROM user_certifications uc
      WHERE uc.user_id = u.id
        AND uc.certification_id IN (${Prisma.join(certificationIds)})
        AND uc.is_active = 1
    ) = ${certificationIds.length}`
  }

  // ─── Private base query builders ──────────────────────────────

  /**
   * Loop 1 (Hospital) Loop 2.1 (Part-time) & Loop 2.2 (Former-worker) — department-based employment filter.
   * Filters by department_id + employment type flags + full criteria (role + experience + certification ALL).
   */
  private employmentLoopUserQuery(
    departmentId: number,
    isPartTime: boolean,
    isJobApplicant: boolean,
    roleId?: number,
    experience?: ExperienceRange,
    certificationIds?: number[],
    startId?: number,
    endId?: number,
  ) {
    return Prisma.sql`
      SELECT DISTINCT(u.id), ROW_NUMBER() OVER (ORDER BY u.id ASC) AS rn
      FROM users AS u
      JOIN user_employments AS ue ON ue.user_id = u.id
      ${this.experienceJoinSql(experience)}
      WHERE u.status_id = 1
        AND ue.is_part_time = ${isPartTime}
        AND ue.is_job_applicant = ${isJobApplicant}
        AND ue.is_active = TRUE
        AND ue.department_id = ${departmentId}
        ${startId && endId ? Prisma.sql`AND u.id BETWEEN ${startId} AND ${endId}` : Prisma.empty}
        ${this.roleFilterSql(roleId)}
        ${this.certificationAllMatchSql(certificationIds)}
      ORDER BY u.id`
  }

  /**
   * Loop 3 (System) — system-wide user search with full criteria.
   */
  private loopSystemUserQuery(
    departmentId: number,
    {
      roleId,
      certificationIds,
      experience,
    }: {
      roleId?: number
      certificationIds?: number[]
      experience?: ExperienceRange
    },
    startId?: number,
    endId?: number,
  ) {
    return Prisma.sql`
      SELECT
        u.id,
        ROW_NUMBER() OVER (ORDER BY u.id) AS rn
      FROM users u
      ${this.experienceJoinSql(experience)}
      WHERE
        u.status_id = 1
        AND u.id NOT IN (
          SELECT DISTINCT ue.user_id
          FROM user_employments ue
          WHERE ue.department_id = ${departmentId}
            AND ue.is_active = TRUE
        )
        ${startId && endId ? Prisma.sql`AND u.id BETWEEN ${startId} AND ${endId}` : Prisma.empty}
        ${this.roleFilterSql(roleId)}
        ${this.certificationAllMatchSql(certificationIds)}
      ORDER BY u.id`
  }

  // ─── Shared execution helpers ─────────────────────────────────

  private async executeChunkQuery(
    chunkSize: number,
    baseQuery: Prisma.Sql,
    transaction: Transaction,
  ): Promise<{ chunk_no: number; chunk_min_id: number; chunk_max_id: number }[]> {
    const results = await transaction.$queryRaw<any[]>`
      WITH base AS (
        ${baseQuery}
      ),
      chunked AS (
        SELECT id, FLOOR((rn - 1) / ${chunkSize}) + 1 AS chunk_no
        FROM base
      )
      SELECT
        chunk_no,
        MIN(id) AS chunk_min_id,
        MAX(id) AS chunk_max_id
      FROM chunked
      GROUP BY chunk_no`

    if (!results.length) return []
    return results.map((result) => ({
      chunk_no: Number(result.chunk_no),
      chunk_min_id: Number(result.chunk_min_id),
      chunk_max_id: Number(result.chunk_max_id),
    }))
  }

  private async executeUserQuery(baseQuery: Prisma.Sql, transaction: Transaction): Promise<number[]> {
    const results = await transaction.$queryRaw<any[]>`${baseQuery}`
    if (!results.length) return []
    return results.map((result) => Number(result.id))
  }

  // ─── Loop 1: Hospital ─────────────────────────────────────────
  // FR-LOOP-001: is_part_time=false, is_job_applicant=false + role + experience + certification ALL

  async findLoopHospitalChunk(
    chunkSize: number,
    departmentId: number,
    roleId?: number,
    experience?: ExperienceRange,
    certificationIds?: number[],
    transaction: Transaction = this.prismaService,
  ): Promise<{ chunk_no: number; chunk_min_id: number; chunk_max_id: number }[]> {
    return this.executeChunkQuery(
      chunkSize,
      this.employmentLoopUserQuery(departmentId, false, false, roleId, experience, certificationIds),
      transaction,
    )
  }

  async findLoopHospitalUsers(
    departmentId: number,
    startId: number,
    endId: number,
    roleId?: number,
    experience?: ExperienceRange,
    certificationIds?: number[],
    transaction: Transaction = this.prismaService,
  ): Promise<number[]> {
    return this.executeUserQuery(
      this.employmentLoopUserQuery(departmentId, false, false, roleId, experience, certificationIds, startId, endId),
      transaction,
    )
  }

  // ─── Loop 2.1: Part-time ──────────────────────────────────────
  // FR-LOOP-002: is_part_time=true, is_job_applicant=false + role + experience + certification ALL

  async findLoopPartTimeChunk(
    chunkSize: number,
    departmentId: number,
    roleId?: number,
    experience?: ExperienceRange,
    certificationIds?: number[],
    transaction: Transaction = this.prismaService,
  ): Promise<{ chunk_no: number; chunk_min_id: number; chunk_max_id: number }[]> {
    return this.executeChunkQuery(
      chunkSize,
      this.employmentLoopUserQuery(departmentId, true, false, roleId, experience, certificationIds),
      transaction,
    )
  }

  async findLoopPartTimeUsers(
    departmentId: number,
    startId: number,
    endId: number,
    roleId?: number,
    experience?: ExperienceRange,
    certificationIds?: number[],
    transaction: Transaction = this.prismaService,
  ): Promise<number[]> {
    return this.executeUserQuery(
      this.employmentLoopUserQuery(departmentId, true, false, roleId, experience, certificationIds, startId, endId),
      transaction,
    )
  }

  // ─── Loop 2.2: Former Worker ──────────────────────────────────
  // FR-LOOP-003: is_part_time=false, is_job_applicant=true + role + experience + certification ALL

  async findLoopFormerWorkerChunk(
    chunkSize: number,
    departmentId: number,
    roleId?: number,
    experience?: ExperienceRange,
    certificationIds?: number[],
    transaction: Transaction = this.prismaService,
  ): Promise<{ chunk_no: number; chunk_min_id: number; chunk_max_id: number }[]> {
    return this.executeChunkQuery(
      chunkSize,
      this.employmentLoopUserQuery(departmentId, false, true, roleId, experience, certificationIds),
      transaction,
    )
  }

  async findLoopFormerWorkerUsers(
    departmentId: number,
    startId: number,
    endId: number,
    roleId?: number,
    experience?: ExperienceRange,
    certificationIds?: number[],
    transaction: Transaction = this.prismaService,
  ): Promise<number[]> {
    return this.executeUserQuery(
      this.employmentLoopUserQuery(departmentId, false, true, roleId, experience, certificationIds, startId, endId),
      transaction,
    )
  }

  // ─── Loop 3: System ───────────────────────────────────────────
  // FR-LOOP-004: NOT IN active employment in dept + role + experience + certification ALL

  async findLoopSystemChunk(
    chunkSize: number,
    departmentId: number,
    criteria: {
      roleId?: number
      certificationIds?: number[]
      experience?: ExperienceRange
    },
    transaction: Transaction = this.prismaService,
  ): Promise<{ chunk_no: number; chunk_min_id: number; chunk_max_id: number }[]> {
    return this.executeChunkQuery(chunkSize, this.loopSystemUserQuery(departmentId, criteria), transaction)
  }

  async findLoopSystemUsers(
    departmentId: number,
    criteria: {
      roleId?: number
      certificationIds?: number[]
      experience?: ExperienceRange
    },
    startId: number,
    endId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<number[]> {
    return this.executeUserQuery(this.loopSystemUserQuery(departmentId, criteria, startId, endId), transaction)
  }

  // ─── Deprecated methods (backward compatibility) ──────────────

  /** @deprecated Use findLoopHospitalUsers instead */
  async findDepartmentEmploymentUsers(
    departmentId: number,
    startId: number,
    endId: number,
    roleId?: number,
    transaction: Transaction = this.prismaService,
  ): Promise<number[]> {
    return this.findLoopHospitalUsers(departmentId, startId, endId, roleId, undefined, undefined, transaction)
  }

  /** @deprecated Use findLoopHospitalChunk instead */
  async findDepartmentEmploymentUserChunk(
    chunkSize: number,
    departmentId: number,
    roleId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<{ chunk_no: number; chunk_min_id: number; chunk_max_id: number }[]> {
    return this.findLoopHospitalChunk(chunkSize, departmentId, roleId, undefined, undefined, transaction)
  }

  /** @deprecated Use findLoopPartTimeUsers + findLoopFormerWorkerUsers instead */
  async findPartTimeOrJobApplicantUsers(
    departmentId: number,
    startId: number,
    endId: number,
    roleId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<number[]> {
    const [partTimeIds, formerWorkerIds] = await Promise.all([
      this.findLoopPartTimeUsers(departmentId, startId, endId, roleId, undefined, undefined, transaction),
      this.findLoopFormerWorkerUsers(departmentId, startId, endId, roleId, undefined, undefined, transaction),
    ])
    return Array.from(new Set([...partTimeIds, ...formerWorkerIds])).sort((a, b) => a - b)
  }

  /** @deprecated Migrate caller to use individual chunks for PartTime and FormerWorker */
  async findPartTimeOrJobApplicantUserChunk(
    chunkSize: number,
    departmentId: number,
    roleId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<{ chunk_no: number; chunk_min_id: number; chunk_max_id: number }[]> {
    const combinedQuery = Prisma.sql`
      SELECT DISTINCT(u.id), ROW_NUMBER() OVER (ORDER BY u.id ASC) AS rn
      FROM users AS u
      JOIN user_employments AS ue ON ue.user_id = u.id
      WHERE u.status_id = 1
        AND ue.is_active = TRUE
        AND ue.department_id = ${departmentId}
        AND (ue.is_part_time = TRUE OR ue.is_job_applicant = TRUE)
        ${this.roleFilterSql(roleId)}
      ORDER BY u.id
    `
    return this.executeChunkQuery(chunkSize, combinedQuery, transaction)
  }

  /** @deprecated Use findLoopSystemUsers instead */
  async findMatchedCriteriaUsers(
    departmentId: number,
    criteria: {
      roleId?: number
      certificationIds?: number[]
      experience?: ExperienceRange
    },
    startId: number,
    endId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<number[]> {
    return this.findLoopSystemUsers(departmentId, criteria, startId, endId, transaction)
  }

  /** @deprecated Use findLoopSystemChunk instead */
  async findMatchedCriteriaUserChunk(
    chunkSize: number,
    departmentId: number,
    criteria: {
      roleId?: number
      certificationIds?: number[]
      experienceYears?: number
    },
    transaction: Transaction = this.prismaService,
  ): Promise<{ chunk_no: number; chunk_min_id: number; chunk_max_id: number }[]> {
    return this.findLoopSystemChunk(chunkSize, departmentId, criteria, transaction)
  }

  // ─── Count helpers ──────────────────────────────────────────

  async countLoopHospitalUsers(
    departmentId: number,
    roleId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<number> {
    const results = await transaction.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM (
        ${this.employmentLoopUserQuery(departmentId, false, false, roleId)}
      ) as subquery
    `
    return results.length > 0 ? Number(results[0].count) : 0
  }

  async countLoopPartTimeUsers(
    departmentId: number,
    roleId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<number> {
    const results = await transaction.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM (
        ${this.employmentLoopUserQuery(departmentId, true, false, roleId)}
      ) as subquery
    `
    return results.length > 0 ? Number(results[0].count) : 0
  }

  async countLoopFormerWorkerUsers(
    departmentId: number,
    roleId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<number> {
    const results = await transaction.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM (
        ${this.employmentLoopUserQuery(departmentId, false, true, roleId)}
      ) as subquery
    `
    return results.length > 0 ? Number(results[0].count) : 0
  }

  /** @deprecated Use countLoopHospitalUsers instead */
  async countDepartmentEmploymentUsers(
    departmentId: number,
    roleId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<number> {
    return this.countLoopHospitalUsers(departmentId, roleId, transaction)
  }

  /** @deprecated Use countLoopPartTimeUsers + countLoopFormerWorkerUsers instead */
  async countPartTimeOrJobApplicantUsers(
    departmentId: number,
    roleId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<number> {
    const [partTime, formerWorker] = await Promise.all([
      this.countLoopPartTimeUsers(departmentId, roleId, transaction),
      this.countLoopFormerWorkerUsers(departmentId, roleId, transaction),
    ])
    return partTime + formerWorker
  }

  // ─── User Rematch helpers ─────────────────────────────────────

  async findUserCriteriaForRematch(
    userId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<UserRematchCriteria> {
    const [roles, [exp], certifications] = await Promise.all([
      transaction.$queryRaw<{ role_id: number }[]>`
        SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = ${userId}
      `,
      transaction.$queryRaw<{ total: number }[]>`
        SELECT COALESCE(SUM(ux.experience_years + ux.experience_months / 12.0), 0) AS total
        FROM user_experience ux WHERE ux.user_id = ${userId}
      `,
      transaction.$queryRaw<{ certification_id: number }[]>`
        SELECT uc.certification_id FROM user_certifications uc
        WHERE uc.user_id = ${userId} AND uc.is_active = 1
      `,
    ])
    return {
      roleIds: roles.map((r) => Number(r.role_id)),
      totalExperienceYears: Number(exp?.total ?? 0),
      certificationIds: certifications.map((c) => Number(c.certification_id)),
    }
  }

  async findActiveEmploymentsByUserId(
    userId: number,
    transaction: Transaction = this.prismaService,
  ): Promise<{ department_id: number; is_part_time: boolean; is_job_applicant: boolean }[]> {
    const results = await transaction.$queryRaw<
      { department_id: number; is_part_time: boolean; is_job_applicant: boolean }[]
    >`
      SELECT ue.department_id, ue.is_part_time, ue.is_job_applicant
      FROM user_employments ue
      WHERE ue.user_id = ${userId}
        AND ue.is_active = TRUE
    `
    return results.map((row) => ({
      department_id: Number(row.department_id),
      is_part_time: Boolean(row.is_part_time),
      is_job_applicant: Boolean(row.is_job_applicant),
    }))
  }
}

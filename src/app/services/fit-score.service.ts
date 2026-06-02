import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CustomLogger } from 'nestjs-custom-module'
import { PrismaService } from '../../modules/prisma.module'
import { ApplicantStatus } from '../domains/applicant-status.domain'

// Certification name fragments used to identify CT-2 / CT-3 certs in master data
const ACLS_PALS_NAME_FRAGMENTS = ['ACLS', 'PALS']
const HA_JCI_NAME_FRAGMENTS = ['HA', 'JCI']

const FITSCORE_PHASE1_MAX = 83

@Injectable()
export class FitScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customLogger: CustomLogger,
  ) {}

  // ─── Public entry points ────────────────────────────────────────

  async calculate(userId: number, jobId: number): Promise<number> {
    const [profile, workEntries, userCerts, jobSpecialties, jobUnits, departmentId] = await Promise.all([
      this.fetchProfile(userId),
      this.fetchWorkEntries(userId),
      this.fetchUserCertifications(userId),
      this.fetchJobSpecialties(jobId),
      this.fetchJobUnits(jobId),
      this.fetchJobDepartmentId(jobId),
    ])

    const applyHistory = await this.fetchApplyHistory(userId)

    const cb1 = this.scoreCB1(profile.totalExperienceYears)
    const cb2 = this.scoreCB2(userCerts.specialtyCertIds, jobSpecialties)
    const cb3 = this.scoreCB3(workEntries)
    const ct1 = this.scoreCT1(userCerts.specialtyCertIds, userCerts.aclsPalsIds, userCerts.haJciIds)
    const ct2 = this.scoreCT2(userCerts.aclsPalsIds)
    const ct3 = this.scoreCT3(userCerts.haJciIds)
    const wc1 = this.scoreWC1(workEntries)
    const wc2 = this.scoreWC2(workEntries)
    const oe2 = this.scoreOE2(workEntries, jobUnits)
    const ts1 = this.scoreTS1(applyHistory, departmentId)

    const raw = cb1 + cb2 + cb3 + ct1 + ct2 + ct3 + wc1 + wc2 + oe2 + ts1
    const fitScore = Math.round((raw / FITSCORE_PHASE1_MAX) * 10000) / 100

    this.customLogger.log(
      `fit-score breakdown userId=${userId} jobId=${jobId} ` +
        `CB1=${cb1} CB2=${cb2} CB3=${cb3} CT1=${ct1} CT2=${ct2} CT3=${ct3} ` +
        `WC1=${wc1} WC2=${wc2} OE2=${oe2} TS1=${ts1} ` +
        `raw=${raw}/${FITSCORE_PHASE1_MAX} fitScore=${fitScore}`,
    )

    return fitScore
  }

  async calculateAndSave(userId: number, jobId: number): Promise<void> {
    const score = await this.calculate(userId, jobId)
    await this.prisma.job_matched_users.updateMany({
      where: { job_id: jobId, user_id: userId },
      data: { fit_score: new Prisma.Decimal(score) },
    })
  }

  // ─── Data fetchers ──────────────────────────────────────────────

  private async fetchProfile(userId: number): Promise<{ totalExperienceYears: number }> {
    const [row] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(ux.experience_years + ux.experience_months / 12.0), 0) AS total
      FROM user_experience ux
      WHERE ux.user_id = ${userId}
    `
    return { totalExperienceYears: Number(row?.total ?? 0) }
  }

  private async fetchWorkEntries(
    userId: number,
  ): Promise<
    {
      occupation_name: string | null
      occupation_place: string | null
      category_master_id: number | null
      sub_category_master_id: number | null
      experience_years: number
      experience_months: number
    }[]
  > {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        ux.occupation_name,
        ux.occupation_place,
        ux.category_master_id,
        ux.sub_category_master_id,
        ux.experience_years,
        ux.experience_months
      FROM user_experience ux
      WHERE ux.user_id = ${userId}
    `
    return rows.map((r) => ({
      occupation_name: r.occupation_name ?? null,
      occupation_place: r.occupation_place ?? null,
      category_master_id: r.category_master_id != null ? Number(r.category_master_id) : null,
      sub_category_master_id: r.sub_category_master_id != null ? Number(r.sub_category_master_id) : null,
      experience_years: Number(r.experience_years ?? 0),
      experience_months: Number(r.experience_months ?? 0),
    }))
  }

  private async fetchUserCertifications(userId: number): Promise<{
    specialtyCertIds: number[]
    aclsPalsIds: number[]
    haJciIds: number[]
  }> {
    const rows = await this.prisma.$queryRaw<
      { certification_id: number; name_en: string }[]
    >`
      SELECT uc.certification_id, c.name_en
      FROM user_certifications uc
      JOIN certifications c ON c.id = uc.certification_id
      WHERE uc.user_id = ${userId}
        AND uc.is_active = 1
    `

    const specialtyCertIds: number[] = []
    const aclsPalsIds: number[] = []
    const haJciIds: number[] = []

    for (const row of rows) {
      const certId = Number(row.certification_id)
      const nameEn = (row.name_en ?? '').toUpperCase()

      specialtyCertIds.push(certId)

      if (ACLS_PALS_NAME_FRAGMENTS.some((f) => nameEn.includes(f))) aclsPalsIds.push(certId)
      else if (HA_JCI_NAME_FRAGMENTS.some((f) => nameEn.includes(f))) haJciIds.push(certId)
    }

    return { specialtyCertIds, aclsPalsIds, haJciIds }
  }

  private async fetchJobSpecialties(jobId: number): Promise<number[]> {
    const rows = await this.prisma.$queryRaw<{ certification_id: number }[]>`
      SELECT js.certification_id FROM job_specialties js WHERE js.job_id = ${jobId}
    `
    return rows.map((r) => Number(r.certification_id))
  }

  private async fetchJobUnits(jobId: number): Promise<{ category_master_id: number; sub_category_master_id: number | null }[]> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT ju.category_master_id, ju.sub_category_master_id
      FROM job_units ju
      WHERE ju.job_id = ${jobId}
    `
    return rows.map((r) => ({
      category_master_id: Number(r.category_master_id),
      sub_category_master_id: r.sub_category_master_id != null ? Number(r.sub_category_master_id) : null,
    }))
  }

  private async fetchJobDepartmentId(jobId: number): Promise<number | null> {
    const [row] = await this.prisma.$queryRaw<{ required_department_id: number | null }[]>`
      SELECT j.required_department_id FROM jobs j WHERE j.id = ${jobId}
    `
    return row?.required_department_id != null ? Number(row.required_department_id) : null
  }

  private async fetchApplyHistory(
    userId: number,
  ): Promise<{ job_id: number; status_id: number; department_id: number | null; withdraw_date: Date | null }[]> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT ja.job_id, ja.status_id, j.required_department_id AS department_id, ja.withdraw_date
      FROM job_applies ja
      JOIN jobs j ON j.id = ja.job_id
      WHERE ja.user_id = ${userId}
        AND ja.status_id IN (${ApplicantStatus.hired}, ${ApplicantStatus.rejected})
    `
    return rows.map((r) => ({
      job_id: Number(r.job_id),
      status_id: Number(r.status_id),
      department_id: r.department_id != null ? Number(r.department_id) : null,
      withdraw_date: r.withdraw_date ?? null,
    }))
  }

  // ─── Scoring methods ────────────────────────────────────────────

  private scoreCB1(totalYears: number): number {
    if (totalYears >= 10) return 15
    if (totalYears >= 6) return 13
    if (totalYears >= 3) return 10
    if (totalYears >= 1) return 5
    return 0
  }

  private scoreCB2(userSpecialtyCertIds: number[], jobSpecialtyCertIds: number[]): number {
    if (jobSpecialtyCertIds.length === 0) return 0
    const userSet = new Set(userSpecialtyCertIds)
    const matches = jobSpecialtyCertIds.some((id) => userSet.has(id))
    return matches ? 13 : 0
  }

  // CB-3: best-entry completeness from 5 available fields
  // (spec defines 6 fields; only 5 are present in user_experience — treats all-5-filled as complete)
  private scoreCB3(
    workEntries: {
      occupation_name: string | null
      occupation_place: string | null
      category_master_id: number | null
      sub_category_master_id: number | null
      experience_years: number
      experience_months: number
    }[],
  ): number {
    if (workEntries.length === 0) return 0
    let best = 0
    for (const entry of workEntries) {
      let filled = 0
      if (entry.occupation_name) filled++
      if (entry.occupation_place) filled++
      if (entry.category_master_id != null) filled++
      if (entry.experience_years > 0 || entry.experience_months > 0) filled++
      if (entry.sub_category_master_id != null) filled++
      // 5 available fields: 5→12, 3-4→6, <3→0
      const score = filled >= 5 ? 12 : filled >= 3 ? 6 : 0
      if (score > best) best = score
    }
    return best
  }

  // CT-1: count specialty certs that are NOT ACLS/PALS/HA/JCI
  private scoreCT1(specialtyCertIds: number[], aclsPalsIds: number[], haJciIds: number[]): number {
    const exclude = new Set([...aclsPalsIds, ...haJciIds])
    const count = specialtyCertIds.filter((id) => !exclude.has(id)).length
    if (count >= 4) return 8
    if (count >= 2) return 5
    if (count === 1) return 3
    return 0
  }

  private scoreCT2(aclsPalsIds: number[]): number {
    return aclsPalsIds.length > 0 ? 5 : 0
  }

  private scoreCT3(haJciIds: number[]): number {
    return haJciIds.length > 0 ? 2 : 0
  }

  // WC-1: longest tenure in years
  private scoreWC1(
    workEntries: { experience_years: number; experience_months: number }[],
  ): number {
    if (workEntries.length === 0) return 0
    const maxYears = Math.max(...workEntries.map((e) => e.experience_years + e.experience_months / 12))
    if (maxYears >= 5) return 8
    if (maxYears >= 2) return 6
    if (maxYears >= 1) return 3
    return 0
  }

  // WC-2: employer count (number of work entries) — 0 entries = no data = 0 (BR-FS-001)
  private scoreWC2(workEntries: unknown[]): number {
    const count = workEntries.length
    if (count === 0) return 0
    if (count <= 2) return 5
    if (count <= 4) return 3
    return 0
  }

  // OE-2: proportional unit match (best entry vs job required units)
  private scoreOE2(
    workEntries: { category_master_id: number | null }[],
    jobUnits: { category_master_id: number }[],
  ): number {
    if (jobUnits.length === 0) return 0
    const required = jobUnits.map((u) => u.category_master_id)
    const requiredCount = required.length

    let bestRatio = 0
    for (const entry of workEntries) {
      if (entry.category_master_id == null) continue
      const matchCount = required.filter((r) => r === entry.category_master_id).length
      const ratio = matchCount / requiredCount
      if (ratio > bestRatio) bestRatio = ratio
    }

    if (bestRatio >= 1.0) return 5
    if (bestRatio > 0.5) return 3
    if (bestRatio > 0) return 2
    return 0
  }

  // TS-1: re-hire rate with 3-tier fallback (BR-FS-009: withdrawn = withdraw_date != null → excluded)
  private scoreTS1(
    applyHistory: { status_id: number; department_id: number | null; withdraw_date: Date | null }[],
    departmentId: number | null,
  ): number {
    const nonWithdrawn = applyHistory.filter((a) => a.withdraw_date == null)

    // Tier 1: dept history ≥ 3
    const deptApps = departmentId != null ? nonWithdrawn.filter((a) => a.department_id === departmentId) : []
    if (deptApps.length >= 3) {
      const rate = deptApps.filter((a) => a.status_id === ApplicantStatus.hired).length / deptApps.length
      return this.mapRehireRateToScore(rate)
    }

    // Tier 2: overall ≥ 3
    if (nonWithdrawn.length >= 3) {
      const rate = nonWithdrawn.filter((a) => a.status_id === ApplicantStatus.hired).length / nonWithdrawn.length
      return this.mapRehireRateToScore(rate)
    }

    // Tier 3: no history
    return 0
  }

  private mapRehireRateToScore(rate: number): number {
    if (rate >= 0.8) return 10
    if (rate >= 0.6) return 7
    if (rate >= 0.4) return 5
    return 2
  }
}

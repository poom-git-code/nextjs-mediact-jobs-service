import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FitScoreService } from '../../../src/app/services/fit-score.service'
import { PrismaService } from '../../../src/modules/prisma.module'
import { CustomLogger } from 'nestjs-custom-module'
import { ApplicantStatus } from '../../../src/app/domains/applicant-status.domain'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePrismaMock(): PrismaService {
  return {
    $queryRaw: vi.fn(),
    job_matched_users: { updateMany: vi.fn() },
  } as unknown as PrismaService
}

function makeCustomLoggerMock() {
  return {
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as CustomLogger
}

/**
 * Seeds all 7 $queryRaw calls for calculate() in the order they are made:
 *   1. fetchProfile           (Promise.all slot 0)
 *   2. fetchWorkEntries       (Promise.all slot 1)
 *   3. fetchUserCertifications (Promise.all slot 2)
 *   4. fetchJobSpecialties    (Promise.all slot 3)
 *   5. fetchJobUnits          (Promise.all slot 4)
 *   6. fetchJobDepartmentId   (Promise.all slot 5)
 *   7. fetchApplyHistory      (sequential, after Promise.all)
 *
 * Unspecified fields default to empty/zero so a single component can be tested in isolation.
 */
function seedCalculateMocks(
  mock: ReturnType<typeof vi.fn>,
  {
    profile = [{ total: 0 }],
    workEntries = [],
    userCerts = [],
    jobSpecialties = [],
    jobUnits = [],
    departmentRow = [{ required_department_id: null }] as [{ required_department_id: number | null }],
    applyHistory = [],
  }: {
    profile?: [{ total: number }]
    workEntries?: any[]
    userCerts?: any[]
    jobSpecialties?: any[]
    jobUnits?: any[]
    departmentRow?: [{ required_department_id: number | null }]
    applyHistory?: any[]
  } = {},
) {
  mock
    .mockResolvedValueOnce(profile)
    .mockResolvedValueOnce(workEntries)
    .mockResolvedValueOnce(userCerts)
    .mockResolvedValueOnce(jobSpecialties)
    .mockResolvedValueOnce(jobUnits)
    .mockResolvedValueOnce(departmentRow)
    .mockResolvedValueOnce(applyHistory)
}

/** Convert raw points to expected FitScore % (matches service formula) */
const pct = (raw: number) => Math.round((raw / 83) * 10000) / 100

/** Minimal complete work entry: all 5 fields filled → CB-3=12, WC-1 depends on experience */
const fullEntry = (overrides: Partial<{
  occupation_name: string | null
  occupation_place: string | null
  category_master_id: number | null
  sub_category_master_id: number | null
  experience_years: number
  experience_months: number
}> = {}) => ({
  occupation_name: 'RN',
  occupation_place: 'Hospital A',
  category_master_id: 1,
  sub_category_master_id: 2,
  experience_years: 5,
  experience_months: 0,
  ...overrides,
})

/** Sparse entry: 3 fields filled (name + place + category), 0yr exp — CB-3=6, WC-1=0 */
const sparseEntry = (category_master_id = 1) => ({
  occupation_name: 'RN',
  occupation_place: 'Hospital A',
  category_master_id,
  sub_category_master_id: null,
  experience_years: 0,
  experience_months: 0,
})

const specialtyCert = (id: number, name: string) => ({
  certification_id: id,
  name_en: name,
  certification_type: 'specialty',
})

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('FitScoreService', () => {
  let service: FitScoreService
  let prismaMock: PrismaService
  let queryRaw: ReturnType<typeof vi.fn>

  beforeEach(() => {
    prismaMock = makePrismaMock()
    const customLoggerMock = makeCustomLoggerMock()
    service = new FitScoreService(prismaMock, customLoggerMock)
    queryRaw = prismaMock.$queryRaw as ReturnType<typeof vi.fn>
  })

  // ─── Integration scenarios ─────────────────────────────────────────────────

  describe('calculate() — integration', () => {
    it('AC-MATCH-001: high-score profile → FitScore in [75, 100]', async () => {
      // CB-1=10 + CB-2=13 + CB-3=12 + CT-1=3 + CT-2=5 + CT-3=2 + WC-1=8 + WC-2=5 + OE-2=5 + TS-1=10 = 73 → 87.95%
      seedCalculateMocks(queryRaw, {
        profile: [{ total: 5 }],
        workEntries: [fullEntry()],
        userCerts: [
          specialtyCert(100, 'ICU Specialty'),
          specialtyCert(200, 'ACLS Certification'),
          specialtyCert(300, 'HA Accreditation'),
        ],
        jobSpecialties: [{ certification_id: 100 }],
        jobUnits: [{ category_master_id: 1, sub_category_master_id: null }],
        departmentRow: [{ required_department_id: 5 }],
        applyHistory: [
          { job_id: 1, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
          { job_id: 2, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
          { job_id: 3, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
          { job_id: 4, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
          { job_id: 5, status_id: ApplicantStatus.rejected, department_id: 5, withdraw_date: null },
        ],
      })
      const score = await service.calculate(1, 10)
      expect(score).toBeGreaterThanOrEqual(75)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('AC-MATCH-002: score=0 when user has zero experience and no certs', async () => {
      seedCalculateMocks(queryRaw)
      expect(await service.calculate(1, 10)).toBe(0)
    })

    it('score=100 when all criteria are at maximum thresholds (raw=83/83)', async () => {
      // CB-1=15 + CB-2=13 + CB-3=12 + CT-1=8 + CT-2=5 + CT-3=2 + WC-1=8 + WC-2=5 + OE-2=5 + TS-1=10 = 83
      seedCalculateMocks(queryRaw, {
        profile: [{ total: 10 }],
        workEntries: [
          fullEntry({ experience_years: 5 }),
          fullEntry({ experience_years: 5, occupation_place: 'Hospital B', sub_category_master_id: 3 }),
        ],
        userCerts: [
          specialtyCert(100, 'ICU Specialty'),
          specialtyCert(101, 'CCU Specialty'),
          specialtyCert(102, 'NICU Specialty'),
          specialtyCert(103, 'PICU Specialty'),
          specialtyCert(200, 'ACLS Training'),
          specialtyCert(300, 'HA Certification'),
        ],
        jobSpecialties: [{ certification_id: 100 }],
        jobUnits: [{ category_master_id: 1, sub_category_master_id: null }],
        departmentRow: [{ required_department_id: 5 }],
        applyHistory: [
          { job_id: 1, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
          { job_id: 2, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
          { job_id: 3, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
        ],
      })
      expect(await service.calculate(1, 10)).toBe(100)
    })
  })

  // ─── CB-1: Total experience years ──────────────────────────────────────────

  describe('CB-1 (total experience years)', () => {
    it.each([
      { years: 0,   pts: 0,  label: 'exp=0 → 0 pts (edge case)' },
      { years: 0.5, pts: 0,  label: '<1 yr → 0 pts' },
      { years: 1,   pts: 5,  label: '1 yr → 5 pts' },
      { years: 2,   pts: 5,  label: '2 yr → 5 pts' },
      { years: 3,   pts: 10, label: '3 yr → 10 pts' },
      { years: 5.9, pts: 10, label: 'just under 6 yr → 10 pts' },
      { years: 6,   pts: 13, label: '6 yr → 13 pts' },
      { years: 9,   pts: 13, label: '9 yr → 13 pts' },
      { years: 10,  pts: 15, label: '10 yr → 15 pts' },
      { years: 20,  pts: 15, label: '20 yr → 15 pts (cap)' },
    ])('$label', async ({ years, pts }) => {
      seedCalculateMocks(queryRaw, { profile: [{ total: years }] })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(pts), 1)
    })
  })

  // ─── CB-2: Specialty certification match ────────────────────────────────────

  describe('CB-2 (specialty certification match)', () => {
    it('no specialty required by job → CB-2 = 0 (CT-1=3 from specialty cert still scores)', async () => {
      seedCalculateMocks(queryRaw, {
        userCerts: [specialtyCert(100, 'ICU Specialty')],
        jobSpecialties: [],
      })
      // CB-2=0 (no job specialty), CT-1=3 (1 non-ACLS/HA specialty cert)
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(0 + 3), 1)
    })

    it('AC-MATCH-003: user specialty matches job requirement → CB-2 = 13 pts', async () => {
      seedCalculateMocks(queryRaw, {
        userCerts: [specialtyCert(100, 'ICU Specialty')],
        jobSpecialties: [{ certification_id: 100 }],
      })
      // CB-2=13 + CT-1=3 (same cert counts for CT-1 since it's non-ACLS/HA specialty)
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(13 + 3), 1)
    })

    it('AC-MATCH-004: cert=[] and job requires specialty → CB-2 = 0', async () => {
      seedCalculateMocks(queryRaw, {
        userCerts: [],
        jobSpecialties: [{ certification_id: 100 }],
      })
      expect(await service.calculate(1, 10)).toBe(0)
    })

    it('role mismatch: user has different specialty cert → CB-2 = 0 (CT-1=3 still scored)', async () => {
      seedCalculateMocks(queryRaw, {
        userCerts: [specialtyCert(999, 'Other Specialty')],
        jobSpecialties: [{ certification_id: 100 }],
      })
      // CB-2=0 (no id=100 match), CT-1=3 (user has 1 specialty cert, non-ACLS/HA)
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(0 + 3), 1)
    })

    it('cert partial match: job needs 2 certs, user has 1 matching → CB-2 = 13 (ANY cert match counts)', async () => {
      seedCalculateMocks(queryRaw, {
        userCerts: [specialtyCert(100, 'ICU Specialty')],
        jobSpecialties: [{ certification_id: 100 }, { certification_id: 200 }],
      })
      // CB-2=13 + CT-1=3
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(13 + 3), 1)
    })
  })

  // ─── CB-3: Work entry completeness ──────────────────────────────────────────

  describe('CB-3 (work entry completeness)', () => {
    it('no work entries → CB-3 = 0', async () => {
      seedCalculateMocks(queryRaw, { workEntries: [] })
      expect(await service.calculate(1, 10)).toBe(0)
    })

    it('<3 fields filled → CB-3 = 0 (WC-2 = 5 because 1 employer still counted)', async () => {
      // CB-3 scores entry completeness; WC-2 scores employer count independently.
      // 1 entry with only occupation_name: CB-3=0, but WC-2=5 (1 employer ≤ 2).
      seedCalculateMocks(queryRaw, {
        workEntries: [{ occupation_name: 'RN', occupation_place: null, category_master_id: null, sub_category_master_id: null, experience_years: 0, experience_months: 0 }],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(0 + 5), 1) // CB-3=0, WC-2=5
    })

    it('3 fields filled → CB-3 = 6 pts', async () => {
      seedCalculateMocks(queryRaw, { workEntries: [sparseEntry()] })
      // CB-3=6, WC-2=5 (1 employer), WC-1=0
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 5), 1)
    })

    it('all 5 fields filled → CB-3 = 12 pts', async () => {
      seedCalculateMocks(queryRaw, { workEntries: [fullEntry()] })
      // CB-3=12, WC-1=8 (5yr), WC-2=5
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(12 + 8 + 5), 1)
    })

    it('uses best-entry score across multiple work entries', async () => {
      seedCalculateMocks(queryRaw, {
        workEntries: [
          { occupation_name: 'RN', occupation_place: null, category_master_id: null, sub_category_master_id: null, experience_years: 0, experience_months: 0 },
          fullEntry(),
        ],
      })
      // Best = fullEntry → CB-3=12; 2 entries → WC-2=5; WC-1=8
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(12 + 8 + 5), 1)
    })
  })

  // ─── CT-1: Specialty cert count (excluding ACLS/PALS/HA/JCI) ───────────────

  describe('CT-1 (specialty cert count, excluding ACLS/PALS/HA/JCI)', () => {
    it('cert=[] → CT-1 = 0', async () => {
      seedCalculateMocks(queryRaw, { userCerts: [] })
      expect(await service.calculate(1, 10)).toBe(0)
    })

    it('1 non-excluded specialty cert → CT-1 = 3 pts', async () => {
      seedCalculateMocks(queryRaw, { userCerts: [specialtyCert(100, 'ICU Specialty')] })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(3), 1)
    })

    it('2 non-excluded specialty certs → CT-1 = 5 pts', async () => {
      seedCalculateMocks(queryRaw, {
        userCerts: [specialtyCert(100, 'ICU Specialty'), specialtyCert(101, 'CCU Specialty')],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(5), 1)
    })

    it('4+ non-excluded specialty certs → CT-1 = 8 pts', async () => {
      seedCalculateMocks(queryRaw, {
        userCerts: [
          specialtyCert(100, 'ICU Specialty'),
          specialtyCert(101, 'CCU Specialty'),
          specialtyCert(102, 'NICU Specialty'),
          specialtyCert(103, 'PICU Specialty'),
        ],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(8), 1)
    })

    it('ACLS cert (specialty type) excluded from CT-1; counts for CT-2 instead', async () => {
      seedCalculateMocks(queryRaw, { userCerts: [specialtyCert(200, 'ACLS Training')] })
      // CT-1=0, CT-2=5
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(5), 1)
    })
  })

  // ─── CT-2: ACLS / PALS ──────────────────────────────────────────────────────

  describe('CT-2 (ACLS/PALS certification)', () => {
    it('no ACLS/PALS cert → CT-2 = 0', async () => {
      seedCalculateMocks(queryRaw)
      expect(await service.calculate(1, 10)).toBe(0)
    })

    it('has ACLS cert → CT-2 = 5 pts', async () => {
      seedCalculateMocks(queryRaw, {
        userCerts: [{ certification_id: 200, name_en: 'ACLS Certification', certification_type: null }],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(5), 1)
    })

    it('has PALS cert → CT-2 = 5 pts', async () => {
      seedCalculateMocks(queryRaw, {
        userCerts: [{ certification_id: 201, name_en: 'PALS Provider Course', certification_type: null }],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(5), 1)
    })
  })

  // ─── CT-3: HA / JCI ─────────────────────────────────────────────────────────

  describe('CT-3 (HA/JCI certification)', () => {
    it('no HA/JCI cert → CT-3 = 0', async () => {
      seedCalculateMocks(queryRaw)
      expect(await service.calculate(1, 10)).toBe(0)
    })

    it('has HA cert → CT-3 = 2 pts', async () => {
      seedCalculateMocks(queryRaw, {
        userCerts: [{ certification_id: 300, name_en: 'HA Hospital Accreditation', certification_type: null }],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(2), 1)
    })

    it('has JCI cert → CT-3 = 2 pts', async () => {
      seedCalculateMocks(queryRaw, {
        userCerts: [{ certification_id: 301, name_en: 'JCI Accreditation', certification_type: null }],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(2), 1)
    })
  })

  // ─── WC-1: Longest single-employer tenure ────────────────────────────────────

  describe('WC-1 (longest employer tenure)', () => {
    // Isolated: single entry with 3 filled fields (CB-3=6, WC-2=5, OE-2=0)
    // raw = wc1_pts + CB-3(6) + WC-2(5)
    it.each([
      { years: 0,  months: 0,  wc1: 0, label: 'exp=0 → 0 pts (edge case)' },
      { years: 0,  months: 6,  wc1: 0, label: '6 mo → 0 pts' },
      { years: 1,  months: 0,  wc1: 3, label: '1 yr → 3 pts' },
      { years: 1,  months: 6,  wc1: 3, label: '1.5 yr → 3 pts' },
      { years: 2,  months: 0,  wc1: 6, label: '2 yr → 6 pts' },
      { years: 4,  months: 11, wc1: 6, label: '4 yr 11 mo → 6 pts' },
      { years: 5,  months: 0,  wc1: 8, label: '5 yr → 8 pts' },
      { years: 10, months: 0,  wc1: 8, label: '10 yr → 8 pts (cap)' },
    ])('$label', async ({ years, months, wc1 }) => {
      seedCalculateMocks(queryRaw, {
        workEntries: [{
          occupation_name: 'RN',
          occupation_place: 'Hospital A',
          category_master_id: 1,
          sub_category_master_id: null,
          experience_years: years,
          experience_months: months,
        }],
      })
      // CB-3: name + place + category + (years>0||months>0) — either 3 or 4 fields, both → 6 pts
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(wc1 + 6 + 5), 1)
    })
  })

  // ─── WC-2: Number of employers ────────────────────────────────────────────────

  describe('WC-2 (employer count)', () => {
    const e = sparseEntry() // CB-3=6, WC-1=0

    it('0 employers → WC-2 = 0 (BR-FS-001: missing data = 0 pts, not redistributed)', async () => {
      seedCalculateMocks(queryRaw, { workEntries: [] })
      expect(await service.calculate(1, 10)).toBe(0)
    })

    it('1 employer → WC-2 = 5 pts', async () => {
      seedCalculateMocks(queryRaw, { workEntries: [e] })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 0 + 5), 1)
    })

    it('2 employers → WC-2 = 5 pts', async () => {
      seedCalculateMocks(queryRaw, { workEntries: [e, e] })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 0 + 5), 1)
    })

    it('3 employers → WC-2 = 3 pts', async () => {
      seedCalculateMocks(queryRaw, { workEntries: [e, e, e] })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 0 + 3), 1)
    })

    it('4 employers → WC-2 = 3 pts', async () => {
      seedCalculateMocks(queryRaw, { workEntries: [e, e, e, e] })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 0 + 3), 1)
    })

    it('5+ employers → WC-2 = 0 pts', async () => {
      seedCalculateMocks(queryRaw, { workEntries: [e, e, e, e, e] })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 0 + 0), 1)
    })
  })

  // ─── OE-2: Ward / unit match ─────────────────────────────────────────────────

  describe('OE-2 (ward/unit match)', () => {
    it('no job units required → OE-2 = 0', async () => {
      seedCalculateMocks(queryRaw, {
        workEntries: [sparseEntry(1)],
        jobUnits: [],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 5 + 0), 1)
    })

    it('100% unit match (ratio=1.0) → OE-2 = 5 pts', async () => {
      seedCalculateMocks(queryRaw, {
        workEntries: [sparseEntry(1)],
        jobUnits: [{ category_master_id: 1 }],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 5 + 5), 1)
    })

    it('>50% match (2/3 units) → OE-2 = 3 pts', async () => {
      // jobUnits=[1,1,2]; user category=1 → matchCount=2, ratio=0.67 > 0.5
      seedCalculateMocks(queryRaw, {
        workEntries: [sparseEntry(1)],
        jobUnits: [{ category_master_id: 1 }, { category_master_id: 1 }, { category_master_id: 2 }],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 5 + 3), 1)
    })

    it('exactly 50% match (1/2 units) → OE-2 = 2 pts (not strictly >0.5)', async () => {
      seedCalculateMocks(queryRaw, {
        workEntries: [sparseEntry(1)],
        jobUnits: [{ category_master_id: 1 }, { category_master_id: 2 }],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 5 + 2), 1)
    })

    it('>0% but <50% match (1/3 units) → OE-2 = 2 pts', async () => {
      seedCalculateMocks(queryRaw, {
        workEntries: [sparseEntry(1)],
        jobUnits: [{ category_master_id: 1 }, { category_master_id: 2 }, { category_master_id: 3 }],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 5 + 2), 1)
    })

    it('0% match (different category) → OE-2 = 0', async () => {
      seedCalculateMocks(queryRaw, {
        workEntries: [sparseEntry(99)],
        jobUnits: [{ category_master_id: 1 }],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(6 + 5 + 0), 1)
    })

    it('work entry has null category_master_id → excluded from OE-2', async () => {
      seedCalculateMocks(queryRaw, {
        workEntries: [{ ...sparseEntry(), category_master_id: null }],
        jobUnits: [{ category_master_id: 1 }],
      })
      // category_master_id=null → field not counted → only 2 fields (name+place) → CB-3=0; WC-2=5; OE-2=0
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(0 + 5 + 0), 1)
    })
  })

  // ─── TS-1: Re-hire rate (3-tier fallback) ─────────────────────────────────────

  describe('TS-1 (re-hire rate)', () => {
    it('no apply history → TS-1 = 0', async () => {
      seedCalculateMocks(queryRaw, {
        departmentRow: [{ required_department_id: 5 }],
        applyHistory: [],
      })
      expect(await service.calculate(1, 10)).toBe(0)
    })

    describe('tier-1 (dept ≥ 3 applications)', () => {
      it('≥80% hired (4/5) → TS-1 = 10 pts', async () => {
        seedCalculateMocks(queryRaw, {
          departmentRow: [{ required_department_id: 5 }],
          applyHistory: [
            { job_id: 1, status_id: ApplicantStatus.hired,    department_id: 5, withdraw_date: null },
            { job_id: 2, status_id: ApplicantStatus.hired,    department_id: 5, withdraw_date: null },
            { job_id: 3, status_id: ApplicantStatus.hired,    department_id: 5, withdraw_date: null },
            { job_id: 4, status_id: ApplicantStatus.hired,    department_id: 5, withdraw_date: null },
            { job_id: 5, status_id: ApplicantStatus.rejected, department_id: 5, withdraw_date: null },
          ],
        })
        expect(await service.calculate(1, 10)).toBeCloseTo(pct(10), 1)
      })

      it('60%–79% hired (3/5) → TS-1 = 7 pts', async () => {
        seedCalculateMocks(queryRaw, {
          departmentRow: [{ required_department_id: 5 }],
          applyHistory: [
            { job_id: 1, status_id: ApplicantStatus.hired,    department_id: 5, withdraw_date: null },
            { job_id: 2, status_id: ApplicantStatus.hired,    department_id: 5, withdraw_date: null },
            { job_id: 3, status_id: ApplicantStatus.hired,    department_id: 5, withdraw_date: null },
            { job_id: 4, status_id: ApplicantStatus.rejected, department_id: 5, withdraw_date: null },
            { job_id: 5, status_id: ApplicantStatus.rejected, department_id: 5, withdraw_date: null },
          ],
        })
        expect(await service.calculate(1, 10)).toBeCloseTo(pct(7), 1)
      })

      it('40%–59% hired (2/5) → TS-1 = 5 pts', async () => {
        seedCalculateMocks(queryRaw, {
          departmentRow: [{ required_department_id: 5 }],
          applyHistory: [
            { job_id: 1, status_id: ApplicantStatus.hired,    department_id: 5, withdraw_date: null },
            { job_id: 2, status_id: ApplicantStatus.hired,    department_id: 5, withdraw_date: null },
            { job_id: 3, status_id: ApplicantStatus.rejected, department_id: 5, withdraw_date: null },
            { job_id: 4, status_id: ApplicantStatus.rejected, department_id: 5, withdraw_date: null },
            { job_id: 5, status_id: ApplicantStatus.rejected, department_id: 5, withdraw_date: null },
          ],
        })
        expect(await service.calculate(1, 10)).toBeCloseTo(pct(5), 1)
      })

      it('<40% hired (1/5) → TS-1 = 2 pts', async () => {
        seedCalculateMocks(queryRaw, {
          departmentRow: [{ required_department_id: 5 }],
          applyHistory: [
            { job_id: 1, status_id: ApplicantStatus.hired,    department_id: 5, withdraw_date: null },
            { job_id: 2, status_id: ApplicantStatus.rejected, department_id: 5, withdraw_date: null },
            { job_id: 3, status_id: ApplicantStatus.rejected, department_id: 5, withdraw_date: null },
            { job_id: 4, status_id: ApplicantStatus.rejected, department_id: 5, withdraw_date: null },
            { job_id: 5, status_id: ApplicantStatus.rejected, department_id: 5, withdraw_date: null },
          ],
        })
        expect(await service.calculate(1, 10)).toBeCloseTo(pct(2), 1)
      })
    })

    describe('tier-2 fallback (dept < 3, overall ≥ 3)', () => {
      it('AC-LOOP-004: falls back to overall rate when dept has < 3 apps', async () => {
        seedCalculateMocks(queryRaw, {
          departmentRow: [{ required_department_id: 99 }],
          // dept 99: 2 apps → < 3 → skip tier-1
          // overall: 4 apps, 3 hired → 75% → score=7
          applyHistory: [
            { job_id: 1, status_id: ApplicantStatus.hired,    department_id: 99, withdraw_date: null },
            { job_id: 2, status_id: ApplicantStatus.rejected, department_id: 99, withdraw_date: null },
            { job_id: 3, status_id: ApplicantStatus.hired,    department_id: 1,  withdraw_date: null },
            { job_id: 4, status_id: ApplicantStatus.hired,    department_id: 2,  withdraw_date: null },
          ],
        })
        expect(await service.calculate(1, 10)).toBeCloseTo(pct(7), 1)
      })
    })

    describe('tier-3 (no sufficient history → TS-1 = 0)', () => {
      it('only 2 overall non-withdrawn apps → tier-3 → TS-1 = 0', async () => {
        seedCalculateMocks(queryRaw, {
          departmentRow: [{ required_department_id: 5 }],
          applyHistory: [
            { job_id: 1, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
            { job_id: 2, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
          ],
        })
        expect(await service.calculate(1, 10)).toBe(0)
      })

      it('departmentId=null → dept pool empty, 2 overall → tier-3 → TS-1 = 0', async () => {
        seedCalculateMocks(queryRaw, {
          departmentRow: [{ required_department_id: null }],
          applyHistory: [
            { job_id: 1, status_id: ApplicantStatus.hired, department_id: null, withdraw_date: null },
            { job_id: 2, status_id: ApplicantStatus.hired, department_id: null, withdraw_date: null },
          ],
        })
        expect(await service.calculate(1, 10)).toBe(0)
      })
    })

    it('withdrawn apps excluded from TS-1 calculation (BR-FS-009)', async () => {
      seedCalculateMocks(queryRaw, {
        departmentRow: [{ required_department_id: 5 }],
        // fetch query (status IN hired/rejected) already excludes withdrawn rows —
        // only these 3 non-withdrawn arrive here → 3/3 hired = 100% → TS-1=10
        applyHistory: [
          { job_id: 1, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
          { job_id: 2, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
          { job_id: 3, status_id: ApplicantStatus.hired, department_id: 5, withdraw_date: null },
        ],
      })
      expect(await service.calculate(1, 10)).toBeCloseTo(pct(10), 1)
    })
  })

  // ─── calculateAndSave() — per-pair async consumer handler ───────────────────

  describe('calculateAndSave()', () => {
    it('calculates and writes fit_score for the given (userId, jobId) pair', async () => {
      const updateMany = (prismaMock as any).job_matched_users.updateMany as ReturnType<typeof vi.fn>
      updateMany.mockResolvedValue({ count: 1 })

      // calculate(): 3yr exp → CB-1=10 → raw=10 → pct(10)
      queryRaw
        .mockResolvedValueOnce([{ total: 3 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ required_department_id: null }]).mockResolvedValueOnce([])

      await service.calculateAndSave(42, 10)

      expect(updateMany).toHaveBeenCalledTimes(1)
      expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { job_id: 10, user_id: 42 } }))
      const updatedScore = Number((updateMany.mock.calls[0][0] as any).data.fit_score)
      expect(updatedScore).toBeCloseTo(pct(10), 1)
    })

    it('stores the correct fit_score value', async () => {
      const updateMany = (prismaMock as any).job_matched_users.updateMany as ReturnType<typeof vi.fn>
      updateMany.mockResolvedValue({ count: 1 })

      // 10yr exp → CB-1=15 → raw=15 → 15/83*100 ≈ 18.07
      queryRaw
        .mockResolvedValueOnce([{ total: 10 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ required_department_id: null }]).mockResolvedValueOnce([])

      await service.calculateAndSave(42, 10)

      const updatedScore = Number((updateMany.mock.calls[0][0] as any).data.fit_score)
      expect(updatedScore).toBeCloseTo(pct(15), 1)
    })
  })
})

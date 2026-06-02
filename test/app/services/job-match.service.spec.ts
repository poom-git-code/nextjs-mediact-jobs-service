import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JobMatchService } from '../../../src/app/services/job-match.service'
import { SqsService } from '@ssut/nestjs-sqs'
import { UserReadRepository } from '../../../src/app/repositories/user.repository'
import { JobMatchedUsersRepository } from '../../../src/app/repositories/job-matched-users.repository'
import { UserMatchSettingReadRepository } from '../../../src/app/repositories/user-match-setting.repository'
import { JobAutoMatchUserOffersRepository } from '../../../src/app/repositories/job-auto-match-user-offers.repository'
import { NotificationService } from '../../../src/app/external-services/notification.service'
import { PrismaService } from '../../../src/modules/prisma.module'
import { JobPublishGroup } from '@prisma/client'
import { Jobs } from '../../../src/app/repositories/models/job.model'
import { JobBatches } from '../../../src/app/repositories/models/job-batch.model'
import { JobMatch } from '../../../src/app/controllers/dto/consumer.dto'
import { UserMatchSettings } from '../../../src/app/repositories/models/user-match-setting.model'

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Jobs> = {}): Jobs {
  return {
    id: 10,
    required_department_id: 1,
    work_date: new Date('2026-04-29'), // Wednesday (day 3)
    required_role_id: 2,
    publish_group: JobPublishGroup.hospital,
    status_id: 2,
    ...overrides,
  } as unknown as Jobs
}

function makeBatch(publishGroup: JobPublishGroup, overrides: Partial<JobBatches> = {}): JobBatches {
  return {
    id: BigInt(1),
    job_id: BigInt(10),
    batch_no: 1,
    publish_group: publishGroup,
    criteria_snapshot: { roleId: 2, certificationIds: [], experience: null },
    start_id: BigInt(1),
    end_id: BigInt(100),
    status: 'pending',
    attempt_count: 0,
    last_error: null,
    created_at: new Date(),
    updated_at: new Date(),
    correlation_id: null,
    ...overrides,
  } as unknown as JobBatches
}

function makeInput(overrides: Partial<JobMatch> = {}): JobMatch {
  return {
    jobId: 10,
    batchId: 1,
    batchNumber: 1,
    normalNotificationId: 1001,
    autoMatchedNotificationId: 1002,
    correlationId: '00000000-0000-0000-0000-000000000001',
    ...overrides,
  } as unknown as JobMatch
}

function makeUserMatchSettings(userId: number, overrides: Partial<UserMatchSettings> = {}): UserMatchSettings {
  return {
    user_id: userId,
    auto_accept: false,
    is_monday: false,
    is_tuesday: false,
    is_wednesday: false,
    is_thursday: false,
    is_friday: false,
    is_saturday: false,
    is_sunday: false,
    ...overrides,
  } as UserMatchSettings
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeServiceMocks() {
  const prismaService = {} as PrismaService

  const userReadRepository = {
    findLoopHospitalUsers:    vi.fn().mockResolvedValue([]),
    findLoopPartTimeUsers:    vi.fn().mockResolvedValue([]),
    findLoopFormerWorkerUsers: vi.fn().mockResolvedValue([]),
    findMatchedCriteriaUsers: vi.fn().mockResolvedValue([]),
  } as unknown as UserReadRepository

  const jobMatchedUsersRepository = {
    createMany: vi.fn().mockResolvedValue(undefined),
  } as unknown as JobMatchedUsersRepository

  const userMatchSettingReadRepository = {
    findManyByUserIds: vi.fn().mockResolvedValue([]),
  } as unknown as UserMatchSettingReadRepository

  const jobAutoMatchUserOffersRepository = {
    upsertMany: vi.fn().mockResolvedValue(undefined),
  } as unknown as JobAutoMatchUserOffersRepository

  const notificationService = {
    sendNotificationBatch: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationService

  const sqsService = {
    send: vi.fn().mockResolvedValue(undefined),
  } as unknown as SqsService

  return {
    prismaService,
    userReadRepository,
    jobMatchedUsersRepository,
    userMatchSettingReadRepository,
    jobAutoMatchUserOffersRepository,
    notificationService,
    sqsService,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JobMatchService', () => {
  let service: JobMatchService
  let mocks: ReturnType<typeof makeServiceMocks>

  beforeEach(() => {
    mocks = makeServiceMocks()
    service = new JobMatchService(
      mocks.prismaService,
      mocks.notificationService,
      mocks.userReadRepository,
      mocks.jobMatchedUsersRepository,
      mocks.userMatchSettingReadRepository,
      mocks.jobAutoMatchUserOffersRepository,
      mocks.sqsService,
    )
  })

  // ─── Loop segmentation (AC-LOOP-001 ~ AC-LOOP-004) ───────────────────────────

  describe('processBatch() — loop routing', () => {
    it('AC-LOOP-001: hospital batch routes to findLoopHospitalUsers only', async () => {
      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.hospital))

      expect(mocks.userReadRepository.findLoopHospitalUsers).toHaveBeenCalledOnce()
      expect(mocks.userReadRepository.findLoopPartTimeUsers).not.toHaveBeenCalled()
      expect(mocks.userReadRepository.findLoopFormerWorkerUsers).not.toHaveBeenCalled()
      expect(mocks.userReadRepository.findMatchedCriteriaUsers).not.toHaveBeenCalled()
    })

    it('AC-LOOP-002: part_time batch routes to findLoopPartTimeUsers only', async () => {
      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.part_time))

      expect(mocks.userReadRepository.findLoopPartTimeUsers).toHaveBeenCalledOnce()
      expect(mocks.userReadRepository.findLoopHospitalUsers).not.toHaveBeenCalled()
      expect(mocks.userReadRepository.findLoopFormerWorkerUsers).not.toHaveBeenCalled()
      expect(mocks.userReadRepository.findMatchedCriteriaUsers).not.toHaveBeenCalled()
    })

    it('AC-LOOP-003: former_worker batch routes to findLoopFormerWorkerUsers only', async () => {
      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.former_worker))

      expect(mocks.userReadRepository.findLoopFormerWorkerUsers).toHaveBeenCalledOnce()
      expect(mocks.userReadRepository.findLoopHospitalUsers).not.toHaveBeenCalled()
      expect(mocks.userReadRepository.findLoopPartTimeUsers).not.toHaveBeenCalled()
      expect(mocks.userReadRepository.findMatchedCriteriaUsers).not.toHaveBeenCalled()
    })

    it('AC-LOOP-004: system (other) batch routes to findMatchedCriteriaUsers', async () => {
      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.system))

      expect(mocks.userReadRepository.findMatchedCriteriaUsers).toHaveBeenCalledOnce()
      expect(mocks.userReadRepository.findLoopHospitalUsers).not.toHaveBeenCalled()
      expect(mocks.userReadRepository.findLoopPartTimeUsers).not.toHaveBeenCalled()
      expect(mocks.userReadRepository.findLoopFormerWorkerUsers).not.toHaveBeenCalled()
    })

    it('passes correct departmentId, startId, endId, and criteria to loop query', async () => {
      const job = makeJob({ required_department_id: 7 })
      const batch = makeBatch(JobPublishGroup.hospital, {
        start_id: BigInt(50),
        end_id: BigInt(200),
        criteria_snapshot: { roleId: 3, certificationIds: [10, 20], experience: { min: 1, max: 5 } },
      })

      await service.processBatch(makeInput(), job, batch)

      expect(mocks.userReadRepository.findLoopHospitalUsers).toHaveBeenCalledWith(
        7,          // departmentId
        50,         // startId (Number(BigInt))
        200,        // endId
        3,          // roleId from criteria
        expect.objectContaining({ min: 1, max: 5 }),
        [10, 20],   // certificationIds
        expect.anything(), // transaction
      )
    })
  })

  // ─── Core matching criteria (AC-MATCH-001 ~ AC-MATCH-004) ───────────────────

  describe('processBatch() — matching criteria filtering', () => {
    it('AC-MATCH-001: no users returned when loop query finds no match → createMany not called', async () => {
      vi.mocked(mocks.userReadRepository.findLoopHospitalUsers).mockResolvedValue([])
      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.hospital))
      expect(mocks.jobMatchedUsersRepository.createMany).not.toHaveBeenCalled()
    })

    it('AC-MATCH-002: matched users are inserted via createMany with their IDs', async () => {
      vi.mocked(mocks.userReadRepository.findLoopHospitalUsers).mockResolvedValue([1, 2, 3])
      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.hospital))

      expect(mocks.jobMatchedUsersRepository.createMany).toHaveBeenCalledWith(
        10,            // jobId
        [1, 2, 3],     // userIds
        expect.anything(), // transaction
      )
    })

    it('AC-MATCH-003: FitScore recalc messages are published to SQS for every matched user', async () => {
      vi.mocked(mocks.userReadRepository.findLoopHospitalUsers).mockResolvedValue([1, 2, 3])
      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.hospital))

      expect(mocks.sqsService.send).toHaveBeenCalledTimes(3)
      const bodies = vi.mocked(mocks.sqsService.send).mock.calls.map((c) => JSON.parse(c[1].body as string))
      expect(bodies).toEqual(expect.arrayContaining([
        expect.objectContaining({ jobId: 10, userId: 1 }),
        expect.objectContaining({ jobId: 10, userId: 2 }),
        expect.objectContaining({ jobId: 10, userId: 3 }),
      ]))
    })

    it('AC-MATCH-004: no SQS messages published when no users matched', async () => {
      vi.mocked(mocks.userReadRepository.findLoopHospitalUsers).mockResolvedValue([])
      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.hospital))

      expect(mocks.sqsService.send).not.toHaveBeenCalled()
    })
  })

  // ─── FitScore SQS publish ─────────────────────────────────────────────────────

  describe('processBatch() — FitScore SQS publish', () => {
    it('publish uses correct groupId and deduplicationId per (jobId, userId)', async () => {
      vi.mocked(mocks.userReadRepository.findLoopHospitalUsers).mockResolvedValue([5])
      const input = makeInput({ correlationId: '00000000-0000-0000-0000-000000000099' })

      await service.processBatch(input, makeJob({ id: 10 } as Partial<Jobs>), makeBatch(JobPublishGroup.hospital))

      const sendArgs = vi.mocked(mocks.sqsService.send).mock.calls[0][1]
      expect(sendArgs.groupId).toBe('fit-score-10-5')
      expect(sendArgs.deduplicationId).toContain('fit-score-recalc-10-5-')
    })

    it('createMany is still called even if SQS publish fails', async () => {
      vi.mocked(mocks.userReadRepository.findLoopHospitalUsers).mockResolvedValue([1])
      vi.mocked(mocks.sqsService.send).mockRejectedValue(new Error('SQS unavailable'))

      await expect(
        service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.hospital)),
      ).rejects.toThrow()

      expect(mocks.jobMatchedUsersRepository.createMany).toHaveBeenCalledOnce()
    })
  })

  // ─── Auto-match segmentation ──────────────────────────────────────────────────

  describe('processBatch() — autoMatch vs normal segmentation', () => {
    it('auto-match eligible users go to autoMatchedGroup → upsertMany called', async () => {
      vi.mocked(mocks.userReadRepository.findLoopHospitalUsers).mockResolvedValue([1, 2])
      // user 1: auto_accept=true, is_wednesday=true → eligible (work_date is Wednesday 2026-04-29)
      // user 2: auto_accept=false → not eligible
      vi.mocked(mocks.userMatchSettingReadRepository.findManyByUserIds).mockResolvedValue([
        makeUserMatchSettings(1, { auto_accept: true, is_wednesday: true }),
        makeUserMatchSettings(2, { auto_accept: false }),
      ])

      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.hospital))

      expect(mocks.jobAutoMatchUserOffersRepository.upsertMany).toHaveBeenCalledWith(
        10,           // jobId
        [1],          // only user 1 in autoMatchedGroup
        expect.any(Date),
        expect.anything(),
      )
    })

    it('non-eligible users go to normalGroup → sendNotificationBatch with normalNotificationId', async () => {
      vi.mocked(mocks.userReadRepository.findLoopHospitalUsers).mockResolvedValue([2, 3])
      vi.mocked(mocks.userMatchSettingReadRepository.findManyByUserIds).mockResolvedValue([
        makeUserMatchSettings(2, { auto_accept: false }),
        makeUserMatchSettings(3, { auto_accept: true, is_wednesday: false }), // wrong day
      ])

      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.hospital))

      expect(mocks.notificationService.sendNotificationBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: 1001, // normalNotificationId
          notifyUserIds: expect.arrayContaining([2, 3]),
        }),
      )
      expect(mocks.jobAutoMatchUserOffersRepository.upsertMany).not.toHaveBeenCalled()
    })

    it('upsertMany not called when no auto-match eligible users', async () => {
      vi.mocked(mocks.userReadRepository.findLoopHospitalUsers).mockResolvedValue([1])
      vi.mocked(mocks.userMatchSettingReadRepository.findManyByUserIds).mockResolvedValue([
        makeUserMatchSettings(1, { auto_accept: false }),
      ])

      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.hospital))

      expect(mocks.jobAutoMatchUserOffersRepository.upsertMany).not.toHaveBeenCalled()
    })

    it('sendNotificationBatch not called when no normal-group users', async () => {
      vi.mocked(mocks.userReadRepository.findLoopHospitalUsers).mockResolvedValue([1])
      vi.mocked(mocks.userMatchSettingReadRepository.findManyByUserIds).mockResolvedValue([
        makeUserMatchSettings(1, { auto_accept: true, is_wednesday: true }),
      ])

      await service.processBatch(makeInput(), makeJob(), makeBatch(JobPublishGroup.hospital))

      // autoMatchedGroup=[1], normalGroup=[] → no normal notification
      const normalCall = vi.mocked(mocks.notificationService.sendNotificationBatch).mock.calls.find(
        (c) => c[0].notificationId === 1001,
      )
      expect(normalCall).toBeUndefined()
    })
  })

  // ─── isAutoMatchEligible() — pure function ─────────────────────────────────────

  describe('isAutoMatchEligible()', () => {
    const WED = new Date('2026-04-29') // Wednesday, getDay()=3
    const THU = new Date('2026-05-07') // Thursday, getDay()=4

    it('returns false when user has no settings entry', () => {
      const settingsMap = new Map<number, UserMatchSettings>()
      expect(service.isAutoMatchEligible(WED, 99, settingsMap)).toBe(false)
    })

    it('returns false when auto_accept=false regardless of day flags', () => {
      const settingsMap = new Map([
        [1, makeUserMatchSettings(1, { auto_accept: false, is_wednesday: true })],
      ])
      expect(service.isAutoMatchEligible(WED, 1, settingsMap)).toBe(false)
    })

    it('returns true when auto_accept=true and the work-date day flag is enabled', () => {
      const settingsMap = new Map([
        [1, makeUserMatchSettings(1, { auto_accept: true, is_wednesday: true })],
      ])
      expect(service.isAutoMatchEligible(WED, 1, settingsMap)).toBe(true)
    })

    it('returns false when auto_accept=true but the work-date day flag is disabled', () => {
      const settingsMap = new Map([
        [1, makeUserMatchSettings(1, { auto_accept: true, is_wednesday: false })],
      ])
      expect(service.isAutoMatchEligible(WED, 1, settingsMap)).toBe(false)
    })

    it('checks the correct day flag for each weekday', () => {
      const thursdaySettings = makeUserMatchSettings(1, { auto_accept: true, is_thursday: true })
      const settingsMap = new Map([[1, thursdaySettings]])
      // WED (day 3) → is_wednesday=false → false
      expect(service.isAutoMatchEligible(WED, 1, settingsMap)).toBe(false)
      // THU (day 4) → is_thursday=true → true
      expect(service.isAutoMatchEligible(THU, 1, settingsMap)).toBe(true)
    })

    it('returns false for a user whose auto_accept setting is missing from the map', () => {
      const settingsMap = new Map([[2, makeUserMatchSettings(2, { auto_accept: true, is_wednesday: true })]])
      // userId=1 not in map → no setting → false
      expect(service.isAutoMatchEligible(WED, 1, settingsMap)).toBe(false)
    })
  })
})

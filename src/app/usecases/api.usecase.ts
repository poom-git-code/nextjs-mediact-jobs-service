import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../modules/prisma.module'
import { JobRepository } from '../repositories/job.repository'
import { JobStatusRepository } from '../repositories/job-status.repository'
import { JobTypeRepository } from '../repositories/job-type.repository'
import { UserReadRepository } from '../repositories/user.repository'
import {
  JobsGetByIdResponse,
  JobsGetByIdResponseStatus,
  JobsGetByIdResponseRequirements,
  PostCreateJobRequest,
  PostReviewApplicantRequest,
  PostReviewApplicantResponse,
  GetApplicantsResponse,
  PostApproveApplicantResponse,
  PostApproveApplicantRequest,
  PostRejectApplicantResponse,
  PostRejectApplicantRequest,
  PostApplyToJobRequest,
  PostApplyToJobResponse,
  GetRecipientCountResponse,
  GetUserReviewsResponse,
  GetUserReviewsSummary,
  GetUserReviewsItem,
} from '../controllers/dto/api.dto'
import { BussinessException } from 'nestjs-custom-module'
import { DateUtility } from '../../utilities/dateUtility'
import { JobsService } from '../services/jobs.service'
import { JobApplyRepository, JobApplyReadRepository } from '../repositories/job-apply.repository'
import { ApplicantReviewRepository } from '../repositories/applicant-review.repository'
import { ApplicantStatus } from '../domains/applicant-status.domain'
import { JobStatus } from '../domains/job-status.domain'
import { NotificationEvent, NotificationService } from '../external-services/notification.service'
import { Constants } from '../../app-configs/configs/constant.config'
import { JobPublishGroup } from '@prisma/client'

@Injectable()
export class ApiUsecase {
  constructor(
    private prismaService: PrismaService,
    private jobRepository: JobRepository,
    private jobStatusRepository: JobStatusRepository,
    private jobTypeRepository: JobTypeRepository,
    private jobsService: JobsService,
    private jobApplyRepository: JobApplyRepository,
    private applicantReviewRepository: ApplicantReviewRepository,
    private notificationService: NotificationService,
    private jobApplyReadRepository: JobApplyReadRepository,
    private userReadRepository: UserReadRepository,
  ) {}

  async createJob(input: PostCreateJobRequest) {
    await this.jobsService.createJob(input.jobId)
  }

  async updateJob(jobId: number) {
    await this.jobsService.updateJob(jobId)
  }

  async closeJob(jobId: number) {
    await this.prismaService.$transaction(async (t) => {
      const job = await this.jobRepository.findOneById(jobId, t)
      if (!job) throw new BussinessException('Job not found')
      if (job.status_id !== JobStatus.open) throw new BussinessException('Job not open')

      await this.jobsService.closeJob(job, t)
    })
  }

  async getJobById(id: number): Promise<JobsGetByIdResponse> {
    const job = await this.jobRepository.findOneById(id)
    if (!job) throw new BussinessException('Job not found')

    const status = await this.jobStatusRepository.findOneById(job.status_id)
    if (!status) throw new BussinessException('Job status not found')

    const statusResponse = new JobsGetByIdResponseStatus()
    statusResponse.id = status.id
    statusResponse.name = status.name

    const requirementsResponse = new JobsGetByIdResponseRequirements()
    requirementsResponse.roleId = job.required_role_id
    requirementsResponse.workExperiences = job.experience_range
    requirementsResponse.maximumApplicants = job.max_applicants
    requirementsResponse.wage = job.job_fee
    requirementsResponse.vatIncluded = Boolean(job.job_fee_vat_included)

    const response = new JobsGetByIdResponse()
    response.title = job.job_title
    response.description = job.job_description
    response.date = DateUtility.formattedYYYYMMDD(job.work_date)
    response.status = statusResponse
    response.shiftTypeId = job.shift_type_id
    response.requirements = requirementsResponse
    response.createdAt = job.created_at?.toISOString()
    response.applicationDeadline = job.application_deadline?.toISOString()
    response.publishGroup = job.publish_group
    response.departmentId = job.required_department_id
    response.closeType = job.auto_close_type

    return response
  }

  async reviewApplicant(jobApplyId: number, input: PostReviewApplicantRequest): Promise<PostReviewApplicantResponse> {
    const jobApply = await this.jobApplyRepository.findOneById(jobApplyId)
    if (!jobApply) throw new BussinessException('Job application not found')
    if (jobApply.status_id == ApplicantStatus.pending || jobApply.status_id == ApplicantStatus.rejected)
      throw new BussinessException('Unable to review applicant')

    const existingReview = await this.applicantReviewRepository.findActiveByJobApplyId(jobApplyId)
    if (existingReview.length > 0) {
      throw new BussinessException('Job application already reviewed')
    }

    const review = await this.applicantReviewRepository.create({
      job_apply_id: jobApplyId,
      rating: input.rating,
      comment: input.comment || null,
      is_active: true,
    })

    const response = new PostReviewApplicantResponse()
    response.id = review.id
    return response
  }

  async getApplicantsByJobId(jobId: number): Promise<GetApplicantsResponse[]> {
    const applicantsWithReview = await this.jobApplyReadRepository.findByJobIdWithReview(jobId)

    return applicantsWithReview.map((item) => {
      const applicant = new GetApplicantsResponse()
      applicant.id = item.id
      applicant.userId = item.user_id
      applicant.status = ApplicantStatus[item.status_id]
      applicant.applyDate = item.apply_date?.toISOString() || null
      applicant.remark = item.remark
      applicant.rating = item.rating
      applicant.isReviewed = item.isReviewed
      applicant.fitScore = item.fitScore ?? null
      return applicant
    })
  }

  async approveApplicant(
    userId: number,
    jobId: number,
    input: PostApproveApplicantRequest,
  ): Promise<PostApproveApplicantResponse> {
    return this.prismaService.$transaction(async (t) => {
      const jobApply = await this.jobApplyRepository.findOneByUserIdAndJobId(userId, jobId, t)
      if (!jobApply) throw new BussinessException('Job application not found')
      if (jobApply.status_id !== ApplicantStatus.pending) throw new BussinessException('Job application not pending')
      const job = await this.jobRepository.findOneById(jobApply.job_id, t)
      if (!job) throw new BussinessException('Job not found')
      if (job.status_id !== JobStatus.open) throw new BussinessException('Job not open')

      const updatedJobApply = await this.jobsService.approveApplicant(jobApply, input.remark || null, t)
      await this.notificationService.sendNotification({
        eventName: NotificationEvent.JOB_APPLICANT_APPROVED_EVENT,
        payload: {
          jobId: job.id,
          jobTitle: job.job_title,
          applicantId: jobApply.user_id,
        },
      })
      if (job.max_applicants) {
        const approvedCount = await this.jobApplyRepository.countByJobIdAndStatus(job.id, ApplicantStatus.hired, t)
        if (approvedCount >= job.max_applicants) await this.jobsService.closeJob(job, t)
      }

      const response = new PostApproveApplicantResponse()
      response.id = updatedJobApply.id

      return response
    })
  }

  async rejectApplicant(
    userId: number,
    jobId: number,
    input: PostRejectApplicantRequest,
  ): Promise<PostRejectApplicantResponse> {
    return this.prismaService.$transaction(async (t) => {
      const jobApply = await this.jobApplyRepository.findOneByUserIdAndJobId(userId, jobId, t)
      if (!jobApply) throw new BussinessException('Job application not found')
      const job = await this.jobRepository.findOneById(jobApply.job_id, t)
      if (!job) throw new BussinessException('Job not found')
      if (job.status_id !== JobStatus.open) throw new BussinessException('Job not open')

      const updatedJobApply = await this.jobsService.rejectApplicant(jobApply, input.remark || null, t)
      await this.notificationService.sendNotification({
        eventName: NotificationEvent.JOB_APPLICANT_REJECTED_EVENT,
        payload: {
          jobId: job.id,
          jobTitle: job.job_title,
          applicantId: jobApply.user_id,
        },
      })
      const response = new PostRejectApplicantResponse()
      response.id = updatedJobApply.id

      return response
    })
  }

  async applyToJob(jobId: number, userId: number, input: PostApplyToJobRequest): Promise<PostApplyToJobResponse> {
    return this.prismaService.$transaction(async (t) => {
      const job = await this.jobRepository.findOneById(jobId, t)
      if (!job) throw new BussinessException('Job not found')
      if (job.status_id !== JobStatus.open) throw new BussinessException('Job not open')

      if (job.publish_group === JobPublishGroup.hospital) {
        const users = await this.userReadRepository.findDepartmentEmploymentUsers(
          job.required_department_id,
          userId,
          userId,
          job.required_role_id,
          t,
        )
        if (!users.length) throw new BussinessException('User not in the same department')
      } else if (job.publish_group === JobPublishGroup.part_time) {
        const users = await this.userReadRepository.findPartTimeOrJobApplicantUsers(
          job.required_department_id,
          userId,
          userId,
          job.required_role_id,
          t,
        )
        if (!users.length) throw new BussinessException('User not part time or job applicant')
      } else {
        const users = await this.userReadRepository.findMatchedCriteriaUsers(
          job.required_department_id,
          {
            roleId: job.required_role_id,
          },
          userId,
          userId,
          t,
        )
        if (!users.length) throw new BussinessException('User not matched criteria')
      }

      const count = await this.jobApplyRepository.countByJobId(jobId, t)
      if (count >= Constants.JOB_MAX_APPLY_LIMIT) throw new BussinessException('Job is full')

      const existingApplication = await this.jobApplyRepository.findByJobIdAndUserId(jobId, userId, t)
      if (existingApplication) throw new BussinessException('Already applied to this job')

      const jobApply = await this.jobsService.applyToJob(jobId, userId, input.remark || null, t)

      const response = new PostApplyToJobResponse()
      response.id = jobApply.id
      return response
    })
  }

  async getRecipientCount(departmentId: number, roleId: number): Promise<GetRecipientCountResponse> {
    const [departmentStaff, formerStaff] = await Promise.all([
      this.userReadRepository.countDepartmentEmploymentUsers(departmentId, roleId),
      this.userReadRepository.countPartTimeOrJobApplicantUsers(departmentId, roleId),
    ])

    const response = new GetRecipientCountResponse()
    response.departmentStaff = departmentStaff
    response.formerStaff = formerStaff
    return response
  }

  async getUserReviews(userId: number): Promise<GetUserReviewsResponse> {
    const reviews = await this.applicantReviewRepository.findByUserId(userId)

    const reviewItems: GetUserReviewsItem[] = reviews.map((review) => {
      const item = new GetUserReviewsItem()
      item.id = review.id
      item.reviewerName = review.reviewer_name || 'Unknown'
      item.rating = Number(review.rating)
      item.reviewDate = new Date(review.created_at).toISOString()
      item.comment = review.comment || null
      return item
    })

    const summary = new GetUserReviewsSummary()
    summary.totalReviews = reviewItems.length
    summary.averageRating =
      reviewItems.length > 0
        ? Number((reviewItems.reduce((sum, item) => sum + item.rating, 0) / reviewItems.length).toFixed(1))
        : 0

    const response = new GetUserReviewsResponse()
    response.summary = summary
    response.reviews = reviewItems
    return response
  }
}

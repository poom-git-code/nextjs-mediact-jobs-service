import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsNumber, Min, Max, IsOptional, IsString, MaxLength } from 'class-validator'

// POST /api/jobs/
export class PostCreateJobRequest {
  @ApiProperty({ example: 3 }) jobId: number
}
export class PostCreateJobResponse {}

// PATCH /api/jobs/:id
export class PostUpdateJobResponse {}

// GET /api/jobs/:id
export class JobsGetByIdResponseStatus {
  @ApiProperty({ example: 1 }) id: number
  @ApiProperty({ example: 'Active' }) name: string
}

export class JobsGetByIdResponseRequirements {
  @ApiProperty({ example: 1 }) roleId: number
  @ApiProperty({ example: '2-5 years', nullable: true }) workExperiences: string | null
  @ApiProperty({ example: 10 }) maximumApplicants: number
  @ApiProperty({ example: 500.5 }) wage: number
  @ApiProperty({ example: true }) vatIncluded: boolean
}

export class JobsGetByIdResponse {
  @ApiProperty({ example: 'Nurse Position' }) title: string
  @ApiProperty({ example: 'We are looking for experienced nurses' }) description: string
  @ApiProperty({ example: '2026-01-26' }) date: string
  @ApiProperty({ example: 1 }) departmentId: number
  @ApiProperty({ type: JobsGetByIdResponseStatus }) status: JobsGetByIdResponseStatus
  @ApiProperty({ example: 1 }) shiftTypeId: number
  @ApiProperty({ type: JobsGetByIdResponseRequirements }) requirements: JobsGetByIdResponseRequirements
  @ApiProperty({ example: '2026-01-25T10:30:00Z' }) createdAt: string
  @ApiProperty({ example: '2026-02-01T23:59:59Z', nullable: true }) applicationDeadline: string | null
  @ApiProperty({ example: 'hospital' }) publishGroup: string
  @ApiProperty({ example: 'manual' }) closeType: string
}

// POST /api/applicants/:jobApplyId/review
export class PostReviewApplicantRequest {
  @IsNotEmpty() @IsNumber() @Min(0) @Max(5) @ApiProperty({ example: 5 }) rating: number
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiProperty({ example: 'Great candidate', nullable: true })
  comment?: string
}

export class PostReviewApplicantResponse {
  @ApiProperty({ example: 1 }) id: number
}

// GET /api/jobs/:jobId/applicants
export class GetApplicantsResponse {
  @ApiProperty({ example: 1 }) id: number
  @ApiProperty({ example: 1 }) userId: number
  @ApiProperty({ example: 'approved' }) status: string
  @ApiProperty({ example: '2026-01-29T10:00:00Z', nullable: true }) applyDate: string | null
  @ApiProperty({ example: 'Good candidate', nullable: true }) remark: string | null
  @ApiProperty({ example: 5, nullable: true }) rating: number | null
  @ApiProperty({ example: true }) isReviewed: boolean
  @ApiProperty({ example: 87.95, nullable: true, description: 'FitScore % (0–100), null if not yet calculated' })
  fitScore: number | null
}

// POST /api/applicants/:applicantId/approve
export class PostApproveApplicantRequest {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({ example: 'Good fit for the position', nullable: true })
  remark?: string
}

export class PostApproveApplicantResponse {
  @ApiProperty({ example: 1 }) id: number
}

// POST /api/applicants/:applicantId/reject
export class PostRejectApplicantRequest {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({ example: 'Not suitable for this role', nullable: true })
  remark?: string
}

export class PostRejectApplicantResponse {
  @ApiProperty({ example: 1 }) id: number
}

// POST /api/jobs/:jobId/apply
export class PostApplyToJobRequest {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({ example: 'I am interested in this position', nullable: true })
  remark?: string

  @IsNotEmpty() @IsNumber() @ApiProperty({ example: 1 }) userId: number
}

export class PostApplyToJobResponse {
  @ApiProperty({ example: 1 }) id: number
}

// GET /api/recipient-count/:departmentId
export class GetRecipientCountRequest {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @ApiProperty({ example: 1 })
  roleId?: number
}
export class GetRecipientCountResponse {
  @ApiProperty({ example: 100 }) departmentStaff: number
  @ApiProperty({ example: 50 }) formerStaff: number
}

// GET /api/jobs/applicants/:userId/reviews
export class GetUserReviewsSummary {
  @ApiProperty({ example: 5 }) averageRating: number
  @ApiProperty({ example: 2 }) totalReviews: number
}

export class GetUserReviewsItem {
  @ApiProperty({ example: 1 }) id: number
  @ApiProperty({ example: 'โรงพยาบาลศิริเวช' }) reviewerName: string
  @ApiProperty({ example: 5 }) rating: number
  @ApiProperty({ example: '2025-09-08T00:04:00Z' }) reviewDate: string
  @ApiProperty({ example: 'ทำงานได้ดีมาก ขยันค่ะ', nullable: true }) comment: string | null
}

export class GetUserReviewsResponse {
  @ApiProperty({ type: GetUserReviewsSummary }) summary: GetUserReviewsSummary
  @ApiProperty({ type: [GetUserReviewsItem] }) reviews: GetUserReviewsItem[]
}

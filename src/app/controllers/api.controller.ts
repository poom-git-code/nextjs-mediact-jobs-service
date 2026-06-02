import { Body, Controller, Get, Post, Param, ParseIntPipe, Patch, Delete, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags, ApiHeader } from '@nestjs/swagger'
import { SwaggerApiResponse } from 'nestjs-custom-module'
import {
  PostCreateJobRequest,
  PostCreateJobResponse,
  JobsGetByIdResponse,
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
  PostUpdateJobResponse,
  GetRecipientCountRequest,
  GetUserReviewsResponse,
} from './dto/api.dto'
import { ApiUsecase } from '../usecases/api.usecase'
import { RequireApiKey } from '../../app-configs/guards/api-key.guard'
import { Constants } from '../../app-configs/configs/constant.config'

const prefix = 'api/jobs'
@ApiTags('API')
@Controller(prefix)
@ApiBearerAuth()
@ApiHeader({
  name: Constants.HEADER_API_KEY,
  description: 'API Key',
})
@ApiHeader({
  name: Constants.HEADER_USER_ID,
  description: 'User ID',
})
@ApiHeader({
  name: Constants.HEADER_LANGUAGE,
  description: 'Language',
})
export class ApiController {
  constructor(private apiUsecase: ApiUsecase) {}

  @Post('/')
  @ApiOperation({
    description: 'Create job',
  })
  @RequireApiKey()
  @SwaggerApiResponse(PostCreateJobResponse)
  async createJob(@Body() body: PostCreateJobRequest): Promise<void> {
    return this.apiUsecase.createJob(body)
  }

  @Patch('/:id')
  @ApiOperation({
    description: 'Update job',
  })
  @RequireApiKey()
  @SwaggerApiResponse(PostUpdateJobResponse)
  async updateJob(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.apiUsecase.updateJob(id)
  }

  @Delete('/:id')
  @ApiOperation({
    description: 'Close/Cancel job',
  })
  @RequireApiKey()
  @SwaggerApiResponse(PostUpdateJobResponse)
  async closeJob(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.apiUsecase.closeJob(id)
  }

  @Get('/:id')
  @ApiOperation({
    description: 'Get job by id',
  })
  @RequireApiKey()
  @SwaggerApiResponse(JobsGetByIdResponse)
  async getJobById(@Param('id', ParseIntPipe) id: number): Promise<JobsGetByIdResponse> {
    return this.apiUsecase.getJobById(id)
  }

  @Post('/applicants/:jobApplyId/review')
  @ApiOperation({
    description: 'Review applicant',
  })
  @RequireApiKey()
  @SwaggerApiResponse(PostReviewApplicantResponse)
  async reviewApplicant(
    @Param('jobApplyId', ParseIntPipe) jobApplyId: number,
    @Body() body: PostReviewApplicantRequest,
  ): Promise<PostReviewApplicantResponse> {
    return this.apiUsecase.reviewApplicant(jobApplyId, body)
  }

  @Get('/:jobId/applicants')
  @ApiOperation({
    description: 'Get all applicants by job ID with reviews',
  })
  @RequireApiKey()
  @SwaggerApiResponse(GetApplicantsResponse)
  async getApplicantsByJobId(@Param('jobId', ParseIntPipe) jobId: number): Promise<GetApplicantsResponse[]> {
    return this.apiUsecase.getApplicantsByJobId(jobId)
  }

  @Post('/:jobId/applicants/:userId/approve')
  @ApiOperation({
    description: 'Approve applicant',
  })
  @RequireApiKey()
  @SwaggerApiResponse(PostApproveApplicantResponse)
  async approveApplicant(
    @Param('jobId', ParseIntPipe) jobId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: PostApproveApplicantRequest,
  ): Promise<PostApproveApplicantResponse> {
    return this.apiUsecase.approveApplicant(userId, jobId, body)
  }

  @Post('/:jobId/applicants/:userId/reject')
  @ApiOperation({
    description: 'Reject applicant',
  })
  @RequireApiKey()
  @SwaggerApiResponse(PostRejectApplicantResponse)
  async rejectApplicant(
    @Param('jobId', ParseIntPipe) jobId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: PostRejectApplicantRequest,
  ): Promise<PostRejectApplicantResponse> {
    return this.apiUsecase.rejectApplicant(userId, jobId, body)
  }

  @Post('/:jobId/apply')
  @ApiOperation({
    description: 'Apply to job',
  })
  @RequireApiKey()
  @SwaggerApiResponse(PostApplyToJobResponse)
  async applyToJob(
    @Param('jobId', ParseIntPipe) jobId: number,
    @Body() body: PostApplyToJobRequest,
  ): Promise<PostApplyToJobResponse> {
    return this.apiUsecase.applyToJob(jobId, body.userId, body)
  }

  @Get('departments/:departmentId/recipient-count')
  @ApiOperation({
    description: 'Get recipient count for publish groups',
  })
  @RequireApiKey()
  @SwaggerApiResponse(GetRecipientCountResponse)
  async getRecipientCount(
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Query() query: GetRecipientCountRequest,
  ): Promise<GetRecipientCountResponse> {
    return this.apiUsecase.getRecipientCount(departmentId, query.roleId)
  }

  @Get('/applicants/:userId/reviews')
  @ApiOperation({
    description: 'Get all reviews for a user',
  })
  @RequireApiKey()
  @SwaggerApiResponse(GetUserReviewsResponse)
  async getUserReviews(@Param('userId', ParseIntPipe) userId: number): Promise<GetUserReviewsResponse> {
    return this.apiUsecase.getUserReviews(userId)
  }
}

import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SwaggerApiResponse } from 'nestjs-custom-module'
import {
  GetCloseTypeResponse,
  GetJobExperienceYearsResponse,
  GetJobStatusesResponse,
  GetPublishGroupResponse,
} from './dto/master-data.dto'
import { Constants } from '../../app-configs/configs/constant.config'
import { MasterDataUsecase } from '../usecases/master-data.usecase'
import { RequireApiKey } from '../../app-configs/guards/api-key.guard'

const prefix = 'api/master-data/'

@ApiTags('Master Data')
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
export class MasterDataController {
  constructor(private readonly MasterDataUsecase: MasterDataUsecase) {}

  @Get('/job-statuses')
  @ApiOperation({ description: 'Get all job statuses' })
  @RequireApiKey()
  @SwaggerApiResponse(GetJobStatusesResponse, 'array')
  async getJobStatuses(): Promise<GetJobStatusesResponse[]> {
    return this.MasterDataUsecase.getJobStatuses()
  }

  @Get('/job-experience-years')
  @ApiOperation({ description: 'Get all job experience years' })
  @RequireApiKey()
  @SwaggerApiResponse(GetJobExperienceYearsResponse, 'array')
  async getJobExperienceYears(): Promise<GetJobExperienceYearsResponse[]> {
    return this.MasterDataUsecase.getJobExperienceYears()
  }

  @Get('/close-types')
  @ApiOperation({ description: 'Get all close types' })
  @RequireApiKey()
  @SwaggerApiResponse(GetCloseTypeResponse, 'array')
  async getCloseType(): Promise<GetCloseTypeResponse[]> {
    return this.MasterDataUsecase.getCloseType()
  }

  @Get('/publish-groups')
  @ApiOperation({ description: 'Get all publish groups' })
  @RequireApiKey()
  @SwaggerApiResponse(GetPublishGroupResponse, 'array')
  async getPublishGroups(): Promise<GetPublishGroupResponse[]> {
    return this.MasterDataUsecase.getPublishGroups()
  }
}

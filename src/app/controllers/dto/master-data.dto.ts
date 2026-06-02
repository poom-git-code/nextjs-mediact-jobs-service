import { ApiProperty } from '@nestjs/swagger'

export class GetJobStatusesResponse {
  @ApiProperty({ example: 1 }) id: number
  @ApiProperty({ example: 'open' }) name: string
}

export class GetJobExperienceYearsResponse {
  @ApiProperty({ example: '1-2 ปี' }) label: string
  @ApiProperty({ example: '1-2' }) value: string
}

export class GetCloseTypeResponse {
  @ApiProperty({ example: 'Manual Close' }) label: string
  @ApiProperty({ example: 'manual' }) value: string
}

export class GetPublishGroupResponse {
  @ApiProperty({ example: 'Department' }) label: string
  @ApiProperty({ example: 'hospital' }) value: string
}

import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { IsNotEmpty, IsInt, IsString, IsUUID } from 'class-validator'
import { Event } from '../../domains/event.domain'

export class JobRecipientGenerator {
  @IsNotEmpty() @ApiProperty({ example: Event.JOB_CREATED_EVENT }) @Expose() eventName: Event
  @IsNotEmpty() @IsInt() @ApiProperty({ example: 1 }) @Expose() jobId: number
}

export class JobMatch {
  @IsNotEmpty() @IsInt() @ApiProperty({ example: 1 }) @Expose() normalNotificationId: number
  @IsNotEmpty() @IsInt() @ApiProperty({ example: 1 }) @Expose() autoMatchedNotificationId: number
  @IsNotEmpty() @IsInt() @ApiProperty({ example: 1 }) @Expose() jobId: number
  @IsNotEmpty() @IsInt() @ApiProperty({ example: 1 }) @Expose() batchId: number
  @IsNotEmpty() @IsInt() @ApiProperty({ example: 1 }) @Expose() batchNumber: number
  @IsNotEmpty() @IsString() @IsUUID() @ApiProperty({ example: 'uuid-v4' }) @Expose() correlationId: string
}

export class UserRematch {
  @IsNotEmpty() @IsInt() @ApiProperty({ example: 1 }) @Expose() userId: number
  @IsNotEmpty() @IsString() @IsUUID() @ApiProperty({ example: 'uuid-v4' }) @Expose() correlationId: string
}

export class FitScoreRecalc {
  @IsNotEmpty() @IsInt() @ApiProperty({ example: 1 }) @Expose() jobId: number
  @IsNotEmpty() @IsInt() @ApiProperty({ example: 1 }) @Expose() userId: number
  @IsNotEmpty() @IsString() @IsUUID() @ApiProperty({ example: 'uuid-v4' }) @Expose() correlationId: string
}

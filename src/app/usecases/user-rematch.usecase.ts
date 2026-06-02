import { Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { SqsService } from '@ssut/nestjs-sqs'
import { CustomLogger } from 'nestjs-custom-module'
import { UserRepository } from '../repositories/user.repository'
import { UserRematch } from '../controllers/dto/consumer.dto'
import { TriggerRematchResponse } from '../controllers/dto/internal.job.dto'
import { Constants } from '../../app-configs/configs/constant.config'
import { getCorrelationId } from 'nestjs-custom-module'
import { getLanguage } from '../../app-configs/middleware/languages.middleware'
import { MessageAttributeValue } from '@aws-sdk/client-sqs'
import { getUserId } from '../../app-configs/contexts/consumer.context'

@Injectable()
export class UserRematchUsecase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sqsService: SqsService,
    private readonly customLogger: CustomLogger,
  ) {}

  async triggerRematch(userId: number): Promise<TriggerRematchResponse> {
    const user = await this.userRepository.findOneById(userId)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    const correlationId = randomUUID()

    const dto = new UserRematch()
    dto.userId = userId
    dto.correlationId = correlationId

    const uniqueKey = `user-rematch-${userId}-${correlationId}`
    const messageAttributes: Record<string, MessageAttributeValue> = {
      correlationId: { DataType: 'String', StringValue: getCorrelationId() },
      language: { DataType: 'String', StringValue: getLanguage() },
      userId: { DataType: 'String', StringValue: getUserId() },
    }
    await this.sqsService.send(Constants.SQS_QUEUE_USER_REMATCH_NAME, {
      body: JSON.stringify(dto),
      groupId: `user-rematch-${userId}`,
      deduplicationId: uniqueKey,
      id: uniqueKey,
      messageAttributes,
    })

    this.customLogger.log(`rematch triggered userId=${userId} correlationId=${correlationId}`)

    return { userId }
  }
}

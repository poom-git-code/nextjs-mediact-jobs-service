import { HttpStatus, Injectable } from '@nestjs/common'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { ConsumerUsecase } from '../usecases/consumer.usecase'
import { type Message } from '@aws-sdk/client-sqs'
import { Constants } from '../../app-configs/configs/constant.config'
import { plainToInstance } from 'class-transformer'
import { validateOrReject } from 'class-validator'
import { FitScoreRecalc, JobMatch, JobRecipientGenerator, UserRematch } from './dto/consumer.dto'
import { CustomLogger, LogModel } from 'nestjs-custom-module'
import { getConsumerContext, runConsumerContext } from '../../app-configs/contexts/consumer.context'

@Injectable()
export class ConsumerController {
  constructor(
    private consumerUsecase: ConsumerUsecase,
    private customLogger: CustomLogger,
  ) {}

  @SqsMessageHandler(Constants.SQS_QUEUE_RECIPIENT_NAME)
  public async onRecipientMessage(message: Message) {
    return runConsumerContext(message, async () => {
      try {
        this.consumeLog(Constants.SQS_QUEUE_RECIPIENT_NAME, message)
        const instance = plainToInstance(JobRecipientGenerator, JSON.parse(message.Body), {
          excludeExtraneousValues: true,
        })
        await validateOrReject(instance)

        await this.consumerUsecase.handleRecipientGenerator(
          Number(message.Attributes?.ApproximateReceiveCount || 0),
          instance,
        )
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.customLogger.error(`Failed to process recipient message: ${errorMessage}`)
        throw error
      }
    })
  }

  @SqsMessageHandler(Constants.SQS_QUEUE_JOB_MATCH_NAME)
  public async onJobMatchMessage(message: Message) {
    return runConsumerContext(message, async () => {
      try {
        this.consumeLog(Constants.SQS_QUEUE_JOB_MATCH_NAME, message)
        const instance = plainToInstance(JobMatch, JSON.parse(message.Body), {
          excludeExtraneousValues: true,
        })
        await validateOrReject(instance)

        await this.consumerUsecase.handleJobMatch(Number(message.Attributes?.ApproximateReceiveCount || 0), instance)
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.customLogger.error(`Failed to process delivery message: ${errorMessage}`)
        throw error
        // return
      }
    })
  }

  @SqsMessageHandler(Constants.SQS_QUEUE_USER_REMATCH_NAME)
  public async onUserRematchMessage(message: Message) {
    return runConsumerContext(message, async () => {
      try {
        this.consumeLog(Constants.SQS_QUEUE_USER_REMATCH_NAME, message)
        const instance = plainToInstance(UserRematch, JSON.parse(message.Body), {
          excludeExtraneousValues: true,
        })
        await validateOrReject(instance)

        await this.consumerUsecase.handleUserRematch(Number(message.Attributes?.ApproximateReceiveCount || 0), instance)
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.customLogger.error(`Failed to process user rematch message: ${errorMessage}`)
        throw error
      }
    })
  }

  @SqsMessageHandler(Constants.SQS_QUEUE_FIT_SCORE_RECALC_NAME)
  public async onFitScoreRecalcMessage(message: Message) {
    return runConsumerContext(message, async () => {
      try {
        this.consumeLog(Constants.SQS_QUEUE_FIT_SCORE_RECALC_NAME, message)
        const instance = plainToInstance(FitScoreRecalc, JSON.parse(message.Body), {
          excludeExtraneousValues: true,
        })
        await validateOrReject(instance)

        await this.consumerUsecase.handleFitScoreRecalc(
          Number(message.Attributes?.ApproximateReceiveCount || 0),
          instance,
        )
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.customLogger.error(`Failed to process fit-score recalc message: ${errorMessage}`)
        throw error
      }
    })
  }

  private consumeLog(queueName: string, message: Message) {
    const ctx = getConsumerContext()
    const logInfo = plainToInstance(LogModel, {
      correlationId: ctx.correlationId,
      endpoint: queueName,
      method: 'CONSUMER',
      body: JSON.stringify(message),
      httpStatusCode: HttpStatus.OK,
    })
    this.customLogger.logger.info(logInfo, 'consumer-log')
    return logInfo
  }
}

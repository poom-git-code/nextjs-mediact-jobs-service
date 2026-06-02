import { getUserId as getCustomUserId, getCorrelationId as getCustomCorrelationId } from 'nestjs-custom-module'
import { asyncLocalStorage } from '../middleware/languages.middleware'
import { RequestLanguagesContext } from '../middleware/languages.middleware'
import { Message } from '@aws-sdk/client-sqs'

export const getUserId = (): string => getCustomUserId() || asyncLocalStorage.getStore()?.userId || ''
export const getCorrelationId = (): string =>
  getCustomCorrelationId() || asyncLocalStorage.getStore()?.correlationId || ''
export const getConsumerContext = (): RequestLanguagesContext & { correlationId: string } =>
  asyncLocalStorage.getStore() as RequestLanguagesContext & { correlationId: string }

export const runConsumerContext = (message: Message, callback: () => Promise<void>) =>
  asyncLocalStorage.run(
    {
      language: (message.MessageAttributes as any).language?.StringValue || 'en',
      correlationId: (message.MessageAttributes as any).correlationId?.StringValue,
      userId: (message.MessageAttributes as any).userId?.StringValue,
    },
    callback,
  )

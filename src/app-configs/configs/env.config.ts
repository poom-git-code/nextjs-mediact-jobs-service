/* eslint-disable no-undef */
import { ConfigFactory } from '@nestjs/config'

export class Configs {
  nodeEnv: string
  logLevel: string
  appName: string
  port: number
  jwtSecret: string
  telegramNotifyToken: string
  telegramChatId: string
  swaggerUser: string
  swaggerPass: string
  databaseHost: string
  databaseUser: string
  databasePassword: string
  databaseName: string
  databasePort: number
  sqsRecipientUrl: string
  sqsJobMatchUrl: string
  awsRegion: string
  awsAccessKeyId: string
  awsSecretAccessKey: string
  apiKey: string
  notificationApiUrl: string
  notificationApiKey: string
  sqsUserRematchUrl: string
  sqsFitScoreRecalcUrl: string
}

export const envConfiguration: ConfigFactory<Configs> = () => ({
  nodeEnv: process.env.NODE_ENV,
  appName: process.env.APP_NAME,
  logLevel: process.env.LOG_LEVEL,
  port: parseInt(process.env.APP_PORT, 10),
  telegramNotifyToken: process.env.TELEGRAM_NOTIFY_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  jwtSecret: process.env.JWT_SECRET,
  swaggerPass: process.env.SWAGGER_PASSWORD,
  swaggerUser: process.env.SWAGGER_USER,
  databaseHost: process.env.DATABASE_HOST,
  databaseUser: process.env.DATABASE_USER,
  databasePassword: process.env.DATABASE_PASSWORD,
  databaseName: process.env.DATABASE_NAME,
  databasePort: parseInt(process.env.DATABASE_PORT, 10),
  sqsRecipientUrl: process.env.AWS_SQS_RECIPIENT_URL,
  sqsJobMatchUrl: process.env.AWS_SQS_JOB_MATCH_URL,
  awsRegion: process.env.AWS_REGION,
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  apiKey: process.env.API_KEY,
  notificationApiUrl: process.env.NOTIFICATION_API_URL,
  notificationApiKey: process.env.NOTIFICATION_API_KEY,
  sqsUserRematchUrl: process.env.AWS_SQS_USER_REMATCH_URL,
  sqsFitScoreRecalcUrl: process.env.AWS_SQS_FIT_SCORE_RECALC_URL,
})

import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { CacheModule } from '@nestjs/cache-manager'
import { LoggingInterceptor, CustomLoggerModule, HttpModule } from 'nestjs-custom-module'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { envConfiguration } from './app-configs/configs/env.config'
import { NotifyService } from './app/external-services/notify.service'
import { PrismaModule } from './modules/prisma.module'
import { Configs } from './app-configs/configs/env.config'
import { HealthCheckModule } from './modules/health-check.module'
import { SqsModule } from '@ssut/nestjs-sqs'
import { Constants } from './app-configs/configs/constant.config'
import { ApiModule } from './modules/api.module'
import { ConsumerModule } from './modules/consumer.module'
import { ApiKeyGuards } from './app-configs/guards/api-key.guard'
import { UserIdGuards } from './app-configs/guards/userId.guard'
import { MasterDataModule } from './modules/master-data.module'
import { InternalJobModule } from './modules/internal-job.module'

@Module({
  imports: [
    SqsModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configs>) => ({
        consumers: [
          {
            name: Constants.SQS_QUEUE_RECIPIENT_NAME,
            queueUrl: config.get<string>('sqsRecipientUrl'),
            region: config.get<string>('awsRegion'),
            credentials: {
              accessKeyId: config.get('awsAccessKeyId'),
              secretAccessKey: config.get('awsSecretAccessKey'),
            },
            attributeNames: ['All'],
            messageAttributeNames: ['All'],
          },
          {
            name: Constants.SQS_QUEUE_JOB_MATCH_NAME,
            queueUrl: config.get<string>('sqsJobMatchUrl'),
            region: config.get<string>('awsRegion'),
            credentials: {
              accessKeyId: config.get('awsAccessKeyId'),
              secretAccessKey: config.get('awsSecretAccessKey'),
            },
            attributeNames: ['All'],
            messageAttributeNames: ['All'],
          },
          {
            name: Constants.SQS_QUEUE_USER_REMATCH_NAME,
            queueUrl: config.get<string>('sqsUserRematchUrl'),
            region: config.get<string>('awsRegion'),
            credentials: {
              accessKeyId: config.get('awsAccessKeyId'),
              secretAccessKey: config.get('awsSecretAccessKey'),
            },
            attributeNames: ['All'],
            messageAttributeNames: ['All'],
          },
          {
            name: Constants.SQS_QUEUE_FIT_SCORE_RECALC_NAME,
            queueUrl: config.get<string>('sqsFitScoreRecalcUrl'),
            region: config.get<string>('awsRegion'),
            credentials: {
              accessKeyId: config.get('awsAccessKeyId'),
              secretAccessKey: config.get('awsSecretAccessKey'),
            },
            attributeNames: ['All'],
            messageAttributeNames: ['All'],
          },
        ],
        producers: [
          {
            name: Constants.SQS_QUEUE_RECIPIENT_NAME,
            queueUrl: config.get<string>('sqsRecipientUrl'),
            region: config.get<string>('awsRegion'),
            credentials: {
              accessKeyId: config.get('awsAccessKeyId'),
              secretAccessKey: config.get('awsSecretAccessKey'),
            },
          },
          {
            name: Constants.SQS_QUEUE_JOB_MATCH_NAME,
            queueUrl: config.get<string>('sqsJobMatchUrl'),
            region: config.get<string>('awsRegion'),
            credentials: {
              accessKeyId: config.get('awsAccessKeyId'),
              secretAccessKey: config.get('awsSecretAccessKey'),
            },
          },
          {
            name: Constants.SQS_QUEUE_USER_REMATCH_NAME,
            queueUrl: config.get<string>('sqsUserRematchUrl'),
            region: config.get<string>('awsRegion'),
            credentials: {
              accessKeyId: config.get('awsAccessKeyId'),
              secretAccessKey: config.get('awsSecretAccessKey'),
            },
          },
          {
            name: Constants.SQS_QUEUE_FIT_SCORE_RECALC_NAME,
            queueUrl: config.get<string>('sqsFitScoreRecalcUrl'),
            region: config.get<string>('awsRegion'),
            credentials: {
              accessKeyId: config.get('awsAccessKeyId'),
              secretAccessKey: config.get('awsSecretAccessKey'),
            },
          },
        ],
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 10000,
          limit: 30,
        },
      ],
    }),
    CacheModule.register({
      isGlobal: true,
    }),
    ConfigModule.forRoot({
      load: [envConfiguration],
      isGlobal: true,
    }),
    CustomLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configs>) => ({
        serviceName: config.get('appName')?.toLowerCase() || 'app',
        logLevel: (config.get('logLevel') as any) || 'info',
        environment: config.get('nodeEnv'),
      }),
    }),
    HttpModule,
    ApiModule,
    ConsumerModule,
    PrismaModule,
    HealthCheckModule,
    MasterDataModule,
    InternalJobModule,
  ],
  providers: [
    NotifyService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuards,
    },
    {
      provide: APP_GUARD,
      useClass: UserIdGuards,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

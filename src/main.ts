import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import compression from '@fastify/compress'
import { AppModule } from './app.module'
import { Configs } from './app-configs/configs/env.config'
import { ValidationPipe } from '@nestjs/common'
import {
  CustomLogger,
  correlationMiddleware,
  CustomResponseInterceptor,
  AllExceptionsFilter,
} from 'nestjs-custom-module'
import { NotifyService } from './app/external-services/notify.service'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { languagesMiddleware } from './app-configs/middleware/languages.middleware'

const toMB = (size: number) => size * 1024 * 1024
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ bodyLimit: toMB(1) }))

  const configService = app.get<ConfigService<Configs>>(ConfigService)
  const httpAdapter = app.get<HttpAdapterHost>(HttpAdapterHost)
  const customLogger = app.get<CustomLogger>(CustomLogger)
  const notifyService = app.get<NotifyService>(NotifyService)

  app.useGlobalPipes(new ValidationPipe({ stopAtFirstError: true, transform: false }))
  app.useGlobalInterceptors(new CustomResponseInterceptor())
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter, customLogger, notifyService))

  await app.register(compression)
  await app.register(correlationMiddleware)
  await app.register(languagesMiddleware)

  if (configService.get('nodeEnv') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle(`${configService.get('appName')} API`)
      .setDescription(`${configService.get('appName')} API description`)
      .addBearerAuth()
      .build()
    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    })
  }

  customLogger.info(`Application is running on: ${configService.get<number>('port')}`)
  await app.listen(configService.get<number>('port'), '0.0.0.0')
}

bootstrap()

import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Configs } from '../app-configs/configs/env.config'
import { PrismaClient, Prisma } from '@prisma/client'
import { DefaultArgs } from '@prisma/client/runtime/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

export type Transaction = Omit<
  PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(configService: ConfigService<Configs>) {
    const adapter = new PrismaMariaDb({
      host: configService.get<string>('databaseHost'),
      user: configService.get<string>('databaseUser'),
      password: configService.get<string>('databasePassword'),
      database: configService.get<string>('databaseName'),
      port: configService.get<number>('databasePort'),
      connectionLimit: 3,
    })
    super({
      log: [
        {
          emit: 'event',
          level: 'query',
        },
      ],
      adapter,
      transactionOptions: {
        maxWait: 5000,
        timeout: 10000,
      },
    })
  }

  async onModuleInit() {
    await this.$connect()
  }

  withExtensions() {
    // @ts-ignore
    // this.$on('query', async (e) => {
    //   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //   // @ts-ignore
    //   console.log(`${e.query} ${e.params}`)
    // })
    // return this.$extends(serviceChangeTracker).$extends(reservationChangeTracker).$extends(employeeChangeTracker)
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: async (configService: ConfigService<Configs>) => {
        const prismaService = new PrismaService(configService)
        // if (configService.get<boolean>('enableChangeLogs')) return prismaService.withExtensions()
        return prismaService
      },
      inject: [ConfigService],
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}

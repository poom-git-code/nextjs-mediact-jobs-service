import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { Configs } from '../configs/env.config'
import { AsyncLocalStorage } from 'async_hooks'
import { Languages } from '../../app/domains/localize.domain'
import { Constants } from '../configs/constant.config'

export interface RequestLanguagesContext {
  language: Languages
  userId?: string
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestLanguagesContext & { correlationId?: string }>()

export const languagesMiddleware = fp(
  (fastify: FastifyInstance, opts: { jwtService: JwtService; configService: ConfigService<Configs> }) => {
    fastify.addHook('onRequest', (req: FastifyRequest, reply: FastifyReply, done) => {
      const language = req.headers[Constants.HEADER_LANGUAGE] as Languages
      const userId = req.headers[Constants.HEADER_USER_ID] as string
      asyncLocalStorage.run({ language, userId }, done)
    })
  },
)

export const getLanguage = () => asyncLocalStorage.getStore()?.language || Languages.EN

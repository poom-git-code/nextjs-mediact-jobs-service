import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SetMetadata } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { Constants } from '../configs/constant.config'
import { ConfigService } from '@nestjs/config'
import { Configs } from '../configs/env.config'

export const IS_REQUIRE_API_KEY = 'isRequireApiKey'
export const RequireApiKey = () => SetMetadata(IS_REQUIRE_API_KEY, true)

@Injectable()
export class ApiKeyGuards implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService<Configs>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const isRequireApiKey = this.reflector.getAllAndOverride<boolean>(IS_REQUIRE_API_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!isRequireApiKey) return true
    if (!request.headers[Constants.HEADER_API_KEY]) throw new UnauthorizedException()
    const apiKey = request.headers[Constants.HEADER_API_KEY]

    if (!apiKey) throw new UnauthorizedException()
    if (apiKey !== this.configService.get<string>('apiKey')) throw new UnauthorizedException()

    return true
  }
}

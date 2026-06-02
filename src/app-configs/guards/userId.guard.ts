import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SetMetadata } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { Constants } from '../configs/constant.config'
import { setUserId } from 'nestjs-custom-module'

export const IS_REQUIRE_USER_ID = 'isRequireUserId'
export const RequireUserId = () => SetMetadata(IS_REQUIRE_USER_ID, true)

@Injectable()
export class UserIdGuards implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const isRequireUserId = this.reflector.getAllAndOverride<boolean>(IS_REQUIRE_USER_ID, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!isRequireUserId) return true
    if (!request.headers[Constants.HEADER_USER_ID]) throw new UnauthorizedException()
    const userId = request.headers[Constants.HEADER_USER_ID]
    setUserId(userId as string)

    return true
  }
}

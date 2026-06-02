import { Controller, Get, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Configs } from '../app-configs/configs/env.config'
import { ApiOperation } from '@nestjs/swagger'

const prefix = 'health-check'
@Controller(prefix)
class HealthCheckController {
  private stratAtTime = new Date()
  constructor(private configService: ConfigService<Configs>) {}

  @Get('')
  @ApiOperation({
    description: 'service health check',
  })
  async healthxCheck() {
    return {
      statusMessage: "I'm good, thank you",
      stratAtTime: this.stratAtTime,
      env: this.configService.get('nodeEnv'),
    }
  }
}
@Module({
  controllers: [HealthCheckController],
})
export class HealthCheckModule {}

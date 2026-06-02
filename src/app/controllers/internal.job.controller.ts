import { Controller, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger'
import { MedimatchJobUsecase } from '../usecases/medimatch.job.usecase'
import { UserRematchUsecase } from '../usecases/user-rematch.usecase'
import { ScheduleStart, AutoCloseResponse, AutoSwitchAudience, TriggerRematchResponse, SwitchToFormerWorker } from './dto/internal.job.dto'
import { RequireApiKey } from '../../app-configs/guards/api-key.guard'
import { ParsePositiveIntPipe } from '../../app-configs/pipes/parse-positive-int.pipe'
import { Constants } from '../../app-configs/configs/constant.config'

const prefix = 'internal/jobs'

@ApiTags('Internal Jobs')
@Controller(prefix)
@ApiBearerAuth()
@ApiHeader({
  name: Constants.HEADER_API_KEY,
  description: 'API Key',
})
@ApiHeader({
  name: Constants.HEADER_USER_ID,
  description: 'User ID',
})
export class InternalJobController {
  constructor(
    private medimatchJobUsecase: MedimatchJobUsecase,
    private userRematchUsecase: UserRematchUsecase,
  ) {}

  @Post('/auto-close')
  @ApiOperation({ summary: 'Auto close expired jobs (Internal Use Only)' })
  @RequireApiKey()
  async autoClose(): Promise<AutoCloseResponse> {
    return this.medimatchJobUsecase.autoCloseJobs()
  }

  @Post('/schedule-start')
  async scheduleStart(): Promise<ScheduleStart> {
    return this.medimatchJobUsecase.scheduleStartJobs()
  }

  @Post('/auto-switch-audience')
  @RequireApiKey()
  async autoSwitchAudience(): Promise<AutoSwitchAudience> {
    return this.medimatchJobUsecase.autoSwitchAudience()
  }

  @Post('/users/:userId/rematch')
  @ApiOperation({ summary: 'Trigger rematch for a user (Internal Use Only)' })
  @RequireApiKey()
  async triggerRematch(@Param('userId', ParsePositiveIntPipe) userId: number): Promise<TriggerRematchResponse> {
    return this.userRematchUsecase.triggerRematch(userId)
  }

  @Post('/switch-to-former-worker')
  @ApiOperation({ summary: 'Timed switch part_time → former_worker (Internal Use Only)' })
  @RequireApiKey()
  async switchToFormerWorker(): Promise<SwitchToFormerWorker> {
    return this.medimatchJobUsecase.switchPartTimeToFormerWorker()
  }

}

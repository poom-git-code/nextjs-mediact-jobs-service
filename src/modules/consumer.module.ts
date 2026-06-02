import { Module } from '@nestjs/common'
import { ConsumerController } from '../app/controllers/consumer.controller'
import { ConsumerUsecase } from '../app/usecases/consumer.usecase'
import { RecipientGeneratorService } from '../app/services/recipient-generator.service'
import { UserReadRepository } from '../app/repositories/user.repository'
import { JobReadRepository, JobRepository } from '../app/repositories/job.repository'
import { JobBatchRepository } from '../app/repositories/job-batch.repository'
import { JobMatchedUsersRepository } from '../app/repositories/job-matched-users.repository'
import { JobMatchService } from '../app/services/job-match.service'
import { NotificationService } from '../app/external-services/notification.service'
import { JobApplyReadRepository } from '../app/repositories/job-apply.repository'
import { UserRematchService } from '../app/services/user-rematch.service'
import { UserMatchSettingReadRepository } from '../app/repositories/user-match-setting.repository'
import { JobAutoMatchUserOffersRepository } from '../app/repositories/job-auto-match-user-offers.repository'
import { FitScoreService } from '../app/services/fit-score.service'

@Module({
  imports: [],
  controllers: [],
  providers: [
    ConsumerController,
    ConsumerUsecase,
    RecipientGeneratorService,
    UserReadRepository,
    JobRepository,
    JobBatchRepository,
    JobMatchedUsersRepository,
    JobMatchService,
    NotificationService,
    JobReadRepository,
    JobApplyReadRepository,
    UserRematchService,
    UserMatchSettingReadRepository,
    JobAutoMatchUserOffersRepository,
    FitScoreService,
  ],
  exports: [],
})
export class ConsumerModule {}

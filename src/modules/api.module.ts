import { Module } from '@nestjs/common'
import { ApiController } from '../app/controllers/api.controller'
import { ApiUsecase } from '../app/usecases/api.usecase'
import { UserReadRepository, UserRepository } from '../app/repositories/user.repository'
import { JobReadRepository, JobRepository } from '../app/repositories/job.repository'
import { JobStatusRepository } from '../app/repositories/job-status.repository'
import { JobTypeRepository } from '../app/repositories/job-type.repository'
import { RecipientGeneratorService } from '../app/services/recipient-generator.service'
import { JobsService } from '../app/services/jobs.service'
import { JobBatchRepository } from '../app/repositories/job-batch.repository'
import { NotificationService } from '../app/external-services/notification.service'
import { JobApplyRepository, JobApplyReadRepository } from '../app/repositories/job-apply.repository'
import { ApplicantReviewRepository } from '../app/repositories/applicant-review.repository'
import { JobMatchedUsersRepository } from '../app/repositories/job-matched-users.repository'

@Module({
  imports: [],
  controllers: [ApiController],
  providers: [
    ApiUsecase,
    RecipientGeneratorService,
    UserRepository,
    UserReadRepository,
    JobRepository,
    JobStatusRepository,
    JobTypeRepository,
    JobsService,
    JobReadRepository,
    JobBatchRepository,
    NotificationService,
    JobApplyRepository,
    ApplicantReviewRepository,
    JobApplyReadRepository,
    JobMatchedUsersRepository,
  ],
  exports: [],
})
export class ApiModule {}

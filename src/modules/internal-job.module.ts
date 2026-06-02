import { Module } from '@nestjs/common'
import { InternalJobController } from '../app/controllers/internal.job.controller'
import { JobReadRepository, JobRepository } from '../app/repositories/job.repository'
import { JobSwitchingLogsRepository } from '../app/repositories/job-switching-logs.repository'
import { JobsService } from '../app/services/jobs.service'
import { MedimatchJobUsecase } from '../app/usecases/medimatch.job.usecase'
import { UserRematchUsecase } from '../app/usecases/user-rematch.usecase'
import { PrismaService } from './prisma.module'
import { JobApplyRepository } from '../app/repositories/job-apply.repository'
import { JobMatchedUsersRepository } from '../app/repositories/job-matched-users.repository'
import { UserRepository } from '../app/repositories/user.repository'
import { JobAudienceExhaustedEmailService } from '../app/services/job-audience-exhausted-email.service'
import { JobPendingApprovalEmailService } from '../app/services/job-pending-approval-email.service'
import { JobApprovalResultEmailService } from '../app/services/job-approval-result-email.service'

@Module({
  imports: [],
  controllers: [InternalJobController],
  providers: [
    MedimatchJobUsecase,
    UserRematchUsecase,
    JobRepository,
    JobsService,
    JobReadRepository,
    PrismaService,
    JobApplyRepository,
    JobMatchedUsersRepository,
    JobSwitchingLogsRepository,
    UserRepository,
    JobAudienceExhaustedEmailService,
    JobPendingApprovalEmailService,
    JobApprovalResultEmailService,
  ],
  exports: [],
})
export class InternalJobModule {}

import { Module } from '@nestjs/common'
import { MasterDataController } from '../app/controllers/master-data.controller'
import { MasterDataUsecase } from '../app/usecases/master-data.usecase'
import { JobStatusRepository } from '../app/repositories/job-status.repository'

@Module({
  imports: [],
  controllers: [MasterDataController],
  providers: [MasterDataUsecase, JobStatusRepository],
  exports: [],
})
export class MasterDataModule {}

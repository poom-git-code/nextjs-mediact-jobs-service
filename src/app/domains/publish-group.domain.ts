import { JobPublishGroup } from '@prisma/client'

export enum PublishGroup {
  hospital = 'hospital',
  part_time = 'part-time',
  former_worker = 'former-worker',
  system = 'system',
}

export const SWITCH_MAP: Partial<Record<PublishGroup, PublishGroup>> = {
  [PublishGroup.hospital]: PublishGroup.part_time,
  [PublishGroup.former_worker]: PublishGroup.system,
}

export const PUBLISH_GROUP_TO_PRISMA: Record<PublishGroup, JobPublishGroup> = {
  [PublishGroup.hospital]: JobPublishGroup.hospital,
  [PublishGroup.part_time]: JobPublishGroup.part_time,
  [PublishGroup.former_worker]: JobPublishGroup.former_worker,
  [PublishGroup.system]: JobPublishGroup.system,
}

export class PublishGroupDomain {
  static resolvePublishGroup(group: JobPublishGroup): never | JobPublishGroup {
    if (group === JobPublishGroup.part_time) {
      return 'part_time' as never
    }
    if (group === JobPublishGroup.former_worker) {
      return 'former_worker' as never
    }
    return group as JobPublishGroup
  }
}

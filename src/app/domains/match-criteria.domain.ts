import { plainToInstance } from 'class-transformer'
import { ExperienceRange } from './experience-range.domain'
import { Expose } from 'class-transformer'

export class MatchCriteria {
  @Expose() certificationIds?: number[]
  @Expose() roleId?: number
  @Expose() experience?: ExperienceRange

  static createFromRawJson(json: Record<string, any>) {
    return plainToInstance(MatchCriteria, json)
  }
}

import { Expose } from 'class-transformer'

export class DepartmentJobCriteria {
  @Expose() id: number
  @Expose() province_code: number
  @Expose() category_id: number
  @Expose() sub_category_id: number
  @Expose() certifications: number[]
}

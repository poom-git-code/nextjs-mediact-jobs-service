import { DateUtility } from '../../utilities/dateUtility'

export const timeTransformer = ({ value }) => {
  if (typeof value === 'string' && value.length >= 8) {
    return DateUtility.parseTimeHHmmss(value.slice(0, 8))
  }
  return value
}

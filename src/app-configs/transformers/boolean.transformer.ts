export const booleanTransformer = ({ value }: { value: any }) => {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  return Boolean(value)
}

export const MASKED_SECRET_VALUE = '••••••••'

export function isMaskedSecretValue(value: string): boolean {
  return value === MASKED_SECRET_VALUE
}

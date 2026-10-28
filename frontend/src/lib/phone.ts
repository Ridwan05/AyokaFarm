// Staff sign in with their phone number and a password — no SMS. Behind the scenes each account
// has a placeholder email made from the number; no mail is ever sent to it.
// Keep in sync with backend/scripts/setup.mjs.

const LOGIN_DOMAIN = 'phone.ayokafarm.app'

/** "0811 386 0000" / "+234 811 386 0000" → "2348113860000", or null if it isn't a Nigerian mobile number. */
export function normalisePhone(input: string): string | null {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('0') && d.length === 11) d = '234' + d.slice(1)
  if (d.length === 10 && !d.startsWith('0')) d = '234' + d
  return /^234[789]\d{9}$/.test(d) ? d : null
}

export const loginEmailFor = (normalised: string) => `${normalised}@${LOGIN_DOMAIN}`

/** "2348113860000" → "0811 386 0000" */
export const displayPhone = (normalised: string) => {
  const local = '0' + normalised.slice(3)
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
}

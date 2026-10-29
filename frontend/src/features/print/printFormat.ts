// Formatting for the printable receipt and statement pages.
/** "₦12,500" */
export const money = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`
/** "09/10/2026" */
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

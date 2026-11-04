import { clsx, type ClassValue } from 'clsx'

/** Joins class names, skipping falsy ones. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

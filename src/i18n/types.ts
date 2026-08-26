export type Locale = 'zh' | 'en'
export type LocalePreference = Locale | 'system'

/** Recursively map message tree values to string (structure from zh, values free). */
export type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>
}

export type Messages = DeepStringify<typeof import('./zh').zh>

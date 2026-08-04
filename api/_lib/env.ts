type RuntimeGlobal = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>
  }
}

export function readEnv(name: string) {
  return (globalThis as RuntimeGlobal).process?.env?.[name]
}

export function requireEnv(name: string) {
  const value = readEnv(name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

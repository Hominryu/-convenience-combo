export type ApiRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
}

export type ApiResponse = {
  setHeader(name: string, value: string): void
  status(code: number): {
    json(body: unknown): void
    end(): void
  }
}

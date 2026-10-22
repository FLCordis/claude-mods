export type CacheMark = {
  /** Quando a última resposta da sessão principal chegou (ms desde a época). */
  at: number
  /** Tokens que essa resposta leu do cache. */
  read: number
  /** Tokens que essa resposta escreveu no cache. */
  write: number
}

declare module 'claude-code' {
  interface PluginState {
    'terminal-hud': {
      effort: string | null
      cache: CacheMark | null
      now: number
    }
  }
}

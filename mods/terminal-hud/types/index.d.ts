export type CacheMark = {
  /** Quando a última resposta da sessão principal chegou (ms desde a época). */
  at: number
  /** Tokens que essa resposta leu do cache. */
  read: number
  /** Tokens que essa resposta escreveu no cache. */
  write: number
}

/** Uma janela de limite como o endpoint de uso da conta a descreve. */
export type UsageWindow = {
  /** `five_hour`, `seven_day`, `seven_day_fable`… */
  kind: string
  percentUsed: number
  resetsAt?: string
}

declare module 'claude-code' {
  interface PluginState {
    'terminal-hud': {
      effort: string | null
      /** Modo de permissão em vigor (do último hook clássico), para medir o rótulo do engine na linha. */
      mode: string | null
      cache: CacheMark | null
      now: number
      /** Janelas lidas do endpoint de uso da conta (as por modelo não vêm nos headers da API). */
      windows: UsageWindow[]
      /** Por que a última consulta ao endpoint não rendeu janelas; null quando rendeu. */
      usageNote: string | null
    }
  }
}

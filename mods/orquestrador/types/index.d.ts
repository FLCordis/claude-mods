export type AgentState = 'running' | 'done' | 'failed'

/** Números finais que a tool Agent devolve quando o subagente termina. */
export type AgentFinal = {
  tokens: number
  durationMs: number
  reads: number
  edits: number
  bash: number
}

export type AgentRow = {
  id: string
  /** Quem o criou; ausente para filho direto da sessão principal. */
  parentId?: string
  /** A descrição curta que o orquestrador escreveu no Agent tool. */
  description: string
  /** O tipo do agente (`Explore`, `savvy-heavy`, `code-reviewer`…). */
  type: string
  model: string
  effort?: string
  status: AgentState
  /** ms desde a época. */
  startedAt: number
  endedAt?: number
  /** Quantas tools já chamou. */
  tools: number
  /** A tool em andamento, resumida (`Grep schema.prisma`); ausente entre chamadas. */
  inFlight?: string
  /** Soma de input + output + cache lido + cache escrito de todas as requisições. */
  tokens: number
  /** Contexto da última requisição: input + cache lido + cache escrito. */
  ctxTokens?: number
  final?: AgentFinal
}

declare module 'claude-code' {
  interface PluginState {
    orquestrador: {
      agents: Record<string, AgentRow>
      /** Tipo → índice de cor, na ordem em que cada tipo apareceu. */
      palette: Record<string, number>
      main: { model?: string; effort?: string }
      /** Soma dos agentes concluídos já removidos do painel. */
      totals: { tokens: number; done: number }
      now: number
      /** Agentes que já receberam o aviso de contexto alto. */
      warned: Record<string, true>
      /** Verdadeiro depois que a pessoa fechou o painel com /orq: não reabre sozinho. */
      muted: boolean
    }
  }
}

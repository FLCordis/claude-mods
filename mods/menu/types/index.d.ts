/** As abas do menu, na ordem do cabeçalho. */
export type MenuTab = 'sessao' | 'orquestrador' | 'hud' | 'configs' | 'tema'

/** O que o menu lê de cada agente do orquestrador (subconjunto do contrato daquele mod). */
export type MenuAgentRow = {
  id: string
  parentId?: string
  description: string
  type: string
  model: string
  effort?: string
  status: 'running' | 'done' | 'failed'
  startedAt: number
  endedAt?: number
  tools: number
  tokens: number
  final?: { tokens: number; durationMs: number }
}

/** A marca de cache do terminal-hud (subconjunto do contrato daquele mod). */
export type MenuCacheMark = { at: number; read: number; write: number }

/** Uma janela de limite do terminal-hud (o mesmo formato de `SessionRateLimit`). */
export type MenuUsageWindow = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    menu: {
      /** A aba em exibição. */
      tab: MenuTab
      /** Resultado da última ação, desenhado sob o corpo da aba. */
      note: string | null
      /** Texto do filtro da aba Configs. */
      filter: string
      /** Modo de permissão em vigor, lido dos hooks clássicos. */
      mode: string | null
      /** O effort que o engine mandaria na última requisição da sessão principal. */
      effort: string | null
      /** O effort escolhido no menu: reescreve cada requisição; null segue o do Claude Code. */
      effortChosen: string | null
      /** Contador que força o redesenho depois de uma ação. */
      tick: number
    }
    // Valores de outros mods que o menu só lê (qualquer plugin lê o estado de outro; só o dono
    // grava). Declarados aqui, e não via `dependencies`, para o menu carregar mesmo sem eles.
    orquestrador: {
      agents: Record<string, MenuAgentRow>
      main: { model?: string; effort?: string }
      totals: { tokens: number; done: number }
    }
    'terminal-hud': {
      effort: string | null
      cache: MenuCacheMark | null
      windows: MenuUsageWindow[]
      usageNote: string | null
    }
  }
}

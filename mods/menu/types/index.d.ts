/** As abas do menu, na ordem do cabeçalho. */
export type MenuTab = 'sessao' | 'tema' | 'orquestrador' | 'hud' | 'configs'

/** O filtro claro/escuro da lista de temas. */
export type MenuThemeFilter = 'todos' | 'escuros' | 'claros'

/** O estado do download do catálogo de temas. */
export type MenuThemesStatus = 'idle' | 'loading' | 'ready' | 'error'

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
      /** Se o pane do menu está aberto: só para o botão sob o prompt desenhar ▲ ou ▼. */
      isOpen: boolean
      /** As linhas do /config, relidas ao abrir, ao trocar de aba e depois de cada ação. */
      configRows: ConfigRow[]
      /** Os nomes dos comandos da sessão, relidos junto com as linhas do /config. */
      commands: string[]
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
      /** A busca da aba Tema. */
      themeQuery: string
      /** O filtro claro/escuro da aba Tema. */
      themeFilter: MenuThemeFilter
      /** O primeiro tema da janela da lista. */
      themeScroll: number
      /** Sobe a cada catálogo carregado: o catálogo mora no módulo, e quem desenha lê este número. */
      themesVersion: number
      /** O download do catálogo. */
      themesStatus: MenuThemesStatus
      /** Por que o download falhou. */
      themesError: string | null
      /** O nome do tema guardado, ou null com o tema do próprio Claude Code. */
      themeChosen: string | null
      /** O tema pintado em prévia (o foco parou nele), ainda não guardado. */
      previewSlug: string | null
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

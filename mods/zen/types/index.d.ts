/** Onde um passo está: o Claude manda o plano inteiro a cada mudança. */
export type ZenStepStatus = 'pending' | 'in_progress' | 'completed'

export type ZenStep = { id: string; text: string; status: ZenStepStatus }

/** A tarefa que a faixa acompanha: aberta no começo de cada rodada da sessão principal, fechada no fim. */
export type ZenTask = {
  title: string
  startedAt: number
  /** Quando a rodada terminou; null enquanto o Claude trabalha. */
  doneAt: number | null
  /** A rodada terminou sem resposta (Esc, erro): a faixa diz interrompido, sem forçar 100%. */
  isStopped?: boolean
  steps: ZenStep[]
}

declare module 'claude-code' {
  interface PluginState {
    zen: {
      /** A tarefa em curso (ou a recém-concluída, por alguns segundos); null sem faixa. */
      task: ZenTask | null
      /** O relógio da faixa: o tempo decorrido anda com ele. */
      now: number
      /** A faixa recolhida numa linha. */
      collapsed: boolean
    }
  }
}

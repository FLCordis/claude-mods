// A conta da faixa do Zen e o que o Claude lê sobre ela. Puro, sem `$`.

import type { ZenStep, ZenStepStatus, ZenTask } from '../types'

/** O nome curto da tool; o Claude a chama como `mcp__zen__progress`. */
export const TOOL_NAME = 'progress'
export const TOOL_ID = 'mcp__zen__progress'

/** O que o Claude lê a cada prompt digitado com o Zen ligado (nunca aparece na tela). */
export const INSTRUCTIONS = [
  'Modo Zen ligado: a pessoa vê só as suas mensagens de texto, não as chamadas de tool nem o que elas devolvem.',
  `Ela acompanha o trabalho por uma faixa de progresso alimentada pela tool ${TOOL_ID}.`,
  'Antes de começar, chame-a com o plano em passos curtos. Chame de novo, com a lista inteira, sempre que um passo começar ou terminar:',
  'exatamente um passo in_progress enquanto você trabalha, e todos completed no fim.',
  'Antes de agir, diga numa frase o que vai fazer e por quê.',
].join(' ')

export const TOOL_DESCRIPTION =
  'Atualiza a faixa de progresso do Modo Zen, que a pessoa acompanha no lugar das chamadas de tool. ' +
  'Mande o plano inteiro a cada chamada, cada passo com seu status (pending, in_progress ou completed). ' +
  'Chame ao começar uma tarefa e sempre que um passo começar ou terminar.'

export const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Um nome curto para a tarefa inteira (opcional).' },
    steps: {
      type: 'array',
      description: 'O plano inteiro, em ordem.',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'O passo, em poucas palavras.' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
        },
        required: ['text', 'status'],
      },
    },
  },
  required: ['steps'],
}

const STATUSES: readonly ZenStepStatus[] = ['pending', 'in_progress', 'completed']

export const asStatus = (value: unknown): ZenStepStatus => STATUSES.find(s => s === value) ?? 'pending'

/** Os passos que a tool recebeu, só os que têm texto; o id é a posição. */
export function stepsFrom(raw: unknown, prefix = 'zen'): ZenStep[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item: unknown, i) => {
    const step = item as { text?: unknown; status?: unknown } | null
    const text = typeof step?.text === 'string' ? step.text.trim() : ''
    return text === '' ? [] : [{ id: `${prefix}-${i}`, text, status: asStatus(step?.status) }]
  })
}

/** O título de uma tarefa a partir do prompt: a primeira linha, cortada. */
export function titleFrom(prompt: string, max = 60): string {
  const line = (prompt.trim().split('\n')[0] ?? '').trim()
  if (line === '') return 'Trabalhando'
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/** Quanto da tarefa está feito, de 0 a 100: concluída é 100, sem passos é 0. */
export function percentOf(task: ZenTask): number {
  if (task.doneAt !== null && task.isStopped !== true) return 100
  if (task.steps.length === 0) return 0
  return Math.round((task.steps.filter(s => s.status === 'completed').length / task.steps.length) * 100)
}

/** `Passo 2 de 5`, `Trabalhando…` sem plano, `Concluído` ou `Interrompido` no fim. */
export function stepLabel(task: ZenTask): string {
  if (task.doneAt !== null) return task.isStopped === true ? 'Interrompido' : 'Concluído'
  if (task.steps.length === 0) return 'Trabalhando…'
  const current = task.steps.findIndex(s => s.status === 'in_progress')
  const done = task.steps.filter(s => s.status === 'completed').length
  return `Passo ${Math.min(task.steps.length, (current >= 0 ? current : done) + 1)} de ${task.steps.length}`
}

/** Até `room` passos, com o atual à vista e dois antes dele quando há. */
export function visibleSteps(task: ZenTask, room = 5): ZenStep[] {
  const current = task.steps.findIndex(s => s.status === 'in_progress')
  const from = Math.max(0, Math.min(current - 2, task.steps.length - room))
  return task.steps.slice(from, from + room)
}

/** `42s`, `3m 05s`. */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/** As cores da faixa por opção, como chaves do tema em uso (a faixa segue o tema). */
export const BAND_COLORS: Record<string, string> = {
  acento: 'claude',
  azul: 'suggestion',
  verde: 'success',
  roxo: 'autoAccept',
}

/** O arco-íris do tema em uso, para a barra cheia célula a célula. */
export const RAINBOW = ['rainbow_red', 'rainbow_orange', 'rainbow_yellow', 'rainbow_green', 'rainbow_blue', 'rainbow_indigo', 'rainbow_violet']

/** As fatias cheias da barra: uma cor só, ou o arco-íris repartido pela largura. */
export function barRuns(width: number, percent: number, color: string | 'arco-iris'): { color: string; cells: number }[] {
  const filled = Math.round((width * Math.max(0, Math.min(100, percent))) / 100)
  if (filled === 0) return []
  if (color !== 'arco-iris') return [{ color, cells: filled }]
  return RAINBOW.map((c, i) => {
    const from = Math.floor((width * i) / RAINBOW.length)
    const to = Math.floor((width * (i + 1)) / RAINBOW.length)
    return { color: c, cells: Math.max(0, Math.min(to, filled) - from) }
  }).filter(r => r.cells > 0)
}

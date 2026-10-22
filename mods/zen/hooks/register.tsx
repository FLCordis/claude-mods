import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { ZenStep, ZenTask } from '../types'
import {
  BAND_COLORS,
  INSTRUCTIONS,
  TOOL_DESCRIPTION,
  TOOL_ID,
  TOOL_NAME,
  TOOL_SCHEMA,
  asStatus,
  barRuns,
  elapsed,
  percentOf,
  stepLabel,
  stepsFrom,
  titleFrom,
  visibleSteps,
} from './progress'

const taskAtom = atom({ plugin: 'zen', key: 'task' } as const, null)
const nowAtom = atom({ plugin: 'zen', key: 'now' } as const, 0)
const collapsedAtom = atom({ plugin: 'zen', key: 'collapsed' } as const, false)

/** Quanto tempo o "Concluído" fica na faixa antes de ela sumir. */
const DONE_LINGER_MS = 8000

// O relógio da faixa: anda de segundo em segundo enquanto o Claude trabalha.
let ticker: Timer | undefined

function stopTicker() {
  ticker?.cancel()
  ticker = undefined
}

/** Abre uma tarefa nova na faixa e põe o relógio para andar. */
async function startTask($: EngineInterface, title: string) {
  const startedAt = await $.clock.now()
  const task: ZenTask = { title, startedAt, doneAt: null, steps: [] }
  await update($, taskAtom, () => task)
  await update($, nowAtom, () => startedAt)
  stopTicker()
  ticker = $.clock.every(1000, () => void $.clock.now().then(t => update($, nowAtom, () => t)))
}

/**
 * A tarefa em curso, aberta agora se não há uma (ou se a que está na faixa já terminou): uma
 * rodada sem prompt digitado, como a de uma skill ou de um aviso de tarefa, também tem faixa.
 */
async function ensureTask($: EngineInterface) {
  const task = await read($, taskAtom)
  if (task === null || task.doneAt !== null) await startTask($, 'Trabalhando')
}

/** Troca os passos da tarefa em curso. */
async function setSteps($: EngineInterface, steps: ZenStep[]) {
  await ensureTask($)
  await update($, taskAtom, t => (t === null ? t : { ...t, steps }))
}

export const register: Register = (on, options) => {
  const isOn = options.enabled === true
  const color = typeof options.bandColor === 'string' ? options.bandColor : 'acento'

  on('session.start', async ($, e, next) => {
    // A tool só existe para o Claude com o Zen ligado: desligado, nada muda no prompt dele.
    if (isOn) {
      await $.tool.register({ name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: TOOL_SCHEMA, isDeferred: false })
    } else {
      stopTicker()
      await update($, taskAtom, () => null)
    }
    return next(e)
  })

  // Cada prompt digitado leva as instruções do Zen (lidas pelo Claude, nunca mostradas). A faixa
  // não abre aqui: um prompt digitado com o Claude trabalhando entra na rodada em curso, ou espera
  // a dela; quem abre a tarefa é o começo da rodada.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    const isTyped = e.origin.kind === 'composer' && e.command === undefined && e.isMeta !== true && text !== '' && !text.startsWith('/')
    if (!isOn || !isTyped) return next(e)
    return next({ ...e, context: [...(e.context ?? []), INSTRUCTIONS] })
  }).catch(($, e, next) => next(e))

  // Cada rodada da sessão principal abre uma tarefa nova na faixa, com o prompt como título.
  on('turn.start', async ($, e, next) => {
    if (isOn && e.agentId === undefined) await startTask($, titleFrom(e.text))
    return next(e)
  }).catch(($, e, next) => next(e))

  // A tool do Zen: a cada chamada, o plano inteiro.
  on('tool.call', { tool: TOOL_ID }, async ($, e) => {
    if (!isOn) return { result: 'O Modo Zen está desligado: não há faixa para atualizar.' }
    // A faixa é da sessão principal: um subagente que chame a tool não mexe nela.
    if (e.agentId !== undefined) return { result: 'A faixa do Zen acompanha só a sessão principal; nada mudou.' }
    const input = e as unknown as { title?: unknown; steps?: unknown }
    const steps = stepsFrom(input.steps)
    await ensureTask($)
    const title = typeof input.title === 'string' && input.title.trim() !== '' ? titleFrom(input.title) : null
    const task = await update($, taskAtom, t => (t === null ? t : { ...t, steps, ...(title === null ? {} : { title }) }))
    const done = steps.filter(s => s.status === 'completed').length
    return { result: `Faixa atualizada: ${done} de ${steps.length} passos (${task === null ? 0 : percentOf(task)}%).` }
  })

  // Quando o Claude usa a lista de tarefas do próprio Claude Code, a faixa segue ela também.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    if (isOn && e.agentId === undefined) {
      await setSteps(
        $,
        e.todos.map((todo, i) => ({
          id: `todo-${i}`,
          text: todo.status === 'in_progress' && todo.activeForm !== '' ? todo.activeForm : todo.content,
          status: asStatus(todo.status),
        })),
      )
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    const id = ran.deny === undefined && ran.isError !== true ? (ran.result as { task?: { id?: unknown } } | undefined)?.task?.id : undefined
    if (isOn && e.agentId === undefined && typeof id === 'string') {
      await ensureTask($)
      const step: ZenStep = { id, text: e.subject, status: 'pending' }
      await update($, taskAtom, t => (t === null ? t : { ...t, steps: [...t.steps.filter(s => s.id !== id), step] }))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (!isOn || e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) return ran
    await update($, taskAtom, t => {
      if (t === null) return t
      if (e.status === 'deleted') return { ...t, steps: t.steps.filter(s => s.id !== e.taskId) }
      const steps = t.steps.map(s =>
        s.id === e.taskId ? { ...s, text: e.subject ?? s.text, status: e.status === undefined ? s.status : asStatus(e.status) } : s,
      )
      return { ...t, steps }
    })
    return ran
  }).catch(($, e, next) => next(e))

  // Fim da rodada da sessão principal: a faixa marca concluído (ou interrompido) e some alguns
  // segundos depois.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      stopTicker()
      const task = await read($, taskAtom)
      if (task !== null && task.doneAt === null) {
        const doneAt = await $.clock.now()
        const isStopped = e.reason !== 'answer'
        await update($, taskAtom, t => (t === null ? t : { ...t, doneAt, ...(isStopped ? { isStopped } : {}) }))
        await update($, nowAtom, () => doneAt)
        $.clock.after(DONE_LINGER_MS, () => void update($, taskAtom, t => (t !== null && t.doneAt === doneAt ? null : t)))
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Zen ligado: as linhas das tools não aparecem (um grupo expandido com ctrl+o, sim).
  const hidden = isOn
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => (hidden ? $.ui.resolve(e).Box({ display: 'none' }) : next(e)))
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => (hidden ? $.ui.resolve(e).Box({ display: 'none' }) : next(e)))
  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => (hidden ? $.ui.resolve(e).Box({ display: 'none' }) : next(e)))
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) =>
    hidden && !e.props.isExpanded ? $.ui.resolve(e).Box({ display: 'none' }) : next(e),
  )

  // A faixa acima do prompt, com o que os outros mods desenham ali logo abaixo dela.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isOn || e.props.hasSurvey) return next(e)
    const task = await read($, taskAtom)
    if (task === null) return next(e)
    const [now, collapsed] = await Promise.all([read($, nowAtom), read($, collapsedAtom)])
    const below = await next(e)
    const { Box, Text, Button } = $.ui.resolve(e)

    const tone = BAND_COLORS[color] ?? 'claude'
    const percent = percentOf(task)
    const mark = task.doneAt === null ? '✶' : task.isStopped === true ? '✕' : '✓'
    const columns = Math.max(30, e.props.bodyColumns)
    const toggle = (
      <Button key="zen:collapse" plain dimColor label={collapsed ? '[+]' : '[–]'} onPress={() => update($, collapsedAtom, c => !c)} />
    )
    const bar = (width: number) => {
      const runs = barRuns(width, percent, color === 'arco-iris' ? 'arco-iris' : tone)
      const filled = runs.reduce((n, r) => n + r.cells, 0)
      return (
        <Text>
          {runs.map((r, i) => (
            <Text key={String(i)} color={r.color}>
              {'█'.repeat(r.cells)}
            </Text>
          ))}
          <Text color="subtle" dimColor>
            {'░'.repeat(Math.max(0, width - filled))}
          </Text>
        </Text>
      )
    }
    const pct = <Text color={tone} bold>{`${percent}%`.padStart(4)}</Text>

    if (collapsed) {
      const titleWidth = Math.min(28, task.title.length + 2)
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" borderStyle="round" borderColor={tone} paddingX={1} columnGap={1} width={columns}>
            <Box width={titleWidth} flexShrink={0}>
              <Text color={tone} bold wrap="truncate-end">
                {mark} {task.title}
              </Text>
            </Box>
            {bar(Math.max(8, columns - titleWidth - 16))}
            {pct}
            {toggle}
          </Box>
          {below}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderColor={tone} paddingX={1} width={columns}>
          <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
            <Text color={tone} bold wrap="truncate-end">
              {mark} {task.title}
            </Text>
            <Box flexDirection="row" columnGap={1} flexShrink={0}>
              <Text color="subtle">{elapsed((task.doneAt ?? now) - task.startedAt)}</Text>
              {toggle}
            </Box>
          </Box>
          <Box flexDirection="row" columnGap={1}>
            <Text color="subtle">{stepLabel(task).padEnd(13)}</Text>
            {bar(Math.max(8, columns - 4 - 14 - 6))}
            {pct}
          </Box>
          {visibleSteps(task).map(step => {
            const isNow = step.status === 'in_progress'
            const isPast = step.status === 'completed'
            return (
              <Box key={`zen:step:${step.id}`} flexDirection="row" justifyContent="space-between" columnGap={1}>
                <Text color={isNow ? tone : isPast ? 'text' : 'subtle'} bold={isNow} wrap="truncate-end">
                  {isPast ? '●' : isNow ? '◉' : '○'} {step.text}
                </Text>
                <Text color={isNow ? tone : 'subtle'} dimColor={!isNow}>
                  {isPast ? 'feito' : isNow ? 'agora' : 'depois'}
                </Text>
              </Box>
            )
          })}
          {task.steps.length > 5 && (
            <Text color="subtle" dimColor>
              {task.steps.length} passos no plano
            </Text>
          )}
        </Box>
        {below}
      </Box>
    )
  })
}

import type { ConfigRow, EngineInterface, SessionRateLimit } from 'claude-code'

import type { MenuAgentRow as AgentLike, MenuCacheMark as CacheMark, MenuZenTask } from '../../types'
import { ConfigRows } from '../config-rows'
import { bar, basename, clock, duration, level, limitLabel, prettyModel, tokens } from '../format'
import type { PaneEvent } from '../shell'

/** Quantos pais um agente tem acima dele, até 4. */
export function depthOf(rows: Record<string, { parentId?: string }>, id: string): number {
  let depth = 0
  let parent = rows[id]?.parentId
  while (parent !== undefined && depth < 4) {
    depth += 1
    parent = rows[parent]?.parentId
  }
  return depth
}

const spent = (row: AgentLike) => row.final?.tokens ?? row.tokens

function configSection($: EngineInterface, e: PaneEvent, rows: readonly ConfigRow[]): JSX.Element {
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="subtle">Configuração</Text>
      {rows.length === 0 ? <Text dimColor>sem configuração</Text> : ConfigRows($, e, rows)}
    </Box>
  )
}

/** A aba do orquestrador: a sessão principal, a árvore de agentes e as configs do mod. */
export async function Orquestrador(
  $: EngineInterface,
  e: PaneEvent,
  rows: readonly ConfigRow[],
  commands: readonly string[],
): Promise<JSX.Element> {
  const { Box, Text } = $.ui.resolve(e)
  // O orquestrador só grava `agents` no primeiro subagente; o comando /orq, que ele registra ao
  // iniciar, diz se está carregado antes disso.
  const agentsRead = await $.state.get({ plugin: 'orquestrador', key: 'agents' } as const)
  const loaded = agentsRead.version > 0 || commands.includes('orq')
  const agents = agentsRead.value ?? {}
  if (!loaded) {
    return (
      <Box flexDirection="column">
        <Text dimColor>orquestrador não está carregado</Text>
        {configSection($, e, rows)}
      </Box>
    )
  }
  const [main, totals, model, now] = await Promise.all([
    $.state.get({ plugin: 'orquestrador', key: 'main' } as const).then(r => r.value ?? {}),
    $.state.get({ plugin: 'orquestrador', key: 'totals' } as const).then(r => r.value ?? { tokens: 0, done: 0 }),
    $.session.model(),
    $.clock.now(),
  ])
  const lines = Object.values(agents).sort((a, b) => a.startedAt - b.startedAt)
  const live = lines.filter(l => l.status === 'running').length
  const sessionAgents = totals.done + lines.length
  const sessionTokens = totals.tokens + lines.reduce((sum, l) => sum + spent(l), 0)
  const mainMeta = [prettyModel(main.model ?? model), main.effort].filter(Boolean).join(' · ')

  const agentLine = (row: AgentLike) => {
    const pad = ' '.repeat(depthOf(agents, row.id) * 2)
    if (row.status !== 'running') {
      const failed = row.status === 'failed'
      const cost = row.final
        ? `${tokens(row.final.tokens)} tok · ${duration(row.final.durationMs)}`
        : `${tokens(row.tokens)} tok · ${duration((row.endedAt ?? now) - row.startedAt)}`
      return (
        <Text key={`agent:${row.id}`} wrap="truncate-end" dimColor={!failed}>
          <Text color={failed ? 'error' : 'success'}>
            {pad}
            {failed ? '✖' : '✔'}{' '}
          </Text>
          {row.description}
          <Text color="subtle">
            {'  '}
            {row.type} · {failed ? 'falhou' : 'concluído'} · {cost}
          </Text>
        </Text>
      )
    }
    const meta = [row.type, row.model ? prettyModel(row.model) : undefined, row.effort].filter(Boolean).join(' · ')
    return (
      <Text key={`agent:${row.id}`} wrap="truncate-end">
        <Text color="claude">{pad}● </Text>
        <Text bold>{row.description}</Text>
        <Text color="subtle">
          {'  '}
          {meta}
          {'  '}
          {row.tools} tools · {tokens(row.tokens)} tok · {duration(now - row.startedAt)}
        </Text>
      </Text>
    )
  }

  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text color="claude">● </Text>
        <Text bold>principal</Text>
        <Text color="subtle">
          {'  '}
          {mainMeta}
          {'  '}
          {live} ativo{live === 1 ? '' : 's'}
        </Text>
      </Text>
      {lines.length === 0 && <Text dimColor>nenhum agente ativo</Text>}
      {lines.map(agentLine)}
      <Text color="subtle" dimColor>
        sessão: {sessionAgents} agente{sessionAgents === 1 ? '' : 's'} · {tokens(sessionTokens)} tok
      </Text>
      {configSection($, e, rows)}
    </Box>
  )
}

/**
 * A aba do zen: se está ligado, a tarefa que a faixa acompanha agora e as configs do mod (ligar e
 * desligar, a cor da faixa). Ligar ou desligar recarrega o zen com a opção nova.
 */
export async function Zen($: EngineInterface, e: PaneEvent, rows: readonly ConfigRow[]): Promise<JSX.Element> {
  const { Box, Text } = $.ui.resolve(e)
  const taskRead = await $.state.get({ plugin: 'zen', key: 'task' } as const)
  // As linhas `zen.*` do /config só existem com o mod carregado; a tarefa, depois do primeiro prompt.
  const loaded = rows.length > 0 || taskRead.version > 0
  if (!loaded) {
    return (
      <Box flexDirection="column">
        <Text dimColor>zen não está carregado</Text>
        <Text color="subtle" dimColor wrap="wrap">
          /plugin install zen@flcordis-mods: esconde as chamadas de tool e mostra uma faixa de progresso acima do prompt.
        </Text>
      </Box>
    )
  }
  const isOn = rows.find(r => r.key === 'zen.enabled')?.value === true
  const task: MenuZenTask | null = taskRead.value ?? null
  const now = await $.clock.now()
  const done = task?.steps.filter(s => s.status === 'completed').length ?? 0

  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text color={isOn ? 'success' : 'subtle'} bold>
          {isOn ? '● ligado' : '○ desligado'}
        </Text>
        <Text color="subtle"> · {isOn ? 'as tools somem; a faixa acima do prompt mostra os passos' : 'as tools aparecem como sempre'}</Text>
      </Text>
      {task === null ? (
        <Text color="subtle" dimColor>
          nenhuma tarefa na faixa
        </Text>
      ) : (
        <Text wrap="truncate-end">
          <Text color="claude">{task.doneAt === null ? '✶ ' : '✓ '}</Text>
          <Text bold>{task.title}</Text>
          <Text color="subtle">
            {'  '}
            {task.steps.length === 0 ? 'sem plano' : `${done} de ${task.steps.length} passos`} · {duration((task.doneAt ?? now) - task.startedAt)}
          </Text>
        </Text>
      )}
      {configSection($, e, rows)}
    </Box>
  )
}

/** A aba do hud: modelo, contexto, limites e cache como a régua mostra, e as configs do mod. */
export async function Hud($: EngineInterface, e: PaneEvent, rows: readonly ConfigRow[]): Promise<JSX.Element> {
  const { Box, Text } = $.ui.resolve(e)
  const [effortRead, cacheRead, windowsRead, noteRead] = await Promise.all([
    $.state.get({ plugin: 'terminal-hud', key: 'effort' } as const),
    $.state.get({ plugin: 'terminal-hud', key: 'cache' } as const),
    $.state.get({ plugin: 'terminal-hud', key: 'windows' } as const),
    $.state.get({ plugin: 'terminal-hud', key: 'usageNote' } as const),
  ])
  const loaded = [effortRead, cacheRead, windowsRead, noteRead].some(r => r.version > 0)
  if (!loaded) {
    return (
      <Box flexDirection="column">
        <Text dimColor>terminal-hud não está carregado</Text>
        {configSection($, e, rows)}
      </Box>
    )
  }
  const effort = effortRead.value ?? null
  const cache: CacheMark | null = cacheRead.value ?? null
  const windows: SessionRateLimit[] = windowsRead.value ?? []
  const usageNote = noteRead.value ?? null
  const [model, root, usage, now] = await Promise.all([$.session.model(), $.session.root(), $.session.usage(), $.clock.now()])
  const ttlRow = rows.find(r => r.key === 'terminal-hud.cacheTtlMinutes')
  const ttlMs = (Number(ttlRow?.value) || 60) * 60_000
  const inner = Math.max(20, e.props.bodyColumns - 2)

  const ctx = usage.context
  const ctxPct = ctx.percent ?? 0
  const known = new Set(usage.rateLimits.map(l => l.kind))
  const limits: SessionRateLimit[] = [...usage.rateLimits, ...windows.filter(w => !known.has(w.kind))]

  let cacheLine: JSX.Element
  if (cache === null) {
    cacheLine = (
      <Text>
        <Text color="subtle">cache </Text>
        <Text color="subtle" bold>—</Text>
      </Text>
    )
  } else {
    const left = cache.at + ttlMs - now
    const size = tokens(cache.read + cache.write)
    cacheLine =
      left > 0 ? (
        <Text>
          <Text color="subtle">cache </Text>
          <Text color={left < 5 * 60_000 ? 'warning' : 'success'} bold>{clock(left)}</Text>
          <Text color="subtle"> · {size} tok</Text>
        </Text>
      ) : (
        <Text>
          <Text color="subtle">cache </Text>
          <Text color="error" bold>expirado há {duration(-left)}</Text>
          <Text color="subtle"> · {size} tok a reescrever</Text>
        </Text>
      )
  }

  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text color="claude" bold>{prettyModel(model)}</Text>
        {effort !== null && <Text color="subtle"> {effort}</Text>}
        <Text color="subtle" dimColor> {basename(root)}</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text color="subtle">ctx </Text>
        <Text color={level(ctxPct)}>
          {bar(ctxPct, Math.max(6, Math.min(30, inner - 24)))} {String(ctxPct).padStart(3)}%
        </Text>
        <Text color="subtle">
          {'  '}
          {ctx.tokens === undefined ? '—' : tokens(ctx.tokens)} / {tokens(ctx.window)}
        </Text>
      </Text>
      {limits.length === 0 ? (
        <Text color="subtle" dimColor>{usageNote ?? 'limites aguardando 1ª resposta'}</Text>
      ) : (
        limits.map(limit => {
          const resets = limit.resetsAt ? Date.parse(limit.resetsAt) - now : NaN
          return (
            <Text key={`limit:${limit.kind}`} wrap="truncate-end">
              <Text color="subtle">{limitLabel(limit.kind)} </Text>
              <Text color={level(limit.percentUsed)} bold>{Math.round(limit.percentUsed)}%</Text>
              {Number.isFinite(resets) && <Text color="subtle"> ↻ {duration(resets)}</Text>}
            </Text>
          )
        })
      )}
      {cacheLine}
      {configSection($, e, rows)}
    </Box>
  )
}

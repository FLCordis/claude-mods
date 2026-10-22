import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentFinal, AgentRow, AgentState } from '../types'
import { bar, duration, level, prettyModel, tokens, windowFor } from './format'
import { orderTree, shortTool } from './tree'
import type { TreeLine } from './tree'

const PANE = 'orq'

const agentsAtom = atom({ plugin: 'orquestrador', key: 'agents' } as const, {})
const paletteAtom = atom({ plugin: 'orquestrador', key: 'palette' } as const, {})
const mainAtom = atom({ plugin: 'orquestrador', key: 'main' } as const, {})
const totalsAtom = atom({ plugin: 'orquestrador', key: 'totals' } as const, { tokens: 0, done: 0 })
const nowAtom = atom({ plugin: 'orquestrador', key: 'now' } as const, 0)
const warnedAtom = atom({ plugin: 'orquestrador', key: 'warned' } as const, {})
const mutedAtom = atom({ plugin: 'orquestrador', key: 'muted' } as const, false)

/** Cores do tema, uma por tipo de agente, na ordem em que os tipos aparecem. */
const COLORS = [
  'claude',
  'success',
  'warning',
  'permission',
  'planMode',
  'autoAccept',
  'suggestion',
  'remember',
  'ide',
  'merged',
] as const

/** O que a tool Agent devolve quando o subagente terminou (só o que o painel usa). */
type AgentDone = {
  status: string
  agentId?: string
  totalTokens?: number
  totalDurationMs?: number
  toolStats?: { readCount?: number; editFileCount?: number; bashCount?: number }
}

const spent = (row: AgentRow) => row.final?.tokens ?? row.tokens

// Configuração lida em register(); o módulo recarrega inteiro quando ela muda.
let lingerMs = 30_000
let warnPct = 80
let columns = 48
/** `band`: uma linha por agente na faixa acima do prompt; `pane`: abre o pane sozinho. */
let placement: 'band' | 'pane' = 'band'
let ticks = 0

function patch($: EngineInterface, id: string, fn: (row: AgentRow) => AgentRow) {
  return update($, agentsAtom, all => (all[id] ? { ...all, [id]: fn(all[id]) } : all))
}

/** Dá uma cor ao tipo na primeira vez que ele aparece. */
function paint($: EngineInterface, type: string) {
  return update($, paletteAtom, p => (type in p ? p : { ...p, [type]: Object.keys(p).length }))
}

async function isOpen($: EngineInterface) {
  return (await $.ui.panes()).some(p => p.id === PANE)
}

function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'orquestrador', columns })
}

// ── relógio: durações, reconciliação, limpeza e linha de status ──

async function reconcile($: EngineInterface, now: number) {
  const list = await $.agent.list()
  await update($, agentsAtom, all => {
    const merged = { ...all }
    for (const info of list) {
      const status: AgentState =
        info.status === 'completed' || info.status === 'idle'
          ? 'done'
          : info.status === 'failed' || info.status === 'killed'
            ? 'failed'
            : 'running'
      const parent = info.parentId !== undefined ? { parentId: info.parentId } : {}
      const prev = merged[info.id]
      if (!prev) {
        if (status !== 'running') continue
        merged[info.id] = {
          id: info.id,
          ...parent,
          description: info.description || info.name || info.type,
          type: info.type,
          model: '',
          status: 'running',
          startedAt: now,
          tools: 0,
          tokens: 0,
        }
        continue
      }
      const identity =
        prev.type === 'agente' ? { description: info.description || prev.description, type: info.type, ...parent } : {}
      if (status !== 'running' && prev.status === 'running') {
        merged[info.id] = { ...prev, ...identity, status, endedAt: now }
      } else if (Object.keys(identity).length > 0) {
        merged[info.id] = { ...prev, ...identity }
      }
    }
    return merged
  })
  for (const info of list) await paint($, info.type)
}

async function tick($: EngineInterface) {
  const now = await $.clock.now()
  await update($, nowAtom, () => now)

  ticks += 1
  if (ticks % 5 === 0) await reconcile($, now)

  const all = await read($, agentsAtom)
  const stale = Object.values(all).filter(
    row => row.status !== 'running' && row.endedAt !== undefined && now - row.endedAt > lingerMs,
  )
  if (stale.length > 0) {
    await update($, totalsAtom, t => ({
      tokens: t.tokens + stale.reduce((sum, row) => sum + spent(row), 0),
      done: t.done + stale.length,
    }))
    await update($, agentsAtom, current => {
      const kept = { ...current }
      for (const row of stale) delete kept[row.id]
      return kept
    })
  }

  // Linha de status só quando nada desenha os agentes: a faixa sempre desenha; o pane, só se colocado.
  const live = Object.values(all).filter(row => row.status === 'running')
  if (live.length === 0 || placement === 'band') {
    $.ui.status(undefined)
    return
  }
  const shown = (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced && p.isShown)
  if (shown) {
    $.ui.status(undefined)
    return
  }
  const total = live.reduce((sum, row) => sum + row.tokens, 0)
  $.ui.status(`⚙ ${live.length} agente${live.length === 1 ? '' : 's'} · ${tokens(total)} tok`)
}

export const register: Register = (on, options) => {
  lingerMs = (Number(options.doneLingerSeconds) || 30) * 1000
  warnPct = Number(options.contextWarnPercent) || 80
  columns = Number(options.columns) || 48
  placement = options.placement === 'pane' ? 'pane' : 'band'
  ticks = 0

  // ── ciclo de vida ─────────────────────────────────────────────

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'orq',
      description: 'Abre ou fecha o painel de agentes ativos (orquestrador)',
    })
    $.clock.every(1000, () => void tick($))

    return next(e)
  })

  on('command.run', { command: 'orq' }, async $ => {
    if (await isOpen($)) {
      await $.ui.close({ id: PANE })
      await update($, mutedAtom, () => true)
      return { text: 'Painel do orquestrador fechado. /orq abre de novo.' }
    }
    await update($, mutedAtom, () => false)
    const placed = await openPane($)
    return {
      text: placed.isPlaced
        ? 'Painel do orquestrador aberto.'
        : `Painel do orquestrador aberto, aguardando espaço: ${placed.reason}`,
    }
  })

  // Nasceu um subagente: entra na árvore com descrição, tipo, pai e modelo resolvido.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.agentId === undefined) return result

    const now = await $.clock.now()
    const row: AgentRow = {
      id: result.agentId,
      ...(e.parentAgentId !== undefined ? { parentId: e.parentAgentId } : {}),
      description: e.description,
      type: e.subagentType,
      model: result.model,
      status: 'running',
      startedAt: now,
      tools: 0,
      tokens: 0,
    }
    await update($, agentsAtom, all => ({ ...all, [row.id]: row }))
    await paint($, row.type)
    if (placement === 'pane' && !(await read($, mutedAtom)) && !(await isOpen($))) await openPane($)

    return result
  })

  // Cada requisição ao modelo: effort, modelo e tokens, da sessão principal ou do subagente.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const usage = result.usage
    const effort = e.effort === undefined ? {} : { effort: String(e.effort) }

    if (e.agentId === undefined) {
      await update($, mainAtom, m => ({ ...m, model: e.model, ...effort }))
      return result
    }

    const id = e.agentId
    const used = usage
      ? usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      : 0
    const ctx = usage ? usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens : undefined
    const now = await $.clock.now()
    await update($, agentsAtom, all => {
      // Um passo de agente que não passou por agent.spawn (fork de skill): linha provisória,
      // que o tick completa com $.agent.list().
      const prev: AgentRow = all[id] ?? {
        id,
        description: 'agente',
        type: 'agente',
        model: e.model,
        status: 'running',
        startedAt: now,
        tools: 0,
        tokens: 0,
      }
      const { endedAt: _ended, ...rest } = prev
      const updated: AgentRow = {
        ...rest,
        model: usage?.model ?? e.model,
        ...effort,
        status: 'running',
        tokens: prev.tokens + used,
        ...(ctx === undefined ? {} : { ctxTokens: ctx }),
      }
      return { ...all, [id]: updated }
    })

    if (ctx !== undefined) {
      const pct = Math.round((ctx / windowFor(e.model)) * 100)
      if (pct >= warnPct && !(await read($, warnedAtom))[id]) {
        await update($, warnedAtom, w => ({ ...w, [id]: true as const }))
        const row = (await read($, agentsAtom))[id]
        $.ui.toast(`⚠ ${row?.description ?? id} está em ${pct}% do contexto`)
      }
    }

    return result
  })

  // A tool que o subagente chama agora, e o resultado final da tool Agent do pai.
  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const label = shortTool(e as { tool: string } & Record<string, unknown>)
      await patch($, id, row => ({ ...row, inFlight: label }))
    }

    const ran = await next(e)

    if (id !== undefined) {
      await patch($, id, row => {
        const { inFlight: _flying, ...rest } = row
        return { ...rest, tools: row.tools + 1 }
      })
    }

    if (e.tool === 'Agent' && ran.deny === undefined) {
      const done = ran.result as AgentDone | undefined
      if (done && done.status === 'completed' && done.agentId !== undefined) {
        const final: AgentFinal = {
          tokens: done.totalTokens ?? 0,
          durationMs: done.totalDurationMs ?? 0,
          reads: done.toolStats?.readCount ?? 0,
          edits: done.toolStats?.editFileCount ?? 0,
          bash: done.toolStats?.bashCount ?? 0,
        }
        const now = await $.clock.now()
        await patch($, done.agentId, row => ({
          ...row,
          final,
          status: row.status === 'failed' ? 'failed' : 'done',
          endedAt: row.endedAt ?? now,
        }))
      }
    }

    return ran
  })

  // O subagente terminou a rodada: concluído ou falhou.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      const failed = e.reason !== 'answer'
      const now = await $.clock.now()
      await patch($, id, row => ({ ...row, status: failed ? 'failed' : 'done', endedAt: now }))
      if (failed) {
        const row = (await read($, agentsAtom))[id]
        $.ui.toast(`✖ ${row?.description ?? id} parou: ${e.reason}`)
      }
    }

    return next(e)
  })

  // Reforço pelo hook clássico, caso turn.complete não tenha chegado.
  on('classic.SubagentStop', async ($, e, next) => {
    const now = await $.clock.now()
    await patch($, e.agent_id, row => (row.status === 'running' ? { ...row, status: 'done', endedAt: now } : row))

    return next(e)
  })

  // ── faixa acima do prompt: uma caixa com título, barra e uma linha por agente ──

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || placement !== 'band') return next(e)
    const all = await read($, agentsAtom)
    const lines = orderTree(all)
    if (lines.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const [palette, totals, nowRead] = await Promise.all([read($, paletteAtom), read($, totalsAtom), read($, nowAtom)])
    const now = nowRead || (await $.clock.now())
    const width = Math.max(40, e.props.bodyColumns)
    const inner = width - 4
    const colorOf = (type: string) => COLORS[(palette[type] ?? 0) % COLORS.length]

    const live = lines.filter(l => l.row.status === 'running').length
    const failed = lines.filter(l => l.row.status === 'failed').length
    const finished = lines.length - live
    const sessionTokens = totals.tokens + lines.reduce((sum, l) => sum + spent(l.row), 0)
    const sessionAgents = totals.done + lines.length
    const startedAt = Math.min(...lines.map(l => l.row.startedAt))
    const hot = lines.some(l => {
      const ctx = l.row.ctxTokens
      return l.row.status === 'running' && ctx !== undefined && (ctx / windowFor(l.row.model)) * 100 >= warnPct
    })
    const border = failed > 0 ? 'error' : hot ? 'warning' : 'success'

    /** Texto à esquerda (cortado se faltar espaço) e, opcionalmente, outro à direita. */
    const split = (left: JSX.Element, right?: JSX.Element) => (
      <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          {left}
        </Box>
        {right !== undefined && <Box flexShrink={0}>{right}</Box>}
      </Box>
    )

    // Linhas da caixa: borda (2), título, barra, e uma por agente; o que não cabe vira "+N".
    const room = Math.max(1, e.props.maxRows - 4)
    const shown = lines.slice(0, room)
    const hidden = lines.length - shown.length

    const rowOf = (line: TreeLine) => {
      const { row, depth } = line
      const color = colorOf(row.type)
      const pad = ' '.repeat(Math.min(depth, 4) * 2)
      if (row.status !== 'running') {
        const isFailed = row.status === 'failed'
        const cost = row.final
          ? `${tokens(row.final.tokens)} tok · ${duration(row.final.durationMs)}`
          : `${tokens(row.tokens)} tok · ${duration((row.endedAt ?? now) - row.startedAt)}`
        return (
          <Box key={`band-${row.id}`}>
            {split(
              <Text wrap="truncate-end" dimColor={!isFailed}>
                <Text color={isFailed ? 'error' : 'success'}>{pad}{isFailed ? '✖' : '✔'} </Text>
                <Text>{row.description}</Text>
                <Text color="subtle">  {row.type}</Text>
              </Text>,
              <Text color={isFailed ? 'error' : 'subtle'} dimColor={!isFailed}>
                {isFailed ? 'falhou' : 'concluído'} · {cost}
              </Text>,
            )}
          </Box>
        )
      }
      const meta = [row.type, row.model ? prettyModel(row.model) : undefined, row.effort]
        .filter((x): x is string => x !== undefined && x !== '')
        .join(' · ')
      const flying = row.inFlight !== undefined
      const ctx = row.ctxTokens
      const pct = ctx === undefined ? undefined : Math.min(100, Math.round((ctx / windowFor(row.model)) * 100))
      return (
        <Box key={`band-${row.id}`}>
          {split(
            <Text wrap="truncate-end">
              <Text color={color}>{pad}● </Text>
              <Text bold>{row.description}</Text>
              <Text color="subtle">  {meta}</Text>
            </Text>,
            <Text>
              <Text color={flying ? color : 'subtle'}>{flying ? '▸ ' : '· '}</Text>
              <Text color={flying ? 'text' : 'subtle'}>{row.inFlight ?? 'pensando…'}</Text>
              <Text color="subtle">
                {'  '}
                {row.tools} tools · {duration(now - row.startedAt)} · {tokens(row.tokens)} tok
              </Text>
              {pct !== undefined && (
                <Text color={level(pct)}>
                  {'  '}
                  {bar(pct, 8)} {String(pct).padStart(3)}%
                </Text>
              )}
            </Text>
          )}
        </Box>
      )
    }

    // Barra de progresso: quantos agentes já concluíram, do total à vista.
    const donePct = lines.length === 0 ? 0 : Math.round((finished / lines.length) * 100)
    const progressLabel = `${finished} de ${lines.length} concluído${lines.length === 1 ? '' : 's'} `
    const progressCells = Math.max(8, Math.min(60, inner - progressLabel.length - 6))

    // O que o engine ou outro mod desenha na faixa continua abaixo da caixa.
    const below = await next(e)

    return (
      <Box flexDirection="column">
      <Box flexDirection="column" width={width} borderStyle="round" borderColor={border} paddingX={1}>
        {split(
          <Text wrap="truncate-end">
            <Text color={border}>✻ </Text>
            <Text bold>orquestrador</Text>
            <Text color="subtle">
              {'  '}
              {live} ativo{live === 1 ? '' : 's'} · {finished} concluído{finished === 1 ? '' : 's'}
              {hidden > 0 ? ` · +${hidden} ocultos` : ''}
            </Text>
          </Text>,
          <Text color="subtle">
            {duration(now - startedAt)} · sessão {sessionAgents} agente{sessionAgents === 1 ? '' : 's'} ·{' '}
            {tokens(sessionTokens)} tok
          </Text>,
        )}
        <Text wrap="truncate-end">
          <Text color="subtle" dimColor>{progressLabel}</Text>
          <Text color={border}>{bar(donePct, progressCells)}</Text>
          <Text color="subtle"> {String(donePct).padStart(3)}%</Text>
        </Text>
        {shown.map(rowOf)}
      </Box>
      {below}
      </Box>
    )
  })

  // ── pane com cartões (/orq) ───────────────────────────────────

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const [all, palette, main, totals, nowRead, usage, mainModel] = await Promise.all([
      read($, agentsAtom),
      read($, paletteAtom),
      read($, mainAtom),
      read($, totalsAtom),
      read($, nowAtom),
      $.session.usage(),
      $.session.model(),
    ])
    const now = nowRead || (await $.clock.now())
    const width = Math.max(24, e.props.bodyColumns)
    const lines = orderTree(all)
    const live = lines.filter(l => l.row.status === 'running').length
    const finished = lines.length - live

    const colorOf = (type: string) => COLORS[(palette[type] ?? 0) % COLORS.length]

    /** Uma linha com texto à esquerda (cortado se faltar espaço) e, opcionalmente, outro à direita. */
    const split = (left: JSX.Element, right?: JSX.Element) => (
      <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          {left}
        </Box>
        {right !== undefined && <Box flexShrink={0}>{right}</Box>}
      </Box>
    )

    /** Barra de contexto que ocupa a largura disponível: `ctx ████░░░░ 27%  272k / 1M`. */
    const meter = (ctx: number | undefined, window: number, inner: number, percent?: number) => {
      const pct = percent ?? (ctx === undefined ? 0 : Math.min(100, Math.round((ctx / window) * 100)))
      const label = `${ctx === undefined ? '—' : tokens(ctx)} / ${tokens(window)}`
      const cells = Math.max(6, Math.min(30, inner - 4 - 5 - label.length - 2))
      return (
        <Text wrap="truncate-end">
          <Text color="subtle">ctx </Text>
          <Text color={level(pct)}>
            {bar(pct, cells)} {String(pct).padStart(3)}%
          </Text>
          <Text color="subtle">  {label}</Text>
        </Text>
      )
    }

    // Quantas linhas cada agente ocupa, para caber na altura do painel.
    const rowsOf = (line: TreeLine) =>
      line.row.status !== 'running' ? 1 : line.row.ctxTokens === undefined ? 5 : 6
    const room = Math.max(6, (e.viewport?.rows ?? 24) - 6)
    const shown: TreeLine[] = []
    let used = 0
    for (const line of lines) {
      const need = rowsOf(line)
      if (used + need > room) break
      shown.push(line)
      used += need
    }
    const hidden = lines.length - shown.length

    const agentBlock = (line: TreeLine) => {
      const { row, depth } = line
      const color = colorOf(row.type)
      const indent = Math.min(depth, 4) * 2
      const meta = [row.type, row.model ? prettyModel(row.model) : undefined, row.effort]
        .filter((x): x is string => x !== undefined && x !== '')
        .join(' · ')

      if (row.status !== 'running') {
        const failed = row.status === 'failed'
        const final = row.final
        const stats = final
          ? [`${tokens(final.tokens)} tok`, duration(final.durationMs), `${final.reads} reads · ${final.edits} edits`]
          : [`${tokens(row.tokens)} tok`, duration((row.endedAt ?? now) - row.startedAt), `${row.tools} tools`]
        return (
          <Box key={`done-${row.id}`} marginLeft={indent + 1}>
            {split(
              <Text wrap="truncate-end" dimColor={!failed}>
                <Text color={failed ? 'error' : 'success'}>{failed ? '✖' : '✔'} </Text>
                <Text>{row.description}</Text>
              </Text>,
              <Text color={failed ? 'error' : 'subtle'} dimColor={!failed}>
                {stats.join(' · ')}
              </Text>,
            )}
          </Box>
        )
      }

      const inner = width - indent - 4
      const flying = row.inFlight !== undefined
      return (
        <Box
          key={`card-${row.id}`}
          flexDirection="column"
          borderStyle="round"
          borderColor={color}
          paddingX={1}
          marginLeft={indent}
        >
          {split(
            <Text wrap="truncate-end" bold>
              <Text color={color}>● </Text>
              {row.description}
            </Text>,
            <Text color="subtle">{duration(now - row.startedAt)}</Text>,
          )}
          {split(
            <Text wrap="truncate-end" color="subtle">
              {meta}
            </Text>,
            <Text color="subtle">
              {row.tools} tools · {tokens(row.tokens)} tok
            </Text>,
          )}
          {split(
            <Text wrap="truncate-end">
              <Text color={flying ? color : 'subtle'}>{flying ? '▸ ' : '· '}</Text>
              <Text color={flying ? 'text' : 'subtle'}>{row.inFlight ?? 'pensando…'}</Text>
            </Text>,
            <Text color={flying ? color : 'subtle'}>{flying ? 'tool' : 'modelo'}</Text>,
          )}
          {row.ctxTokens !== undefined && meter(row.ctxTokens, windowFor(row.model), inner)}
        </Box>
      )
    }

    const mainCtx = usage.context
    const mainMeta = [prettyModel(main.model ?? mainModel), main.effort].filter(Boolean).join(' · ')
    const sessionTokens = totals.tokens + lines.reduce((sum, l) => sum + spent(l.row), 0)
    const sessionAgents = totals.done + lines.length

    return (
      <Box flexDirection="column" width={width}>
        {split(
          <Text color="subtle">❯ orquestrador</Text>,
          <Text color="subtle">
            {live} ativo{live === 1 ? '' : 's'} · {finished} concluído{finished === 1 ? '' : 's'}
          </Text>,
        )}
        <Box flexDirection="column" paddingX={1}>
          {split(
            <Text wrap="truncate-end" bold>
              <Text color="claude">● </Text>principal
            </Text>,
            <Text color="subtle">{mainMeta}</Text>,
          )}
          {meter(mainCtx.tokens, mainCtx.window, width - 2, mainCtx.percent)}
        </Box>
        {lines.length === 0 && (
          <Box paddingX={1} marginTop={1}>
            <Text color="subtle" dimColor>
              nenhum agente ativo
            </Text>
          </Box>
        )}
        {shown.map(agentBlock)}
        {hidden > 0 && (
          <Box paddingX={1}>
            <Text color="subtle">+{hidden} ocultos</Text>
          </Box>
        )}
        <Text color="subtle" dimColor>
          {'─'.repeat(width)}
        </Text>
        <Box paddingX={1}>
          {split(
            <Text color="subtle">sessão</Text>,
            <Text color="subtle">
              {sessionAgents} agente{sessionAgents === 1 ? '' : 's'} · {tokens(sessionTokens)} tok
            </Text>,
          )}
        </Box>
      </Box>
    )
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, SessionRateLimit } from 'claude-code'

import type { CacheMark, UsageWindow } from '../types'
import { basename, clock, duration, level, limitLabel, prettyModel, stripHint, tokens } from './format'

const effortAtom = atom({ plugin: 'terminal-hud', key: 'effort' } as const, null)
const cacheAtom = atom({ plugin: 'terminal-hud', key: 'cache' } as const, null)
const nowAtom = atom({ plugin: 'terminal-hud', key: 'now' } as const, 0)
const windowsAtom = atom({ plugin: 'terminal-hud', key: 'windows' } as const, [])
const usageNoteAtom = atom({ plugin: 'terminal-hud', key: 'usageNote' } as const, null)

/** Abaixo disso o cache fica amarelo: falta pouco para expirar. */
const CACHE_WARN_MS = 5 * 60_000

/** O endpoint que o `/usage` do Claude Code consulta: traz as janelas por modelo. */
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const USAGE_POLL_MS = 60_000

/**
 * Lê as janelas do corpo do endpoint de uso: cada chave cujo valor tem
 * `utilization` numérico vira uma janela (`five_hour`, `seven_day`, `seven_day_fable`…).
 */
export function parseUsage(text: string): UsageWindow[] {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return []
  }
  if (body === null || typeof body !== 'object') return []
  const out: UsageWindow[] = []
  for (const [kind, value] of Object.entries(body as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object') continue
    const { utilization, resets_at } = value as { utilization?: unknown; resets_at?: unknown }
    if (typeof utilization !== 'number') continue
    out.push({
      kind,
      percentUsed: Math.round(utilization * 10) / 10,
      ...(typeof resets_at === 'string' ? { resetsAt: resets_at } : {}),
    })
  }
  return out
}

/** Consulta o endpoint de uso com a credencial da sessão; sem credencial ou com erro, anota o motivo. */
async function pollUsage($: EngineInterface) {
  const auth = await $.session.authorize()
  if (auth === null) {
    await update($, usageNoteAtom, () => 'sem credencial da conta')
    return
  }
  try {
    const res = await $.http.fetch(USAGE_URL, {
      auth: auth.handle,
      headers: { accept: 'application/json', 'anthropic-beta': 'oauth-2025-04-20' },
    })
    if (!res.ok) {
      await update($, usageNoteAtom, () => `uso: HTTP ${res.status}`)
      return
    }
    const windows = parseUsage(res.text)
    if (windows.length === 0) {
      const keys = Object.keys((JSON.parse(res.text) as Record<string, unknown>) ?? {}).join(',')
      await update($, usageNoteAtom, () => `uso sem janelas: ${keys || 'corpo vazio'}`)
      return
    }
    await update($, windowsAtom, () => windows)
    await update($, usageNoteAtom, () => null)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await update($, usageNoteAtom, () => `uso: ${reason.slice(0, 60)}`)
  }
}

export const register: Register = (on, options) => {
  const ttlMs = (Number(options.cacheTtlMinutes) || 60) * 60_000

  on('session.start', async ($, e, next) => {
    // Effort antes da primeira resposta: o que a sessão já tem configurado.
    if ((await read($, effortAtom)) === null) {
      const settings = (await $.settings.read()) as { effortLevel?: unknown }
      const initial = (await $.env.get('CLAUDE_EFFORT')) ?? settings.effortLevel
      if (typeof initial === 'string' && initial !== '') {
        await update($, effortAtom, () => initial)
      }
    }

    // Relógio do HUD: redesenha as contagens regressivas a cada segundo.
    const tick = async () => {
      const t = await $.clock.now()
      await update($, nowAtom, () => t)
    }
    await tick()
    $.clock.every(1000, () => void tick())

    // Janelas por modelo: o endpoint de uso da conta, de minuto em minuto.
    void pollUsage($)
    $.clock.every(USAGE_POLL_MS, () => void pollUsage($))

    return next(e)
  })

  // Cada requisição da sessão principal renova o cache do prefixo: marca a hora e o tamanho.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)

    if (e.agentId === undefined) {
      if (e.effort !== undefined) {
        const effort = String(e.effort)
        await update($, effortAtom, () => effort)
      }
      if (result.usage) {
        const mark: CacheMark = {
          at: await $.clock.now(),
          read: result.usage.cache_read_input_tokens,
          write: result.usage.cache_creation_input_tokens,
        }
        await update($, cacheAtom, () => mark)
      }
    }

    return result
  })

  // A linha de dica sob o prompt vira a régua da sessão, com a dica do engine na frente.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    // O que os outros mods desenham nesta linha (o botão do menu) vem depois da régua. A régua já
    // traz a dica, então quem está abaixo recebe a dica vazia. Sem outro mod abaixo, o que volta é
    // o nó do próprio engine: ele fica de fora, porque ocupa a linha inteira (a régua sumiria) e
    // traz a dica dele de novo.
    let tail: RenderElement | null = null
    try {
      tail = await next({ ...e, props: { ...e.props, hint: '' } })
    } catch {
      tail = null
    }
    if (tail?.type === 'engine') tail = null

    const now = (await read($, nowAtom)) || (await $.clock.now())
    const [effort, cache, windows, usageNote, model, root, usage] = await Promise.all([
      read($, effortAtom),
      read($, cacheAtom),
      read($, windowsAtom),
      read($, usageNoteAtom),
      $.session.model(),
      $.session.root(),
      $.session.usage(),
    ])

    const { Box, Text } = $.ui.resolve(e)
    // Grupos separados por uma barra fina; dentro do grupo, ponto.
    const bar = <Text color="subtle" dimColor>  │  </Text>
    const dot = <Text color="subtle"> · </Text>

    // O modo de permissão já é desenhado pelo Claude Code no início desta linha (`⏵⏵ bypass
    // permissions on`), fora da dica; a régua só tira o lembrete do atalho para não repetir.
    const hint = stripHint(e.props.hint)

    // ── sessão: modelo, effort e projeto ──────────────────────
    const sessionPart = (
      <Text>
        <Text color="claude" bold>{prettyModel(model)}</Text>
        {effort === null ? null : <Text color="subtle"> {effort}</Text>}
        <Text color="subtle" dimColor> {basename(root)}</Text>
      </Text>
    )

    // ── contexto ──────────────────────────────────────────────
    const ctx = usage.context
    const ctxPct = ctx.percent ?? 0
    const contextPart = (
      <Text>
        <Text color="subtle">ctx </Text>
        <Text color={level(ctxPct)} bold>{ctx.percent === undefined ? '—' : `${ctxPct}%`}</Text>
        <Text color="subtle"> {ctx.tokens === undefined ? '—' : tokens(ctx.tokens)}/{tokens(ctx.window)}</Text>
      </Text>
    )

    // ── limites: toda janela que a API mandar ─────────────────
    const limitPart = (limit: SessionRateLimit) => {
      const resets = limit.resetsAt ? Date.parse(limit.resetsAt) - now : NaN
      return (
        <Text key={limit.kind}>
          <Text color="subtle">{limitLabel(limit.kind)} </Text>
          <Text color={level(limit.percentUsed)} bold>{Math.round(limit.percentUsed)}%</Text>
          {Number.isFinite(resets) ? <Text color="subtle"> ↻ {duration(resets)}</Text> : null}
        </Text>
      )
    }
    // Os headers da última resposta (5h e semanal) mandam; o endpoint acrescenta as janelas
    // que eles não trazem, como a semanal por modelo.
    const known = new Set(usage.rateLimits.map(l => l.kind))
    const merged: SessionRateLimit[] = [...usage.rateLimits, ...windows.filter(w => !known.has(w.kind))]
    const limits = merged.length === 0
      ? [
          <Text key="none" color="subtle">
            {usageNote === null ? 'limites aguardando 1ª resposta' : usageNote}
          </Text>,
        ]
      : merged.map(limitPart)

    // ── cache: rótulo, valor colorido e tamanho, como os outros grupos ──
    let cachePart: JSX.Element
    if (cache === null) {
      cachePart = (
        <Text>
          <Text color="subtle">cache </Text>
          <Text color="subtle" bold>—</Text>
        </Text>
      )
    } else if (e.props.isWorking) {
      cachePart = (
        <Text>
          <Text color="subtle">cache </Text>
          <Text color="success" bold>renovando</Text>
        </Text>
      )
    } else {
      const left = cache.at + ttlMs - now
      const size = tokens(cache.read + cache.write)
      if (left > 0) {
        const tone = left < CACHE_WARN_MS ? 'warning' : 'success'
        cachePart = (
          <Text>
            <Text color="subtle">cache </Text>
            <Text color={tone} bold>{clock(left)}</Text>
            <Text color="subtle"> · {size} tok</Text>
          </Text>
        )
      } else {
        cachePart = (
          <Text>
            <Text color="subtle">cache </Text>
            <Text color="error" bold>expirado há {duration(-left)}</Text>
            <Text color="subtle"> · {size} tok a reescrever</Text>
          </Text>
        )
      }
    }

    // Os limites ficam juntos num grupo só, separados por ponto.
    const limitsGroup = (
      <Text>
        {limits.map((part, i) => (
          <Text key={String(i)}>
            {i > 0 ? dot : null}
            {part}
          </Text>
        ))}
      </Text>
    )

    const groups: JSX.Element[] = [
      ...(hint === '' ? [] : [<Text key="hint" color="subtle" dimColor>{hint}</Text>]),
      sessionPart,
      contextPart,
      limitsGroup,
      cachePart,
    ]

    // Sem largura fixa: o engine já desenha o indicador de modo nesta linha e sabe quanto sobra.
    // Uma linha só: só a régua encolhe (cortada no fim); o que vem depois (o botão do menu) fica
    // inteiro e ocupa o resto da linha.
    return (
      <Box flexDirection="row" flexGrow={1}>
        <Box flexShrink={1} overflow="hidden">
          <Text wrap="truncate-end">
            {groups.map((group, i) => (
              <Text key={String(i)}>
                {i > 0 ? bar : null}
                {group}
              </Text>
            ))}
          </Text>
        </Box>
        {tail !== null && (
          <Box flexGrow={1} flexShrink={0}>
            {tail}
          </Box>
        )}
      </Box>
    )
  })
}

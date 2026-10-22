import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit } from 'claude-code'

import type { CacheMark } from '../types'
import { bar, basename, clock, duration, level, prettyModel, tokens } from './format'

const effortAtom = atom({ plugin: 'terminal-hud', key: 'effort' } as const, null)
const cacheAtom = atom({ plugin: 'terminal-hud', key: 'cache' } as const, null)
const nowAtom = atom({ plugin: 'terminal-hud', key: 'now' } as const, 0)

/** Abaixo disso o cache fica amarelo: falta pouco para expirar. */
const CACHE_WARN_MS = 5 * 60_000

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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const now = (await read($, nowAtom)) || (await $.clock.now())
    const effort = await read($, effortAtom)
    const cache = await read($, cacheAtom)
    const [model, root, usage] = await Promise.all([
      $.session.model(),
      $.session.root(),
      $.session.usage(),
    ])

    const { Box, Text } = $.ui.resolve(e)

    // Um bloco com borda arredondada e um título de prompt, como uma janelinha de terminal.
    const block = (title: string, border: string, body: JSX.Element) => (
      <Box borderStyle="round" borderColor={border} paddingX={1} flexDirection="column">
        <Text color="subtle">❯ {title}</Text>
        {body}
      </Box>
    )

    // ── sessão ────────────────────────────────────────────────
    const session = block(
      'sessão',
      'subtle',
      <Box flexDirection="column">
        <Text>
          <Text color="claude" bold>{prettyModel(model)}</Text>
          <Text color="subtle"> · effort </Text>
          <Text bold>{effort ?? '—'}</Text>
        </Text>
        <Text>
          <Text color="subtle">proj </Text>
          <Text color="suggestion">{basename(root)}</Text>
        </Text>
      </Box>,
    )

    // ── contexto ──────────────────────────────────────────────
    const ctx = usage.context
    const ctxPct = ctx.percent ?? 0
    const context = block(
      'contexto',
      'subtle',
      <Box flexDirection="column">
        <Text>
          <Text bold>{ctx.tokens === undefined ? '—' : tokens(ctx.tokens)}</Text>
          <Text color="subtle"> / {tokens(ctx.window)}</Text>
        </Text>
        <Text color={level(ctxPct)}>
          {bar(ctxPct)} {ctx.percent === undefined ? '' : `${ctxPct}%`}
        </Text>
      </Box>,
    )

    // ── uso: janela de 5h e semanal ───────────────────────────
    const limitLine = (label: string, limit: SessionRateLimit | undefined) => {
      if (!limit) return <Text color="subtle">{label} aguardando 1ª resposta</Text>
      const resets = limit.resetsAt ? Date.parse(limit.resetsAt) - now : NaN
      return (
        <Text>
          <Text color="subtle">{label} </Text>
          <Text color={level(limit.percentUsed)}>
            {bar(limit.percentUsed, 8)} {limit.percentUsed}%
          </Text>
          <Text color="subtle"> ↻ {Number.isFinite(resets) ? duration(resets) : '—'}</Text>
        </Text>
      )
    }
    const byKind = (kind: string) => usage.rateLimits.find(l => l.kind === kind)
    const limits = block(
      'uso',
      'subtle',
      <Box flexDirection="column">
        {limitLine('5h ', byKind('five_hour'))}
        {limitLine('sem', byKind('seven_day'))}
      </Box>,
    )

    // ── cache ─────────────────────────────────────────────────
    let cacheBlock: JSX.Element
    if (cache === null) {
      cacheBlock = block(
        'cache',
        'subtle',
        <Box flexDirection="column">
          <Text color="subtle">sem cache ainda</Text>
          <Text color="subtle">TTL {duration(ttlMs)}</Text>
        </Box>,
      )
    } else if (e.props.isWorking) {
      cacheBlock = block(
        'cache',
        'success',
        <Box flexDirection="column">
          <Text color="success">● renovando</Text>
          <Text color="subtle">{tokens(cache.read + cache.write)} tok</Text>
        </Box>,
      )
    } else {
      const left = cache.at + ttlMs - now
      const size = tokens(cache.read + cache.write)
      const tone = left < CACHE_WARN_MS ? 'warning' : 'success'
      cacheBlock =
        left > 0
          ? block(
              'cache',
              tone,
              <Box flexDirection="column">
                <Text color={tone} bold>⏱ expira em {clock(left)}</Text>
                <Text color="subtle">{size} tok em cache</Text>
              </Box>,
            )
          : block(
              'cache',
              'error',
              <Box flexDirection="column">
                <Text color="error" bold>✖ EXPIRADO há {duration(-left)}</Text>
                <Text color="error">próximo prompt reescreve {size} tok</Text>
              </Box>,
            )
    }

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1} width={e.props.bodyColumns}>
        {session}
        {context}
        {limits}
        {cacheBlock}
      </Box>
    )
  })
}

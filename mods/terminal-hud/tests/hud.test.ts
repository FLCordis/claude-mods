import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const HINT = {
  plugin: 'terminal-hud',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  viewport: { columns: 200, rows: 40, isFullscreen: true },
} as const

const SURFACES = ['terminal', 'desktop'] as const
const T0 = Date.parse('2026-10-22T12:00:00Z')

/** O mundo abaixo do mod: modelo, projeto, contexto, limites (com uma janela extra do Fable) e uma resposta com cache. */
function world(on: On) {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.root', () => ({ value: 'D:\\Trabalho' }))
  on('session.usage', () => ({ value: {
    startedAt: T0,
    context: { tokens: 84_000, window: 200_000, percent: 42 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 37, resetsAt: '2026-10-22T14:30:00Z' },
      { kind: 'seven_day', percentUsed: 92, resetsAt: '2026-10-25T12:00:00Z' },
    ],
  } }))
  on('turn.step', async function* (_$, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'ok',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: {
        model: 'claude-opus-5-5',
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 80_000,
        cache_creation_input_tokens: 4_000,
      },
    }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: {} }))
  on('env.get', () => ({ value: undefined }))
  // O endpoint de uso da conta, com a credencial da sessão: traz a janela do Fable.
  on('session.authorize', () => ({ value: { handle: 'h1', kind: 'bearer' as const } }))
  on('http.fetch', (_$, e) => ({
    value: {
      status: 200,
      ok: e.init?.auth === 'h1',
      headers: {},
      text: JSON.stringify({
        five_hour: { utilization: 37, resets_at: '2026-10-22T14:30:00Z' },
        seven_day: { utilization: 19, resets_at: '2026-10-25T12:00:00Z' },
        seven_day_fable: { utilization: 20.4, resets_at: '2026-10-25T12:00:00Z' },
        seven_day_oauth_apps: null,
        extra_usage: { is_enabled: false },
      }),
    },
  }))
}

async function step($: Engine) {
  const stream = $.turn.step({
    turnId: 't1',
    index: 0,
    model: 'claude-opus-5-5',
    effort: 'xhigh',
    messageCount: 1,
  })
  for await (const _ of stream) {
    // só esgota o stream
  }
  return stream.result
}

async function line($: Engine, surface: (typeof SURFACES)[number], isWorking = false) {
  const ui = await $.ui.mount({ ...HINT, props: { ...HINT.props, isWorking }, surface })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  return texts.join('\n')
}

/** O Text colorido cujo texto começa assim (os invólucros sem cor ficam de fora). */
async function coloured(ui: { findAll: (q: { type?: string; text?: RegExp }) => Promise<{ props: Record<string, unknown>; text: string }[]> }, re: RegExp) {
  return (await ui.findAll({ type: 'Text', text: re })).find(t => t.props.color !== undefined)
}

test('uma linha sob o prompt: dica do engine, modelo, contexto, todos os limites e o cache', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  world(on)
  await $.session.start({ cwd: 'C:\proj', surface: 'terminal', isInteractive: true })
  await step($)

  // Antes de qualquer hook clássico o modo é desconhecido.
  await clock.set(T0 + 10 * 60_000)
  for (const surface of SURFACES) {
    const text = await line($, surface)
    expect(text).toMatch(/^\? for shortcuts  │  Opus 5\.5 xhigh Trabalho  │  ctx 42% 84k\/200k  │  5h 37%/)
    expect(text).not.toMatch(/⏵⏵/)
    // Dez minutos depois de T0: 2h20m para o reset das 14:30, 2d23h para o de domingo.
    expect(text).toMatch(/5h 37% ↻ 2h20m · sem 92% ↻ 2d23h/)
    expect(text).toMatch(/sem 92% ↻ 2d23h/)
    // A semanal do Fable vem do endpoint de uso, sem repetir as que os headers já deram.
    expect(text).toMatch(/sem fable 20%/)
    expect(text).not.toMatch(/sem 19%/)
    expect(text).toMatch(/cache 50:00 · 84k tok/)
  }

  // A dica com o lembrete do atalho perde só o lembrete: o modo em si é o engine que desenha.
  const reminder = { ...HINT.props, hint: '(shift+tab to cycle)' }
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...HINT, props: reminder, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(texts).toMatch(/^Opus 5\.5 xhigh Trabalho  │  ctx 42%/)
    expect(texts).not.toMatch(/shift\+tab|⏵⏵/)
    await ui.unmount()
  }

  // Trabalhando: o cache está sendo renovado.
  for (const surface of SURFACES) {
    expect(await line($, surface, true)).toMatch(/cache renovando/)
  }

  // Faltando 3 minutos: amarelo.
  await clock.set(T0 + 57 * 60_000)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...HINT, surface })
    expect((await coloured(ui, /^03:00/))?.props.color).toBe('warning')
    await ui.unmount()
  }

  // Passou da hora: vermelho, com o tamanho que o próximo prompt vai reescrever.
  await clock.set(T0 + 63 * 60_000)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...HINT, surface })
    expect((await coloured(ui, /^expirado há 3m/))?.props.color).toBe('error')
    expect(await ui.find({ type: 'Text', text: /84k tok a reescrever/ })).toBeDefined()
    await ui.unmount()
  }
})

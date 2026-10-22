import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'terminal-hud',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 160,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
} as const

const T0 = Date.parse('2026-10-22T12:00:00Z')

/** O mundo abaixo do mod: modelo, projeto, contexto, limites e uma resposta com cache. */
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

test('mostra os quatro blocos e o cache fica vermelho ao expirar', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  world(on)
  await step($)

  const SURFACES = ['terminal', 'desktop'] as const

  await clock.set(T0 + 10 * 60_000)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /xhigh/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Trabalho/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /84k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /37%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /92%/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /expira em 50:00/ }))?.props.color).toBe('success')
    await ui.unmount()
  }

  // Faltando 3 minutos: amarelo.
  await clock.set(T0 + 57 * 60_000)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /expira em 03:00/ }))?.props.color).toBe('warning')
    await ui.unmount()
  }

  // Passou da hora: vermelho, avisando que o próximo prompt refaz o cache.
  await clock.set(T0 + 63 * 60_000)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /EXPIRADO há 3m/ }))?.props.color).toBe('error')
    expect(await ui.find({ type: 'Text', text: /reescreve 84k tok/ })).toBeDefined()
    await ui.unmount()
  }
})

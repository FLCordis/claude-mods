import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PANE = {
  plugin: 'orquestrador',
  component: 'Pane',
  requestId: 'orq',
  props: {
    title: 'orquestrador',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
  viewport: { columns: 200, rows: 40, isFullscreen: true },
} as const

const SURFACES = ['terminal', 'desktop'] as const
const T0 = Date.parse('2026-10-22T12:00:00Z')

type World = { toasts: string[]; statuses: (string | undefined)[]; opens: string[] }
type WorldOptions = {
  usage?: Usage
  /** Falso simula um terminal estreito: o pane abre mas não é colocado. */
  placed?: boolean
  /** Roda no meio de cada tool.call, antes de responder: para olhar o painel com a tool em voo. */
  onTool?: () => Promise<void>
}
type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

/** 111k de contexto em 200k (56%), 111.5k gastos por step. */
const USAGE: Usage = { input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 10_000 }

/** O mundo abaixo do mod: sessão principal, spawn que devolve o id, steps com uso e a UI. */
function world(on: On, { usage = USAGE, placed = true, onTool }: WorldOptions = {}): World {
  const w: World = { toasts: [], statuses: [], opens: [] }
  const panes: { id: string; title: string; isShown: boolean; isFocused: boolean; isPlaced: boolean }[] = []
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'orq' } }))
  on('agent.list', () => ({ value: [] }))
  on('ui.panes', () => ({ value: panes }))
  on('ui.open', (_$, e) => {
    w.opens.push(e.id)
    if (!panes.some(p => p.id === e.id)) {
      panes.push({ id: e.id, title: e.title ?? e.id, isShown: placed, isFocused: false, isPlaced: placed })
    }
    return placed ? { value: { isPlaced: true as const } } : { value: { isPlaced: false as const, reason: 'terminal estreito' } }
  })
  on('ui.close', (_$, e) => {
    const at = panes.findIndex(p => p.id === e.id)
    if (at >= 0) panes.splice(at, 1)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    w.statuses.push(e.text)
    return { value: undefined }
  })
  on('session.model', () => ({ value: 'claude-fable-5-1' }))
  on('session.usage', () => ({
    value: {
      startedAt: T0,
      context: { tokens: 84_000, window: 200_000, percent: 42 },
      rateLimits: [],
    },
  }))
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('turn.step', async function* (_$, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { model: e.model, ...usage },
    }
  })
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', async () => {
    await onTool?.()
    return { result: { content: 'ok' } as never, text: 'ok' }
  })
  return w
}

/** Liga o mod: registra o comando e começa o relógio do painel. */
function start($: Engine) {
  return $.session.start({ cwd: 'C:\proj', surface: 'terminal', isInteractive: true })
}

function spawn($: Engine, id: string, description: string, type: string, parentAgentId?: string) {
  return $.agent.spawn({
    tool_use_id: id,
    prompt: 'faça',
    description,
    subagentType: type,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-fable-5-1',
    background: false,
    fork: false,
    ...(parentAgentId === undefined ? {} : { parentAgentId }),
  })
}

async function step($: Engine, agentId: string, effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' = 'high') {
  const stream = $.turn.step({
    turnId: `t-${agentId}`,
    index: 0,
    model: 'claude-sonnet-5-5',
    effort,
    messageCount: 1,
    agentId,
  })
  for await (const _ of stream) {
    // só esgota o stream
  }
  return stream.result
}

function complete($: Engine, agentId: string, reason: 'answer' | 'error' = 'answer') {
  return $.turn.complete({
    answer: 'pronto',
    durationMs: 1000,
    isAborted: false,
    turnId: `t-${agentId}`,
    agentId,
    reason,
  })
}

test('árvore com identidade: descrição, tipo, pai, modelo, effort, tokens e contexto', async ($, on) => {
  mock.clock(on, { now: T0 })
  const w = world(on)
  await start($)

  await spawn($, 'a1', 'backend: API de agenda', 'savvy-heavy')
  await spawn($, 'a2', 'Explorar schema do banco', 'Explore', 'a1')
  await step($, 'a1', 'xhigh')
  await step($, 'a2', 'medium')

  // O primeiro agente abriu o painel sozinho.
  expect(w.opens).toEqual(['orq'])

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const joined = texts.join('\n')

    expect(joined).toMatch(/backend: API de agenda/)
    expect(joined).toMatch(/savvy-heavy · Sonnet 5\.5 · xhigh/)
    expect(joined).toMatch(/Explorar schema do banco/)
    expect(joined).toMatch(/Explore · Sonnet 5\.5 · medium/)
    // 111k de contexto em 200k: 56%, e 111.5k gastos.
    expect(joined).toMatch(/56%/)
    expect(joined).toMatch(/112k tok|111\.5k tok/)
    expect(joined).toMatch(/2 ativos · 0 concluídos/)
    // Principal no topo, com o modelo da sessão.
    expect(joined).toMatch(/principal/)
    expect(joined).toMatch(/Fable 5\.1/)

    // O filho vem depois do pai e com recuo de árvore.
    const parentAt = joined.indexOf('backend: API de agenda')
    const childAt = joined.indexOf('Explorar schema do banco')
    expect(parentAt).toBeLessThan(childAt)
    // Cada agente em andamento é um cartão com a borda na cor do tipo; o filho recua 2 colunas.
    expect((await ui.find({ key: 'card-a1' }))?.props.marginLeft).toBe(0)
    expect((await ui.find({ key: 'card-a2' }))?.props.marginLeft).toBe(2)
    expect((await ui.find({ key: 'card-a1' }))?.props.borderColor).not.toBe(
      (await ui.find({ key: 'card-a2' }))?.props.borderColor,
    )
    await ui.unmount()
  }
})

test('atividade: a tool em andamento aparece e a contagem sobe quando termina', async ($, on) => {
  mock.clock(on, { now: T0 })
  let seenWhileRunning = ''
  world(on, {
    onTool: async () => {
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
      seenWhileRunning = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
      await ui.unmount()
    },
  })
  await start($)
  await spawn($, 'a1', 'backend: API de agenda', 'savvy-heavy')

  await $.tool.call({ tool: 'Grep', pattern: 'agenda', agentId: 'a1' } as never)
  expect(seenWhileRunning).toMatch(/Grep agenda/)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const joined = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(joined).toMatch(/pensando…/)
    expect(joined).toMatch(/1 tools/)
    await ui.unmount()
  }
})

test('conclusão: fica apagado com o custo e some depois do tempo configurado', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  world(on)
  await start($)
  await spawn($, 'a1', 'backend: API de agenda', 'savvy-heavy')
  await spawn($, 'a2', 'Explorar schema do banco', 'Explore', 'a1')
  await step($, 'a2')
  await clock.advance(62_000)
  await complete($, 'a2')

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const joined = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    // Concluído vira uma linha apagada, sem cartão, com o custo à direita.
    expect(joined).toMatch(/✔ Explorar schema do banco/)
    expect(joined).toMatch(/112k tok · 1m02s/)
    expect(await ui.find({ key: 'card-a2' })).toBeUndefined()
    expect(await ui.find({ key: 'done-a2' })).toBeDefined()
    expect(joined).toMatch(/1 ativo · 1 concluído/)
    await ui.unmount()
  }

  // Passados 30 segundos, a linha some e o rodapé guarda o total.
  await clock.advance(31_000)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const joined = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(joined).not.toMatch(/Explorar schema do banco/)
    expect(joined).toMatch(/2 agentes · 112k tok/)
    await ui.unmount()
  }
})

test('falha: marca com ✖ e avisa em toast', async ($, on) => {
  mock.clock(on, { now: T0 })
  const w = world(on)
  await start($)
  await spawn($, 'a1', 'qa: rodar a suíte', 'savvy-light')
  await complete($, 'a1', 'error')

  expect(w.toasts).toEqual(['✖ qa: rodar a suíte parou: error'])
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /✖/ })).toBeDefined()
    expect(await ui.find({ key: 'done-a1' })).toBeDefined()
    expect(await ui.find({ key: 'card-a1' })).toBeUndefined()
    await ui.unmount()
  }
})

test('contexto alto: um toast por agente ao passar do limite', async ($, on) => {
  mock.clock(on, { now: T0 })
  const w = world(on, {
    usage: { input_tokens: 2_000, output_tokens: 100, cache_read_input_tokens: 170_000, cache_creation_input_tokens: 0 },
  })
  await start($)
  await spawn($, 'a1', 'frontend: tela de agenda', 'savvy-medium')
  await step($, 'a1')
  await step($, 'a1')

  expect(w.toasts).toEqual(['⚠ frontend: tela de agenda está em 86% do contexto'])
})

test('sem painel colocado, a linha de status resume os agentes ativos', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, { placed: false })
  await start($)
  await spawn($, 'a1', 'backend: API de agenda', 'savvy-heavy')
  await step($, 'a1')

  await clock.advance(1000)
  expect(w.statuses[w.statuses.length - 1]).toBe('⚙ 1 agente · 112k tok')
})

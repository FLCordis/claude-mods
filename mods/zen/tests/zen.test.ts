import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { INSTRUCTIONS, TOOL_ID, barRuns, percentOf, stepLabel, stepsFrom, titleFrom } from '../hooks/progress'

const ON = { options: { enabled: true } }
const T0 = Date.parse('2026-10-22T12:00:00Z')

const BAND = {
  plugin: 'zen',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 14, bodyColumns: 80, scroll: { offset: 0, bodyRows: 14 }, view: {} },
  viewport: { columns: 85, rows: 40, isFullscreen: true },
  surface: 'terminal',
} as const

/** O mundo abaixo do mod: o que o engine desenharia em cada lugar, e as tools da sessão. */
function world(on: On) {
  const registered: string[] = []
  const contexts: (readonly string[] | undefined)[] = []
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('tool.register', (_$, e) => {
    registered.push(e.name)
    return { value: { tool: `mcp__zen__${e.name}` } }
  })
  on('prompt.submit', (_$, e) => {
    contexts.push(e.context)
    return { text: e.text, ...(e.context === undefined ? {} : { context: e.context }) }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [], newTodos: [] } }))
  // O que o engine desenharia em cada lugar: um texto com o nome do componente.
  on('ui.render', { component: 'AbovePrompt' }, ($$, e) => h($$.ui.resolve(e).Text, {}, 'engine: AbovePrompt') as RenderElement)
  on('ui.render', { component: 'ToolUse' }, ($$, e) => h($$.ui.resolve(e).Text, {}, 'engine: ToolUse') as RenderElement)
  on('ui.render', { component: 'ToolResult' }, ($$, e) => h($$.ui.resolve(e).Text, {}, 'engine: ToolResult') as RenderElement)
  on('ui.render', { component: 'ToolGroup' }, ($$, e) => h($$.ui.resolve(e).Text, {}, 'engine: ToolGroup') as RenderElement)
  on('ui.render', { component: 'ToolProgress' }, ($$, e) => h($$.ui.resolve(e).Text, {}, 'engine: ToolProgress') as RenderElement)
  return { registered, contexts }
}

async function start($: Engine) {
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
}

function typed($: Engine, text: string, turnId?: string) {
  return $.prompt.submit({ text, wait: false, origin: { kind: 'composer' }, ...(turnId === undefined ? {} : { turnId }) })
}

/** Um prompt digitado com a sessão ociosa: ele entra e a rodada dele começa. */
async function turn($: Engine, text: string, turnId = 't1') {
  await typed($, text)
  await $.turn.start({ text, turnId })
}

async function bandText($: Engine) {
  const ui = await $.ui.mount(BAND)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  await ui.unmount()
  return texts
}

test('conta da faixa: passos válidos, título, porcentagem, rótulo e barra', () => {
  const steps = stepsFrom([{ text: 'ler', status: 'completed' }, { text: ' ', status: 'pending' }, { text: 'mudar', status: 'in_progress' }, { text: 'testar' }])
  expect(steps.map(s => [s.text, s.status])).toEqual([
    ['ler', 'completed'],
    ['mudar', 'in_progress'],
    ['testar', 'pending'],
  ])
  const task = { title: 't', startedAt: 0, doneAt: null, steps }
  expect(percentOf(task)).toBe(33)
  expect(stepLabel(task)).toBe('Passo 2 de 3')
  expect(stepLabel({ ...task, steps: [] })).toBe('Trabalhando…')
  expect(percentOf({ ...task, doneAt: 1 })).toBe(100)
  expect(titleFrom('  arrume o bug do fuso\nmais detalhes')).toBe('arrume o bug do fuso')
  expect(titleFrom('x'.repeat(80))).toHaveLength(60)
  expect(barRuns(10, 50, 'claude')).toEqual([{ color: 'claude', cells: 5 }])
  expect(barRuns(14, 100, 'arco-iris').reduce((n, r) => n + r.cells, 0)).toBe(14)
})

test('desligado: nada some, nada é registrado, o prompt passa como veio', async ($, on) => {
  const w = world(on)
  await start($)
  expect(w.registered).toEqual([])
  await typed($, 'oi')
  expect(w.contexts).toEqual([undefined])
  const mounts = [
    $.ui.mount({ plugin: 'zen', component: 'ToolUse', surface: 'terminal', props: { tool_use_id: 'tu1', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false } }),
    $.ui.mount({ plugin: 'zen', component: 'ToolResult', surface: 'terminal', props: { tool_use_id: 'tu1', tool: 'Bash', output: '', isErrored: false } }),
    $.ui.mount({ plugin: 'zen', component: 'ToolProgress', surface: 'terminal', props: { tool_use_id: 'tu1', kind: 'background_hint', hint: 'x' } }),
  ]
  for (const mounting of mounts) {
    const ui = await mounting
    expect(await ui.find({ type: 'Text', text: /^engine: Tool/ })).toBeDefined()
    await ui.unmount()
  }
  expect(await bandText($)).toBe('engine: AbovePrompt')
})

test('ligado: a tool do Zen é registrada no início e as linhas das tools somem (um grupo expandido, não)', ON, async ($, on) => {
  const w = world(on)
  await start($)
  expect(w.registered).toEqual(['progress'])
  const props = { tool_use_id: 'tu1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false }
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'zen', component: 'ToolUse', surface, props })
    expect((await ui.find({ type: 'Box' }))?.props.display).toBe('none')
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeUndefined()
    await ui.unmount()
  }
  const group = (isExpanded: boolean) => $.ui.mount({ plugin: 'zen', component: 'ToolGroup', surface: 'terminal', props: { calls: [], isActive: false, isExpanded } })
  let ui = await group(false)
  expect((await ui.find({ type: 'Box' }))?.props.display).toBe('none')
  await ui.unmount()
  ui = await group(true)
  expect(await ui.find({ type: 'Text', text: 'engine: ToolGroup' })).toBeDefined()
  await ui.unmount()
})

test('ligado: o prompt digitado leva as instruções e a rodada abre a faixa; um comando não', ON, async ($, on) => {
  mock.clock(on, { now: T0 })
  const w = world(on)
  await start($)
  await typed($, '/compact')
  expect(w.contexts).toEqual([undefined])
  expect(await bandText($)).toBe('engine: AbovePrompt')

  await turn($, 'arrume o bug do fuso\ncom detalhes')
  expect(w.contexts[1]).toEqual([INSTRUCTIONS])
  const text = await bandText($)
  expect(text).toMatch(/✶ arrume o bug do fuso/)
  expect(text).toMatch(/Trabalhando…/)
  // O que os outros mods (ou o engine) desenham na faixa continua, abaixo.
  expect(text).toMatch(/engine: AbovePrompt$/)
})

test('a tool do Zen e o TodoWrite movem a faixa; o fim da rodada marca concluído e a faixa some', ON, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  world(on)
  await start($)
  await turn($, 'refatore o menu')
  const ran = await $.tool.call({
    tool: TOOL_ID,
    title: 'Refatorar o menu',
    steps: [
      { text: 'Ler o código', status: 'completed' },
      { text: 'Mudar a moldura', status: 'in_progress' },
      { text: 'Rodar os testes', status: 'pending' },
    ],
  })
  expect(ran.result).toBe('Faixa atualizada: 1 de 3 passos (33%).')
  await clock.advance(65_000)
  let text = await bandText($)
  expect(text).toMatch(/Refatorar o menu/)
  expect(text).toMatch(/Passo 2 de 3/)
  expect(text).toMatch(/33%/)
  expect(text).toMatch(/1m 05s/)
  expect(text).toMatch(/◉ Mudar a moldura\|agora/)

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Ler', status: 'completed', activeForm: 'Lendo' },
      { content: 'Testar', status: 'in_progress', activeForm: 'Testando' },
    ],
  })
  text = await bandText($)
  expect(text).toMatch(/Passo 2 de 2/)
  expect(text).toMatch(/◉ Testando/)

  await $.turn.complete({ reason: 'answer', answer: 'pronto', durationMs: 65_000, isAborted: false, turnId: 't1' })
  text = await bandText($)
  expect(text).toMatch(/✓ Refatorar o menu/)
  expect(text).toMatch(/Concluído/)
  expect(text).toMatch(/100%/)
  await clock.advance(8_000)
  expect(await bandText($)).toBe('engine: AbovePrompt')
})

test('[–] recolhe a faixa numa linha e [+] abre de novo', ON, async ($, on) => {
  mock.clock(on, { now: T0 })
  world(on)
  await start($)
  await turn($, 'tarefa longa')
  await $.tool.call({ tool: TOOL_ID, steps: [{ text: 'um', status: 'in_progress' }, { text: 'dois', status: 'pending' }] })
  const ui = await $.ui.mount(BAND)
  await $.ui.press({ plugin: 'zen', key: 'zen:collapse' })
  let texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(texts).not.toMatch(/◉ um/)
  expect((await ui.find({ key: 'zen:collapse' }))?.props.label).toBe('[+]')
  await $.ui.press({ plugin: 'zen', key: 'zen:collapse' })
  texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(texts).toMatch(/◉ um/)
  await ui.unmount()
})

test('um prompt digitado com o Claude trabalhando não zera a faixa; um subagente não mexe nela', ON, async ($, on) => {
  mock.clock(on, { now: T0 })
  const w = world(on)
  await start($)
  await turn($, 'refatore o menu')
  await $.tool.call({ tool: TOOL_ID, steps: [{ text: 'ler', status: 'completed' }, { text: 'mudar', status: 'in_progress' }] })

  // Digitado por cima da rodada em curso: leva as instruções, mas a faixa segue a mesma.
  await typed($, 'e também o README', 't1')
  expect(w.contexts.at(-1)).toEqual([INSTRUCTIONS])
  let text = await bandText($)
  expect(text).toMatch(/refatore o menu/)
  expect(text).toMatch(/Passo 2 de 2/)

  const fromAgent = await $.tool.call({ tool: TOOL_ID, agentId: 'a1', steps: [{ text: 'do subagente', status: 'in_progress' }] })
  expect(fromAgent.result).toMatch(/só a sessão principal/)
  text = await bandText($)
  expect(text).not.toMatch(/do subagente/)
  expect(text).toMatch(/Passo 2 de 2/)
})

test('rodada interrompida: a faixa diz interrompido, sem marcar 100%', ON, async ($, on) => {
  mock.clock(on, { now: T0 })
  world(on)
  await start($)
  await turn($, 'tarefa')
  await $.tool.call({ tool: TOOL_ID, steps: [{ text: 'um', status: 'completed' }, { text: 'dois', status: 'in_progress' }] })
  await $.turn.complete({ reason: 'aborted', answer: '', durationMs: 1000, isAborted: true, turnId: 't1' })
  const text = await bandText($)
  expect(text).toMatch(/✕ tarefa/)
  expect(text).toMatch(/Interrompido/)
  expect(text).toMatch(/50%/)
  expect(text).not.toMatch(/100%/)
})

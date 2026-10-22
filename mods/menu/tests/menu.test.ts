import { expect, mock, test } from 'claude-code/testing'
import type { ConfigRow } from 'claude-code'

import { BAND, PANE, menu, settingsWritten, start, step, world } from './world'

test('/menu abre o pane com quatro abas; o botão fixo aparece acima do prompt', async ($, on) => {
  const w = world(on)
  await start($)
  const ran = await menu($)
  expect(ran.text).toMatch(/aberto/)
  expect(w.opens[0]).toMatchObject({ id: 'menu', focus: true, closeOnEscape: true })

  const ui = await $.ui.mount(PANE)
  const tabs = (await ui.findAll({ type: 'Button' })).map(b => b.props.label)
  expect(tabs).toEqual(expect.arrayContaining(['1 Sessão', '2 orquestrador', '3 hud', '4 Tema', '5 Configs']))
  expect((await ui.find({ key: 'tab:sessao' }))?.props.hotkey).toBe('1')
  await $.ui.press({ plugin: 'menu', key: 'tab:configs' })
  expect((await ui.find({ key: 'tab:configs' }))?.props.variant).toBe('primary')
  expect(await ui.find({ type: 'Text', text: /esc fecha/ })).toBeDefined()
  await ui.unmount()

  const band = await $.ui.mount(BAND)
  expect(await band.find({ type: 'Button', text: /≡ menu/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /faixa do engine/ })).toBeDefined()
  await band.unmount()

  // Com uma pesquisa na faixa, o mod cede a vez.
  const survey = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } })
  expect(await survey.find({ type: 'Button', text: /≡ menu/ })).toBeUndefined()
  await survey.unmount()
})

test('aba Sessão: modelo via /model, effort só leitura sem /effort, modo padrão no settings.json, modo atual do hook clássico', async ($, on) => {
  const w = world(on, { env: { USERPROFILE: 'C:/Users/x' } })
  await start($)
  await $.classic.UserPromptSubmit({ prompt: 'oi', permission_mode: 'plan' })
  await menu($)

  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'model:fable' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'model:opus' }))?.props.variant).toBe('secondary')
  expect(await ui.find({ type: 'Text', text: /plan · shift\+tab troca/ })).toBeDefined()
  expect(await ui.find({ key: 'effort:high' })).toBeDefined()
  expect((await ui.find({ key: 'default:default' }))?.props.variant).toBe('primary')

  await $.ui.press({ plugin: 'menu', key: 'model:opus' })
  expect(w.runs).toContainEqual({ command: 'model', args: 'opus' })
  expect(await ui.find({ type: 'Text', text: /\/model opus/ })).toBeDefined()

  await $.ui.press({ plugin: 'menu', key: 'default:acceptEdits' })
  const written = settingsWritten(w)
  expect(Object.keys(w.files).some(path => path.endsWith('settings.json.menu.bak'))).toBe(true)
  expect(JSON.parse(written!)).toEqual({ permissions: { defaultMode: 'acceptEdits' } })
  expect(await ui.find({ type: 'Text', text: /modo padrão → accept edits/ })).toBeDefined()
  await ui.unmount()
})

test('aba Sessão: effort grava pela linha do /config quando ela existe', async ($, on) => {
  const w = world(on, {
    config: [
      {
        key: 'effortLevel',
        label: 'Effort level',
        kind: 'choice',
        value: 'medium',
        options: ['low', 'medium', 'high'],
        provider: { plugin: 'engine', tier: 'core' },
        isLocked: false,
      },
    ],
  })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'effort:high' })
  expect(w.sets).toContainEqual({ key: 'effortLevel', value: 'high' })
  expect((await ui.find({ key: 'effort:high' }))?.props.variant).toBe('primary')
  await ui.unmount()
})

test('aba Sessão: o effort escolhido reescreve cada requisição da sessão principal e fica guardado', async ($, on) => {
  const w = world(on)
  await start($)
  await step($, 'medium')
  expect(w.steps).toEqual(['medium'])
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'effort:max' })
  expect((await ui.find({ key: 'effort:max' }))?.props.variant).toBe('primary')
  expect(await ui.find({ type: 'Text', text: /effort → max/ })).toBeDefined()
  expect(w.store.effort).toBe('max')
  await step($, 'medium')
  expect(w.steps).toEqual(['medium', 'max'])
  await ui.unmount()
})

test('effort guardado numa sessão anterior vale desde o início da próxima', async ($, on) => {
  const w = world(on, { store: { effort: 'xhigh' } })
  await start($)
  await step($, 'medium')
  expect(w.steps).toEqual(['xhigh'])
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'effort:xhigh' }))?.props.variant).toBe('primary')
  await ui.unmount()
})

test('comando recusado vira nota', async ($, on) => {
  world(on, { noCommands: true })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'model:haiku' })
  const joined = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  expect(joined).toMatch(/recusado: .*command\.run/)
  await ui.unmount()
})

const ORQ_ROW: ConfigRow = {
  key: 'orquestrador.placement',
  label: 'Onde o painel aparece',
  kind: 'choice',
  value: 'band',
  options: ['band', 'pane'],
  provider: { plugin: 'orquestrador', tier: 'user' },
  isLocked: false,
}
const HUD_ROW: ConfigRow = {
  key: 'terminal-hud.cacheTtlMinutes',
  label: 'Validade do cache (min)',
  kind: 'number',
  value: 60,
  provider: { plugin: 'terminal-hud', tier: 'user' },
  isLocked: false,
}

test('abas de mod: aviso quando o mod não está carregado, e as configs dele editáveis', async ($, on) => {
  const w = world(on, { config: [ORQ_ROW, HUD_ROW] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)

  await $.ui.press({ plugin: 'menu', key: 'tab:orquestrador' })
  expect(await ui.find({ type: 'Text', text: /orquestrador não está carregado/ })).toBeDefined()
  expect(await ui.find({ key: 'cfg:terminal-hud.cacheTtlMinutes' })).toBeUndefined()
  await $.ui.press({ plugin: 'menu', key: 'cfg:orquestrador.placement:pane' })
  expect(w.sets).toContainEqual({ key: 'orquestrador.placement', value: 'pane' })
  expect(await ui.find({ type: 'Text', text: /Onde o painel aparece → pane/ })).toBeDefined()

  await $.ui.press({ plugin: 'menu', key: 'tab:hud' })
  expect(await ui.find({ type: 'Text', text: /terminal-hud não está carregado/ })).toBeDefined()
  expect(await ui.find({ key: 'cfg:orquestrador.placement:pane' })).toBeUndefined()
  await $.ui.input({ plugin: 'menu', key: 'cfg:terminal-hud.cacheTtlMinutes', text: '5' })
  expect(w.sets).toContainEqual({ key: 'terminal-hud.cacheTtlMinutes', value: 5 })
  await $.ui.input({ plugin: 'menu', key: 'cfg:terminal-hud.cacheTtlMinutes', text: 'abc' })
  expect(await ui.find({ type: 'Text', text: /não é um número/ })).toBeDefined()
  await ui.unmount()
})

test('abas de mod: árvore do orquestrador e régua do hud lidas do estado dos mods', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-22T12:00:00Z') })
  world(on)
  on('state.get', (_$, e, next) => {
    if (e.plugin !== 'orquestrador' && e.plugin !== 'terminal-hud') return next(e)
    if (e.plugin === 'orquestrador' && e.key === 'agents') {
      return {
        value: {
          value: {
            a1: { id: 'a1', description: 'backend: API de agenda', type: 'savvy-heavy', model: 'claude-opus-5-5', effort: 'xhigh', status: 'running', startedAt: 0, tools: 9, tokens: 61_000 },
            a2: { id: 'a2', parentId: 'a1', description: 'Explorar schema', type: 'Explore', model: 'claude-sonnet-5-5', status: 'done', startedAt: 0, endedAt: 1000, tools: 3, tokens: 12_000 },
          },
          version: 1,
        },
      }
    }
    if (e.plugin === 'orquestrador' && e.key === 'totals') return { value: { value: { tokens: 400_000, done: 2 }, version: 1 } }
    if (e.plugin === 'terminal-hud' && e.key === 'windows') {
      return { value: { value: [{ kind: 'seven_day_fable', percentUsed: 20.4, resetsAt: '2026-10-25T12:00:00Z' }], version: 1 } }
    }
    if (e.plugin === 'terminal-hud' && e.key === 'cache') return { value: { value: { at: 0, read: 80_000, write: 4_000 }, version: 1 } }
    return { value: { value: undefined, version: 0 } }
  })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)

  await $.ui.press({ plugin: 'menu', key: 'tab:orquestrador' })
  let joined = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(joined).toMatch(/● principal/)
  expect(joined).toMatch(/● backend: API de agenda/)
  expect(joined).toMatch(/savvy-heavy · Opus 5\.5 · xhigh/)
  expect(joined).toMatch(/9 tools · 61k tok/)
  expect(joined).toMatch(/✔ Explorar schema/)
  expect(joined).toMatch(/sessão: 4 agentes · 473k tok/)

  await $.ui.press({ plugin: 'menu', key: 'tab:hud' })
  joined = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(joined).toMatch(/Fable 5\.1/)
  expect(joined).toMatch(/ctx .*1%/)
  expect(joined).toMatch(/sem fable 20%/)
  expect(joined).toMatch(/cache/)
  await ui.unmount()
})

const ENGINE_ROWS: ConfigRow[] = [
  { key: 'verbose', label: 'Verbose', kind: 'boolean', value: false, provider: { plugin: 'engine', tier: 'core' }, isLocked: false },
  { key: 'theme', label: 'Tema', kind: 'choice', value: 'dark', options: ['dark', 'light'], provider: { plugin: 'engine', tier: 'core' }, isLocked: false },
  { key: 'autoCompact', label: 'Auto-compact', kind: 'boolean', value: true, provider: { plugin: 'engine', tier: 'core' }, isLocked: true },
]

test('aba Configs: agrupa por dono, liga uma linha booleana, filtra e abre painéis', async ($, on) => {
  const w = world(on, { config: [...ENGINE_ROWS, HUD_ROW], commands: ['plugins', 'mcp', 'compact'] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:configs' })

  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.indexOf('Claude Code')).toBeGreaterThan(-1)
  expect(texts.indexOf('Claude Code')).toBeLessThan(texts.indexOf('terminal-hud'))
  // Linha travada: só o valor, sem controle.
  expect(await ui.find({ key: 'cfg:autoCompact' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /true 🔒/ })).toBeDefined()

  await $.ui.press({ plugin: 'menu', key: 'cfg:verbose' })
  expect(w.sets).toContainEqual({ key: 'verbose', value: true })
  await $.ui.input({ plugin: 'menu', key: 'cfg:terminal-hud.cacheTtlMinutes', text: '5' })
  expect(w.sets).toContainEqual({ key: 'terminal-hud.cacheTtlMinutes', value: 5 })

  // O filtro reduz a lista pelo rótulo ou pela chave, sem diferenciar maiúsculas.
  await $.ui.input({ plugin: 'menu', key: 'filter', text: 'TEMA', kind: 'change' })
  expect(await ui.find({ key: 'cfg:verbose' })).toBeUndefined()
  expect(await ui.find({ key: 'cfg:theme:light' })).toBeDefined()
  await $.ui.input({ plugin: 'menu', key: 'filter', text: '', kind: 'change' })
  expect(await ui.find({ key: 'cfg:verbose' })).toBeDefined()

  // Painéis: só os comandos que a sessão tem, na ordem da lista do mod.
  const panels = (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('panel:'))
  expect(panels).toEqual(['panel:plugins', 'panel:mcp'])
  await $.ui.press({ plugin: 'menu', key: 'panel:plugins' })
  expect(w.runs).toContainEqual({ command: 'plugins', args: '' })
  expect(w.panes).toEqual([])
  await ui.unmount()
})

test('terminal estreito: cada aba desenha em 56 colunas, com rótulos curtos e o rodapé', async ($, on) => {
  world(on, { config: [...ENGINE_ROWS, ORQ_ROW, HUD_ROW], commands: ['plugins'] })
  await start($)
  await menu($)
  const narrow = {
    ...PANE,
    props: { ...PANE.props, bodyColumns: 56, placement: 'inline' as const, scroll: { offset: 0, bodyRows: 12 } },
    viewport: { columns: 60, rows: 24, isFullscreen: false },
  }
  for (const tab of ['sessao', 'orquestrador', 'hud', 'tema', 'configs']) {
    const ui = await $.ui.mount(narrow)
    await $.ui.press({ plugin: 'menu', key: `tab:${tab}` })
    expect((await ui.find({ key: 'tab:orquestrador' }))?.props.label).toBe('2 orq')
    expect(await ui.find({ type: 'Text', text: /esc fecha/ })).toBeDefined()
    await ui.unmount()
  }
})

test('settings.json: leitura que falha sem ser ausência não grava nada e vira nota', async ($, on) => {
  const w = world(on, { env: { USERPROFILE: 'C:/Users/x' }, noFsRead: true })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'default:plan' })
  expect(Object.keys(w.files)).toEqual([])
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')).toMatch(/recusado: /)
  await ui.unmount()
})

test('settings.json inválido: não grava e a nota mostra o erro', async ($, on) => {
  const w = world(on, { env: { USERPROFILE: 'C:/Users/x' }, settingsText: '{oops' })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'default:plan' })
  expect(Object.keys(w.files)).toEqual([])
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')).toMatch(/recusado: settings\.json inválido/)
  await ui.unmount()
})

test('ação que fecharia o menu: a recusa mantém o menu aberto com a nota', async ($, on) => {
  const w = world(on, { commands: ['plugins'], noCommands: true })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:configs' })
  await $.ui.press({ plugin: 'menu', key: 'panel:plugins' })
  expect(w.panes.map(p => p.id)).toEqual(['menu'])
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')).toMatch(/recusado: /)
  await ui.unmount()
})

test('effort muda mesmo quando a linha do /config recusa: a reescrita da requisição é o que vale', async ($, on) => {
  const w = world(on, {
    noConfigSet: true,
    config: [
      {
        key: 'effortLevel',
        label: 'Effort level',
        kind: 'choice',
        value: 'medium',
        options: ['low', 'medium', 'high'],
        provider: { plugin: 'engine', tier: 'core' },
        isLocked: false,
      },
    ],
  })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'effort:high' })
  expect(w.sets).toEqual([])
  expect((await ui.find({ key: 'effort:high' }))?.props.variant).toBe('primary')
  expect(await ui.find({ type: 'Text', text: /effort → high/ })).toBeDefined()
  await ui.unmount()
})

test('orquestrador instalado e sem agentes: a aba diz que não há agente ativo', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-22T12:00:00Z') })
  world(on, { commands: ['orq'] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:orquestrador' })
  expect(await ui.find({ type: 'Text', text: /orquestrador não está carregado/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /nenhum agente ativo/ })).toBeDefined()
  await ui.unmount()
})

test('a nota da última ação some quando o menu reabre', async ($, on) => {
  world(on)
  await start($)
  await menu($)
  let ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'model:opus' })
  expect(await ui.find({ type: 'Text', text: /\/model opus/ })).toBeDefined()
  await ui.unmount()
  await menu($)
  ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /\/model opus/ })).toBeUndefined()
  await ui.unmount()
})

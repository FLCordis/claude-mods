import { expect, mock, test } from 'claude-code/testing'
import type { ConfigRow } from 'claude-code'

import { HINT, PANE, menu, settingsWritten, start, step, world } from './world'

const SURFACES = ['terminal', 'desktop'] as const

test('/menu abre o pane com as abas, sem segurar os toasts; a aba ativa leva o foco inicial', async ($, on) => {
  const w = world(on)
  await start($)
  const ran = await menu($)
  expect(ran.text).toMatch(/aberto/)
  expect(w.opens[0]).toMatchObject({ id: 'menu', focus: true, closeOnEscape: true })
  expect(w.opens[0]).not.toHaveProperty('holdToasts')

  const ui = await $.ui.mount(PANE)
  const tabs = (await ui.findAll({ type: 'Button' })).map(b => b.props.label)
  expect(tabs).toEqual(expect.arrayContaining(['Sessão', 'Tema', 'Foco', 'Orquestrador', 'Uso', 'Configs']))
  // `esc ×` na ponta da barra de abas fecha o menu, como o Esc.
  expect(tabs).toContain('esc ×')
  // A aba ativa fica numa caixa que se emenda na régua: `╭──╮` em cima, `╯  ╰──` embaixo.
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts[0]).toMatch(/^ ╭─+╮$/)
  expect(texts.find(t => /^─╯ +╰─+$/.test(t))).toBeDefined()
  expect((await ui.find({ key: 'tab:sessao' }))?.props.autoFocus).toBe(true)
  expect((await ui.find({ key: 'tab:tema' }))?.props.autoFocus).toBeUndefined()
  await $.ui.press({ plugin: 'menu', key: 'tab:configs' })
  expect((await ui.find({ key: 'tab:configs' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'tab:configs' }))?.props.autoFocus).toBe(true)
  expect((await ui.find({ key: 'tab:sessao' }))?.props.autoFocus).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /esc fecha/ })).toBeDefined()
  // Com a aba Configs ativa, a caixa se desloca para depois de Sessão, Tema, Foco, Orquestrador e Uso (e a coluna de respiro).
  const left = 1 + 'Sessão'.length + 2 + 'Tema'.length + 2 + 'Foco'.length + 2 + 'Orquestrador'.length + 2 + 'Uso'.length + 2
  const moved = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(moved[0]).toBe(`${' '.repeat(left)}╭${'─'.repeat('◆ Configs'.length + 2)}╮`)
  await $.ui.press({ plugin: 'menu', key: 'menu:close' })
  expect(w.panes).toEqual([])
  await ui.unmount()
})

test('/menu com o nome de uma aba abre direto nela, inclusive pelos nomes antigos e em inglês', async ($, on) => {
  world(on)
  await start($)
  const open = (args: string) => $.command.run({ command: 'menu', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  await open('configs')
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'tab:configs' }))?.props.variant).toBe('primary')
  await open('hud')
  expect((await ui.find({ key: 'tab:uso' }))?.props.variant).toBe('primary')
  await open('zen')
  expect((await ui.find({ key: 'tab:foco' }))?.props.variant).toBe('primary')
  await open('Usage')
  expect((await ui.find({ key: 'tab:uso' }))?.props.variant).toBe('primary')
  await ui.unmount()
})

test('idioma: o seletor no rodapé troca todos os textos, fica guardado e vale na próxima sessão', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-22T12:00:00Z') })
  const w = world(on, { config: [...ZEN_ROWS] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'lang:pt' }))?.props.variant).toBe('primary')
  await $.ui.press({ plugin: 'menu', key: 'lang:en' })
  expect(w.store.lang).toBe('en')
  expect((await ui.find({ key: 'lang:en' }))?.props.variant).toBe('primary')
  const labels = (await ui.findAll({ type: 'Button' })).map(b => b.props.label)
  expect(labels).toEqual(expect.arrayContaining(['Session', 'Theme', 'Focus', 'Orchestrator', 'Usage', 'Settings']))
  let joined = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(joined).toMatch(/Model\|/)
  expect(joined).toMatch(/New sessions start in/)
  expect(joined).toMatch(/esc closes/)
  // A nota de uma ação também sai em inglês.
  await $.ui.press({ plugin: 'menu', key: 'tab:foco' })
  joined = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(joined).toMatch(/○ off/)
  expect(joined).toMatch(/Configuration/)
  await ui.unmount()

  // Próxima sessão: o idioma guardado já vale ao abrir.
  await start($)
  const again = await $.ui.mount(PANE)
  expect((await again.find({ key: 'tab:sessao' }))?.props.label).toBe('Session')
  await again.unmount()
})

test('opção de cor: uma linha por cor com a amostra, e ✓ na escolhida', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-22T12:00:00Z') })
  const w = world(on, { config: [...ZEN_ROWS] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:foco' })
  const verde = await ui.find({ key: 'cfg:zen.bandColor:verde' })
  expect(verde?.props.variant).toBe('secondary')
  expect((await ui.find({ key: 'cfg:zen.bandColor:acento' }))?.props.variant).toBe('primary')
  const swatch = (await ui.findAll({ type: 'Text', text: /■/ })).map(t => t.props.color)
  expect(swatch).toEqual(expect.arrayContaining(['claude', 'suggestion', 'success', 'autoAccept', 'rainbow_red']))
  expect(await ui.find({ type: 'Text', text: /✓/ })).toBeDefined()
  await $.ui.press({ plugin: 'menu', key: 'cfg:zen.bandColor:verde' })
  expect(w.sets).toContainEqual({ key: 'zen.bandColor', value: 'verde' })
  await ui.unmount()
})

test('botão sob o prompt: fica à direita do que vem de baixo, abre e fecha o menu', async ($, on) => {
  const w = world(on)
  await start($)
  for (const surface of SURFACES) {
    const hint = await $.ui.mount({ ...HINT, surface })
    // Abaixo há só o nó do engine: o menu desenha a dica ele mesmo, numa linha, e o nó fica de
    // fora (ele ocupa a linha inteira e traz uma segunda linha com um `·` solto).
    expect(await hint.find({ type: 'Text', text: '? for shortcuts' })).toBeDefined()
    expect(JSON.stringify(await hint.drawn())).not.toContain('"engine"')
    const buttons = await hint.findAll({ type: 'Button' })
    expect(buttons.map(b => b.key)).toEqual(['menu:toggle'])
    expect(buttons[0]?.props.label).toBe('◆ menu ▲')
    await hint.unmount()
  }
  // O mod abaixo (a régua do terminal-hud) recebe o rótulo do botão em `tail` e reserva a largura.
  expect(w.tails).toContain('◆ menu ▲')
  // A dica do engine às vezes vem com uma segunda linha só com o separador: ela some.
  const twoLines = await $.ui.mount({ ...HINT, props: { ...HINT.props, hint: '? for shortcuts\n·' } })
  expect((await twoLines.findAll({ type: 'Text' })).map(t => t.text)).toContain('? for shortcuts')
  expect((await twoLines.findAll({ type: 'Text' })).some(t => t.text.includes('\n'))).toBe(false)
  await twoLines.unmount()

  const hint = await $.ui.mount(HINT)
  // O engine desenha o rótulo de modo numa coluna à esquerda, e o layout do terminal mede uma
  // parte elástica na largura natural dela (o rótulo encolhe, o botão sai da tela). Então a dica
  // tem largura explícita: a linha (120), menos o rótulo (modo padrão do settings.json: só o
  // ` · `, 3), menos o botão (8) e o espaço, e a folga (2); o botão não encolhe.
  const root = (await hint.drawn()) as { props?: Record<string, unknown>; children?: { props?: Record<string, unknown> }[] }
  expect(root.props).toMatchObject({ flexDirection: 'row', columnGap: 1 })
  expect(root.children?.[0]?.props).toMatchObject({ width: 120 - 3 - 9 - 2, flexShrink: 0 })
  expect(root.children?.[1]?.props).toMatchObject({ flexShrink: 0 })
  await $.ui.press({ plugin: 'menu', key: 'menu:toggle' })
  expect(w.panes.map(p => p.id)).toEqual(['menu'])
  expect(w.opens[0]).toMatchObject({ id: 'menu', focus: true, closeOnEscape: true })
  expect((await hint.find({ key: 'menu:toggle' }))?.props.label).toBe('◆ menu ▼')

  await $.ui.press({ plugin: 'menu', key: 'menu:toggle' })
  expect(w.panes).toEqual([])
  expect((await hint.find({ key: 'menu:toggle' }))?.props.label).toBe('◆ menu ▲')

  // Um pane fechado por fora, sem o hook ver (o átomo fica em ▼): o botão abre de novo, não fecha.
  await $.ui.press({ plugin: 'menu', key: 'menu:toggle' })
  w.panes.splice(0)
  await $.ui.press({ plugin: 'menu', key: 'menu:toggle' })
  expect(w.panes.map(p => p.id)).toEqual(['menu'])
  expect(w.opens).toHaveLength(3)
  await hint.unmount()
})

test('a moldura tem a mesma altura em toda aba: o corpo do pane inteiro', async ($, on) => {
  world(on, { config: [...ENGINE_ROWS, ORQ_ROW, HUD_ROW], commands: ['plugins'] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  for (const tab of ['sessao', 'foco', 'orquestrador', 'uso', 'configs']) {
    await $.ui.press({ plugin: 'menu', key: `tab:${tab}` })
    const root = await ui.find({ type: 'Box' })
    expect(root?.props.minHeight).toBe(PANE.props.scroll.bodyRows)
    expect(root?.props.width).toBe(PANE.props.bodyColumns)
  }
  await ui.unmount()
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
  expect(await ui.find({ type: 'Text', text: /o mod orquestrador não está carregado/ })).toBeDefined()
  expect(await ui.find({ key: 'cfg:terminal-hud.cacheTtlMinutes' })).toBeUndefined()
  await $.ui.press({ plugin: 'menu', key: 'cfg:orquestrador.placement:pane' })
  expect(w.sets).toContainEqual({ key: 'orquestrador.placement', value: 'pane' })
  expect(await ui.find({ type: 'Text', text: /Onde o painel aparece → pane/ })).toBeDefined()

  await $.ui.press({ plugin: 'menu', key: 'tab:uso' })
  expect(await ui.find({ type: 'Text', text: /o mod terminal-hud não está carregado/ })).toBeDefined()
  expect(await ui.find({ key: 'cfg:orquestrador.placement:pane' })).toBeUndefined()
  await $.ui.input({ plugin: 'menu', key: 'cfg:terminal-hud.cacheTtlMinutes', text: '5' })
  expect(w.sets).toContainEqual({ key: 'terminal-hud.cacheTtlMinutes', value: 5 })
  await $.ui.input({ plugin: 'menu', key: 'cfg:terminal-hud.cacheTtlMinutes', text: 'abc' })
  expect(await ui.find({ type: 'Text', text: /não é um número/ })).toBeDefined()
  await ui.unmount()
})

test('abas de mod: árvore do orquestrador e régua do Uso lidas do estado dos mods', async ($, on) => {
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

  await $.ui.press({ plugin: 'menu', key: 'tab:uso' })
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
  for (const tab of ['sessao', 'tema', 'foco', 'orquestrador', 'uso', 'configs']) {
    const ui = await $.ui.mount(narrow)
    await $.ui.press({ plugin: 'menu', key: `tab:${tab}` })
    expect((await ui.find({ key: 'tab:orquestrador' }))?.props.label).toBe('Orq')
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

const ZEN_ROWS: ConfigRow[] = [
  { key: 'zen.enabled', label: 'Modo Zen ligado', kind: 'boolean', value: false, provider: { plugin: 'zen', tier: 'user' }, isLocked: false },
  {
    key: 'zen.bandColor',
    label: 'Cor da faixa do Zen',
    kind: 'choice',
    value: 'acento',
    options: ['acento', 'azul', 'verde', 'roxo', 'arco-iris'],
    provider: { plugin: 'zen', tier: 'user' },
    isLocked: false,
  },
]

test('aba Foco: sem o mod, diz como instalar; com ele, liga pelo /config e mostra a tarefa da faixa', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-22T12:01:00Z') })
  const w = world(on, { config: [...ZEN_ROWS, HUD_ROW] })
  let withTask = false
  on('state.get', (_$, e, next) => {
    if (e.plugin !== 'zen') return next(e)
    if (!withTask) return { value: { value: undefined, version: 0 } }
    const task = {
      title: 'Refatorar o menu',
      startedAt: Date.parse('2026-10-22T12:00:00Z'),
      doneAt: null,
      steps: [
        { id: 'a', text: 'ler', status: 'completed' },
        { id: 'b', text: 'mudar', status: 'in_progress' },
      ],
    }
    return { value: { value: task, version: 1 } }
  })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:foco' })
  let joined = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(joined).toMatch(/○ desligado/)
  expect(joined).toMatch(/nenhuma tarefa na faixa/)
  // Só as linhas do zen, não as dos outros mods.
  expect(await ui.find({ key: 'cfg:terminal-hud.cacheTtlMinutes' })).toBeUndefined()
  await $.ui.press({ plugin: 'menu', key: 'cfg:zen.enabled' })
  expect(w.sets).toContainEqual({ key: 'zen.enabled', value: true })
  await $.ui.press({ plugin: 'menu', key: 'cfg:zen.bandColor:verde' })
  expect(w.sets).toContainEqual({ key: 'zen.bandColor', value: 'verde' })

  withTask = true
  await $.ui.press({ plugin: 'menu', key: 'tab:sessao' })
  await $.ui.press({ plugin: 'menu', key: 'tab:foco' })
  joined = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(joined).toMatch(/Refatorar o menu/)
  expect(joined).toMatch(/1 de 2 passos · 1m/)
  await ui.unmount()
})

test('aba Foco sem o mod carregado', async ($, on) => {
  world(on)
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:foco' })
  expect(await ui.find({ type: 'Text', text: /o mod zen não está carregado/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /plugin install zen --marketplace/ })).toBeDefined()
  await ui.unmount()
})

test('orquestrador instalado e sem agentes: a aba diz que não há agente ativo', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-22T12:00:00Z') })
  world(on, { commands: ['orq'] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:orquestrador' })
  expect(await ui.find({ type: 'Text', text: /o mod orquestrador não está carregado/ })).toBeUndefined()
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

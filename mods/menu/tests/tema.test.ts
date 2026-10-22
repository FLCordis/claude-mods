import { expect, mock, test } from 'claude-code/testing'
import type { ConfigRow } from 'claude-code'

import { THEME_TOKENS, toClaudeTheme } from '../hooks/themes/convert'
import { GOGH_URL, parseGogh } from '../hooks/themes/catalog'
import { parseJsonc } from '../hooks/themes/jsonc'
import { WT_SCHEME, withProfileTheme } from '../hooks/themes/wt'
import { PANE, menu, settingsWritten, start, world } from './world'

const HOME = 'C:/Users/x'
const CONFIG = `${HOME}/.claude`
const THEME_FILE = `${CONFIG}/themes/menu.json`
const CATALOG_FILE = `${CONFIG}/menu/gogh-themes.json`

/** Um tema no formato do Gogh: as 16 cores a partir de uma base, fundo e texto. */
function gogh(name: string, variant: 'dark' | 'light' | undefined, background: string, foreground: string) {
  const colors = ['#000000', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#bbbbbb']
  const bright = ['#555555', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']
  const theme: Record<string, string> = { name, background, foreground, cursor: foreground }
  if (variant !== undefined) theme.variant = variant
  ;[...colors, ...bright].forEach((c, i) => (theme[`color_${String(i + 1).padStart(2, '0')}`] = c))
  return theme
}

const CATALOG = JSON.stringify([
  gogh('Nord', 'dark', '#2E3440', '#D8DEE9'),
  gogh('Dracula', 'dark', '#282a36', '#f8f8f2'),
  gogh('Solarized Light', undefined, '#fdf6e3', '#657b83'),
  gogh('Dracula', 'dark', '#000000', '#ffffff'),
  { name: 'Quebrado', background: '#000' },
])

const themeRow = (value: string): ConfigRow => ({
  key: 'theme',
  label: 'Theme',
  kind: 'choice',
  value,
  options: ['dark', 'light'],
  provider: { plugin: 'engine', tier: 'core' },
  isLocked: false,
})

const ENV = { USERPROFILE: HOME }

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')

test('catálogo do Gogh: cores normalizadas, variante pelo campo ou pelo fundo, sem repetidos nem quebrados', () => {
  const list = parseGogh(CATALOG)
  expect(list.map(t => t.slug)).toEqual(['dracula', 'nord', 'solarized-light'])
  expect(list[0]?.background).toBe('#282a36')
  expect(list[1]?.background).toBe('#2e3440')
  expect(list[2]?.variant).toBe('light')
  expect(list[0]?.colors).toHaveLength(16)
})

test('conversor: todo token do tema do Claude Code ganha um hex, e tema claro usa a base light', () => {
  const [dracula, , solarized] = parseGogh(CATALOG)
  const dark = toClaudeTheme(dracula!)
  expect(dark.base).toBe('dark')
  expect(dark.name).toBe('menu: Dracula')
  for (const token of THEME_TOKENS) expect(dark.overrides[token]).toMatch(/^#[0-9a-f]{6}$/)
  expect(Object.keys(dark.overrides).sort()).toEqual([...THEME_TOKENS].sort())
  expect(dark.overrides.text).toBe('#f8f8f2')
  expect(dark.overrides.inverseText).toBe('#282a36')
  expect(toClaudeTheme(solarized!).base).toBe('light')
})

test('JSONC do Windows Terminal: comentários e vírgulas sobrando saem, strings ficam intactas', () => {
  const text = `{
    // comentário
    "$schema": "https://aka.ms/terminal-profiles-schema",
    "profiles": { "list": [ { "commandline": "cmd /c echo ,] // não é comentário", }, ], },
    /* bloco */ "schemes": [],
  }`
  const parsed = parseJsonc(text) as { $schema: string; profiles: { list: { commandline: string }[] } }
  expect(parsed.$schema).toBe('https://aka.ms/terminal-profiles-schema')
  expect(parsed.profiles.list[0]?.commandline).toBe('cmd /c echo ,] // não é comentário')
})

test('esquema do Windows Terminal: pinta guardando o original, repinta sem perder, devolve e limpa', () => {
  const [dracula, nord] = parseGogh(CATALOG)
  const settings = {
    profiles: { defaults: {}, list: [{ guid: '{AAA}', colorScheme: 'Campbell' }, { guid: '{BBB}' }] },
    schemes: [{ name: 'Campbell' }],
  }
  const originals: Record<string, { colorScheme?: unknown }> = {}
  expect(withProfileTheme(settings, '{aaa}', dracula!, originals)).toBe(true)
  expect(settings.profiles.list[0]?.colorScheme).toBe(WT_SCHEME)
  expect(originals['{aaa}']).toEqual({ colorScheme: 'Campbell' })
  expect(settings.schemes.find(s => s.name === WT_SCHEME)).toMatchObject({ background: '#282a36', purple: '#ff79c6', brightPurple: '#ff92df' })

  withProfileTheme(settings, '{AAA}', nord!, originals)
  expect(originals['{aaa}']).toEqual({ colorScheme: 'Campbell' })
  expect(settings.schemes.find(s => s.name === WT_SCHEME)).toMatchObject({ background: '#2e3440' })

  expect(withProfileTheme(settings, '{AAA}', null, originals)).toBe(true)
  expect(settings.profiles.list[0]?.colorScheme).toBe('Campbell')
  expect(settings.schemes.map(s => s.name)).toEqual(['Campbell'])
  expect(originals).toEqual({})
  // Nada a devolver: nada muda.
  expect(withProfileTheme(settings, '{AAA}', null, originals)).toBe(false)
})

test('primeira ida à aba Tema baixa o catálogo, guarda em disco e lista os temas', async ($, on) => {
  const w = world(on, { env: ENV, fetch: { text: CATALOG }, config: [themeRow('dark')] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:tema' })
  expect(w.fetches).toEqual([GOGH_URL])
  expect(w.files[CATALOG_FILE]).toBe(CATALOG)
  const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('theme:'))
  expect(keys).toEqual(['theme:dracula', 'theme:nord', 'theme:solarized-light'])
  expect(await texts(ui)).toMatch(/3 temas/)
  expect(await texts(ui)).toMatch(/o primeiro tema pede reiniciar/)
  await ui.unmount()
})

test('catálogo já em disco: lido no início da sessão, sem baixar', async ($, on) => {
  const w = world(on, { env: ENV, files: { [CATALOG_FILE]: CATALOG }, store: { tab: 'tema' } })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'theme:nord' })).toBeDefined()
  expect(w.fetches).toEqual([])
  await ui.unmount()
})

test('download que falha: a aba diz por quê e baixar de novo tenta outra vez', async ($, on) => {
  const w = world(on, { env: ENV, fetch: { status: 503 } })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:tema' })
  expect(await texts(ui)).toMatch(/Não deu para baixar os temas: HTTP 503/)
  await $.ui.press({ plugin: 'menu', key: 'themes:download' })
  expect(w.fetches).toHaveLength(2)
  await ui.unmount()
})

test('busca e filtro claro/escuro reduzem a lista', async ($, on) => {
  world(on, { env: ENV, files: { [CATALOG_FILE]: CATALOG }, store: { tab: 'tema' } })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  const listed = async () => (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('theme:'))

  await $.ui.input({ plugin: 'menu', key: 'themes:search', text: 'DRAC', kind: 'change' })
  expect(await listed()).toEqual(['theme:dracula'])
  await $.ui.input({ plugin: 'menu', key: 'themes:search', text: '', kind: 'change' })
  await $.ui.press({ plugin: 'menu', key: 'themes:filter:claros' })
  expect(await listed()).toEqual(['theme:solarized-light'])
  await $.ui.press({ plugin: 'menu', key: 'themes:filter:escuros' })
  expect(await listed()).toEqual(['theme:dracula', 'theme:nord'])
  await $.ui.input({ plugin: 'menu', key: 'themes:search', text: 'zzz', kind: 'change' })
  expect(await texts(ui)).toMatch(/Nenhum tema com “zzz”/)
  await ui.unmount()
})

test('aplicar sem o tema do menu em vigor e o /config recusando: settings.json, arquivo do tema e aviso de reinício', async ($, on) => {
  const w = world(on, {
    env: ENV,
    files: { [CATALOG_FILE]: CATALOG },
    store: { tab: 'tema' },
    config: [themeRow('dark')],
    configDeny: 'only its dialog changes it',
    settingsText: '{"theme":"dark","model":"fable"}',
  })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'theme:dracula' })

  const theme = JSON.parse(w.files[THEME_FILE]!) as { name: string; base: string; overrides: Record<string, string> }
  expect(theme).toMatchObject({ name: 'menu: Dracula', base: 'dark' })
  expect(theme.overrides.text).toBe('#f8f8f2')
  expect(JSON.parse(settingsWritten(w)!)).toEqual({ theme: 'custom:menu', model: 'fable' })
  expect(w.store.themeBefore).toBe('dark')
  expect(w.store.theme).toMatchObject({ kind: 'catalog', entry: { slug: 'dracula' } })
  const shown = await texts(ui)
  expect(shown).toMatch(/tema → Dracula · reinicie o Claude Code uma vez/)
  expect(shown).toMatch(/Atual\s*\|?Dracula/)
  expect(shown).toMatch(/✓/)
  await ui.unmount()
})

test('aplicar com o /config aceitando custom:menu: troca na hora, sem settings.json', async ($, on) => {
  const w = world(on, { env: ENV, files: { [CATALOG_FILE]: CATALOG }, store: { tab: 'tema' }, config: [themeRow('dark')] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'theme:nord' })
  expect(w.sets).toContainEqual({ key: 'theme', value: 'custom:menu' })
  expect(settingsWritten(w)).toBeUndefined()
  expect(await texts(ui)).not.toMatch(/reinicie/)
  await ui.unmount()
})

test('com o tema do menu já em vigor: só o arquivo muda, e os padrões escuro e claro também são ao vivo', async ($, on) => {
  const w = world(on, { env: ENV, files: { [CATALOG_FILE]: CATALOG }, store: { tab: 'tema' }, config: [themeRow('custom:menu')] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toMatch(/ao vivo: o foco num tema mostra a prévia/)
  await $.ui.press({ plugin: 'menu', key: 'theme:solarized-light' })
  expect(JSON.parse(w.files[THEME_FILE]!)).toMatchObject({ base: 'light' })
  await $.ui.press({ plugin: 'menu', key: 'themes:base:dark' })
  expect(JSON.parse(w.files[THEME_FILE]!)).toEqual({ name: 'menu: padrão escuro', base: 'dark', overrides: {} })
  expect(w.sets).toEqual([])
  expect(settingsWritten(w)).toBeUndefined()
  await ui.unmount()
})

test('prévia: o foco parado num tema pinta sem guardar, e fechar o menu volta ao guardado', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-22T12:00:00Z') })
  const w = world(on, { env: ENV, files: { [CATALOG_FILE]: CATALOG }, store: { tab: 'tema' }, config: [themeRow('custom:menu')] })
  on('ui.focus', () => ({}))
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'theme:dracula' })
  expect(JSON.parse(w.files[THEME_FILE]!)).toMatchObject({ name: 'menu: Dracula' })

  await $.ui.focus({ component: 'Pane', requestId: 'menu', plugin: 'menu', element: 'theme:nord', origin: { kind: 'person' } })
  // Antes da pausa nada muda; parado no tema, a prévia pinta.
  expect(JSON.parse(w.files[THEME_FILE]!)).toMatchObject({ name: 'menu: Dracula' })
  await clock.advance(250)
  expect(JSON.parse(w.files[THEME_FILE]!)).toMatchObject({ name: 'menu: Nord' })
  expect(w.store.theme).toMatchObject({ entry: { slug: 'dracula' } })
  expect(await texts(ui)).toMatch(/prévia/)

  // Fechar o menu pelo botão sob o prompt desfaz a prévia.
  const hint = await $.ui.mount({ ...PANE, component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '' } })
  await $.ui.press({ plugin: 'menu', key: 'menu:toggle' })
  expect(JSON.parse(w.files[THEME_FILE]!)).toMatchObject({ name: 'menu: Dracula' })
  await hint.unmount()
  await ui.unmount()
})

test('lista em janela: a roda rola a lista (sem passar das pontas), e o foco além da janela a leva junto', async ($, on) => {
  const many = JSON.stringify(Array.from({ length: 30 }, (_, i) => gogh(`Tema ${String(i).padStart(2, '0')}`, 'dark', '#101010', '#eeeeee')))
  world(on, { env: ENV, files: { [CATALOG_FILE]: many }, store: { tab: 'tema' } })
  on('ui.focus', () => ({}))
  on('ui.scroll', () => ({}))
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  const listed = async () => (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('theme:'))
  const wheel = (by: number) =>
    $.ui.scroll({ component: 'Pane', requestId: 'menu', offset: 0, by, bodyRows: 20, contentRows: 20, origin: { kind: 'person' } })

  // 20 linhas de corpo: 6 temas na janela, e um além de cada ponta desenhado para o foco passar.
  expect(await listed()).toHaveLength(7)
  expect((await listed())[0]).toBe('theme:tema-00')
  expect(await texts(ui)).toMatch(/1–6 de 30/)

  expect(await wheel(3)).toEqual({})
  expect(await texts(ui)).toMatch(/4–9 de 30/)
  expect(await listed()).toEqual(['theme:tema-02', 'theme:tema-03', 'theme:tema-04', 'theme:tema-05', 'theme:tema-06', 'theme:tema-07', 'theme:tema-08', 'theme:tema-09'])
  await wheel(100)
  expect(await texts(ui)).toMatch(/25–30 de 30/)
  await wheel(-100)
  expect(await texts(ui)).toMatch(/1–6 de 30/)

  // O foco no tema logo abaixo da janela desce a janela; no logo acima, sobe.
  const focus = (slug: string) =>
    $.ui.focus({ component: 'Pane', requestId: 'menu', plugin: 'menu', element: `theme:${slug}`, origin: { kind: 'person' } })
  await focus('tema-06')
  expect(await texts(ui)).toMatch(/2–7 de 30/)

  // Em outra aba a rolagem é a do engine: a janela da lista não se mexe.
  await $.ui.press({ plugin: 'menu', key: 'tab:sessao' })
  await wheel(5)
  await $.ui.press({ plugin: 'menu', key: 'tab:tema' })
  expect(await texts(ui)).toMatch(/2–7 de 30/)

  await focus('tema-00')
  expect(await texts(ui)).toMatch(/1–6 de 30/)
  await ui.unmount()
})

test('duas sessões no mesmo perfil do Windows Terminal: a que sai primeiro não devolve o esquema da outra', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-22T12:00:00Z') })
  const now = Date.parse('2026-10-22T12:00:00Z')
  const key = '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}'
  const w = world(on, {
    env: WT_ENV,
    files: { [CATALOG_FILE]: CATALOG, [WT_FILE]: WT_TEXT },
    store: { tab: 'tema', wtSessions: { [key]: { outra: now - 30_000, caduca: now - 10 * 60_000 } } },
    config: [themeRow('custom:menu')],
  })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'theme:nord' })
  await ui.unmount()
  type Wt = { profiles: { list: { colorScheme?: string }[] } }
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } })
  // A outra sessão ainda vive (deu sinal há 30 s): o perfil segue com o tema, e esta sai da lista.
  expect((JSON.parse(w.files[WT_FILE]!) as Wt).profiles.list[0]?.colorScheme).toBe(WT_SCHEME)
  expect(Object.keys((w.store.wtSessions as Record<string, Record<string, number>>)[key] ?? {})).toEqual(['outra', 'caduca'])
})

test('voltar ao tema original sem o menu ter trocado o tema: o tema do Claude Code fica como está', async ($, on) => {
  const w = world(on, { env: ENV, files: { [CATALOG_FILE]: CATALOG }, store: { tab: 'tema' }, config: [themeRow('light')] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'themes:original' })
  expect(w.sets).toEqual([])
  expect(settingsWritten(w)).toBeUndefined()
  expect(await texts(ui)).toMatch(/nada a restaurar/)
  await ui.unmount()
})

const WT_ENV = { USERPROFILE: HOME, OS: 'Windows_NT', WT_PROFILE_ID: '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}', LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' }
const WT_FILE = 'C:/Users/x/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'
const WT_TEXT = `{
    "$help": "https://aka.ms/terminal-documentation",
    "profiles": {
        "defaults": {},
        // o perfil desta aba
        "list": [ { "guid": "{61c54bbd-c2c6-5271-96e7-009a87ff44bf}", "name": "Windows PowerShell", "colorScheme": "One Half Dark" }, ],
    },
    "schemes": [],
}`

test('Windows Terminal: o tema pinta o perfil desta aba, e o fim da sessão (não um /clear) devolve o esquema', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-22T12:00:00Z') })
  const w = world(on, {
    env: WT_ENV,
    files: { [CATALOG_FILE]: CATALOG, [WT_FILE]: WT_TEXT },
    store: { tab: 'tema' },
    config: [themeRow('custom:menu')],
  })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).not.toMatch(/só no Windows Terminal/)
  await $.ui.press({ plugin: 'menu', key: 'theme:dracula' })

  type Wt = { profiles: { list: { colorScheme?: string }[] }; schemes: { name: string; background?: string }[] }
  let wt = JSON.parse(w.files[WT_FILE]!) as Wt
  expect(wt.profiles.list[0]?.colorScheme).toBe(WT_SCHEME)
  expect(wt.schemes.find(s => s.name === WT_SCHEME)?.background).toBe('#282a36')
  expect(w.files[`${WT_FILE}.menu.bak`]).toBe(WT_TEXT)
  expect(w.store.wtOriginal).toEqual({ '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}': { colorScheme: 'One Half Dark' } })
  await ui.unmount()

  // Um /clear segue na mesma aba: o tema fica.
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  wt = JSON.parse(w.files[WT_FILE]!) as Wt
  expect(wt.profiles.list[0]?.colorScheme).toBe(WT_SCHEME)

  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } })
  wt = JSON.parse(w.files[WT_FILE]!) as Wt
  expect(wt.profiles.list[0]?.colorScheme).toBe('One Half Dark')
  expect(wt.schemes).toEqual([])
})

test('voltar ao tema original: o tema de antes do menu e o esquema do terminal voltam, e a escolha some', async ($, on) => {
  const w = world(on, {
    env: ENV,
    files: { [CATALOG_FILE]: CATALOG },
    store: { tab: 'tema', themeBefore: 'light', theme: { kind: 'base', base: 'dark' } },
    config: [themeRow('custom:menu')],
  })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  expect(await texts(ui)).toMatch(/padrão escuro/)
  await $.ui.press({ plugin: 'menu', key: 'themes:original' })
  expect(w.sets).toContainEqual({ key: 'theme', value: 'light' })
  expect(w.store.theme).toBeUndefined()
  expect(w.store.themeBefore).toBeUndefined()
  expect(await texts(ui)).toMatch(/tema → light \(o de antes do menu\)/)
  await ui.unmount()
})

test('o seletor nativo /theme fecha o menu e roda o comando', async ($, on) => {
  const w = world(on, { env: ENV, files: { [CATALOG_FILE]: CATALOG }, store: { tab: 'tema' }, commands: ['theme'] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'themes:native' })
  expect(w.runs).toContainEqual({ command: 'theme', args: '' })
  expect(w.panes).toEqual([])
  await ui.unmount()
})

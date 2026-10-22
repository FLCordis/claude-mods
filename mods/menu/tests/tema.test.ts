import { expect, test } from 'claude-code/testing'
import type { ConfigRow } from 'claude-code'

import { PANE, menu, settingsWritten, start, world } from './world'

const THEME_ROW: ConfigRow = {
  key: 'theme',
  label: 'Theme',
  kind: 'choice',
  value: 'dark',
  options: ['dark', 'light', 'dark-daltonized', 'light-daltonized'],
  provider: { plugin: 'engine', tier: 'core' },
  isLocked: false,
}

test('aba Tema: as opções de tema do /config viram chips, o atual em destaque, e há uma prévia das cores', async ($, on) => {
  const w = world(on, { config: [THEME_ROW] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'tab:tema' }))?.props.label).toBe('Tema')
  await $.ui.press({ plugin: 'menu', key: 'tab:tema' })

  const chips = (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('theme:'))
  expect(chips).toEqual(['theme:dark', 'theme:light', 'theme:dark-daltonized', 'theme:light-daltonized'])
  expect((await ui.find({ key: 'theme:dark' }))?.props.variant).toBe('primary')
  expect(await ui.find({ type: 'Text', text: /prévia/i })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\+ linha adicionada/ })).toBeDefined()

  await $.ui.press({ plugin: 'menu', key: 'theme:light' })
  expect(w.sets).toContainEqual({ key: 'theme', value: 'light' })
  expect(await ui.find({ type: 'Text', text: /tema → light/ })).toBeDefined()
  await ui.unmount()
})

test('aba Tema sem linha de tema no /config: avisa e não quebra', async ($, on) => {
  world(on)
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:tema' })
  expect(await ui.find({ type: 'Text', text: /não expõe o tema/ })).toBeDefined()
  await ui.unmount()
})

test('aba Tema: quando o /config recusa (só o diálogo muda), grava o tema no settings.json e preserva o resto', async ($, on) => {
  const w = world(on, {
    config: [THEME_ROW],
    configDeny: 'only its dialog changes it',
    env: { USERPROFILE: 'C:/Users/x' },
    settingsText: '{"theme":"dark","model":"fable","permissions":{"allow":["Bash"]}}',
  })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:tema' })
  await $.ui.press({ plugin: 'menu', key: 'theme:light' })
  expect(JSON.parse(settingsWritten(w)!)).toEqual({ theme: 'light', model: 'fable', permissions: { allow: ['Bash'] } })
  expect(await ui.find({ type: 'Text', text: /tema → light/ })).toBeDefined()
  await ui.unmount()
})

test('aba Tema: o chip do seletor nativo fecha o menu e roda /theme', async ($, on) => {
  const w = world(on, { config: [THEME_ROW], commands: ['theme'] })
  await start($)
  await menu($)
  const ui = await $.ui.mount(PANE)
  await $.ui.press({ plugin: 'menu', key: 'tab:tema' })
  await $.ui.press({ plugin: 'menu', key: 'theme:native' })
  expect(w.runs).toContainEqual({ command: 'theme', args: '' })
  expect(w.panes).toEqual([])
  await ui.unmount()
})

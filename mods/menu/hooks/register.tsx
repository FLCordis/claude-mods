import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MenuTab } from '../types'
import { Shell } from './shell'
import { PANE, isTab, reason } from './state'
import { Configs } from './tabs/configs'
import { Hud, Orquestrador } from './tabs/mods'
import { Sessao, isEffortLevel } from './tabs/sessao'
import { Tema } from './tabs/tema'

const tabAtom = atom({ plugin: 'menu', key: 'tab' } as const, 'sessao')
const noteAtom = atom({ plugin: 'menu', key: 'note' } as const, null)
const modeAtom = atom({ plugin: 'menu', key: 'mode' } as const, null)
const effortAtom = atom({ plugin: 'menu', key: 'effort' } as const, null)
const effortChosenAtom = atom({ plugin: 'menu', key: 'effortChosen' } as const, null)
const tickAtom = atom({ plugin: 'menu', key: 'tick' } as const, 0)

/** Abre o menu na última aba usada, com foco e Esc para fechar. */
export async function openMenu($: EngineInterface) {
  const kept = await $.store.get('tab')
  if (isTab(kept)) await update($, tabAtom, () => kept)
  // A nota é da última ação deste menu, não de uma abertura anterior.
  await update($, noteAtom, () => null)
  return $.ui.open({ id: PANE, title: 'menu', focus: true, closeOnEscape: true, holdToasts: true, rows: 30, columns: 80 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'menu', description: 'Abre o menu com abas: sessão, mods, tema e configs' })

    // Modo e effort antes do primeiro hook clássico: o que a sessão já tem configurado.
    const settings = (await $.settings.read()) as { permissions?: { defaultMode?: unknown }; effortLevel?: unknown }
    if ((await read($, modeAtom)) === null) {
      const mode = settings.permissions?.defaultMode
      await update($, modeAtom, () => (typeof mode === 'string' && mode !== '' ? mode : 'default'))
    }
    if ((await read($, effortAtom)) === null) {
      const initial = (await $.env.get('CLAUDE_EFFORT')) ?? settings.effortLevel
      if (typeof initial === 'string' && initial !== '') await update($, effortAtom, () => initial)
    }
    // O effort escolhido no menu numa sessão anterior vale desde a primeira requisição desta.
    if ((await read($, effortChosenAtom)) === null) {
      const kept = await $.store.get('effort')
      if (typeof kept === 'string' && kept !== '') await update($, effortChosenAtom, () => kept)
    }

    return next(e)
  })

  on('command.run', { command: 'menu' }, async $ => {
    const opened = await openMenu($)
    return {
      text: opened.isPlaced ? 'Menu aberto. Esc fecha.' : `Menu aberto, aguardando espaço: ${opened.reason}`,
    }
  })

  // Todo hook clássico traz o modo de permissão em vigor. É um mostrador: uma falha ao anotar
  // nunca pode travar a tool ou o prompt que o hook acompanha.
  on('classic.*', async ($, e, next) => {
    const mode = (e as { permission_mode?: unknown }).permission_mode
    if (typeof mode === 'string' && mode !== '') {
      try {
        await update($, modeAtom, () => mode)
      } catch (error) {
        $.ui.log(`menu: modo não anotado: ${reason(error)}`, { to: 'debug' })
      }
    }
    return next(e)
  })

  // Cada requisição da sessão principal: anota o effort que o engine mandaria e, quando a pessoa
  // escolheu outro no menu, manda esse no lugar.
  on('turn.step', async function* ($, e, next) {
    const chosen = e.agentId === undefined ? await read($, effortChosenAtom) : null
    if (e.agentId === undefined && e.effort !== undefined) {
      const effort = String(e.effort)
      await update($, effortAtom, () => effort)
    }
    const result = yield* next(isEffortLevel(chosen) && e.effort !== undefined ? { ...e, effort: chosen } : e)
    return result
  })

  // O botão fixo acima do prompt, abaixo do que os outros mods desenham.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const below = await next(e)
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {below}
        <Box>
          <Button
            key="menu"
            plain
            dimColor
            onPress={() => void openMenu($).catch(error => $.ui.toast(`menu: ${reason(error)}`))}
          >
            ≡ menu
          </Button>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [tab, noteText] = await Promise.all([read($, tabAtom), read($, noteAtom), read($, tickAtom)])
    const onTab = (next: MenuTab) => {
      void update($, tabAtom, () => next)
      void $.store.set('tab', next)
    }
    const rows = tab === 'sessao' ? [] : await $.config.list()
    const ownedBy = (plugin: string) => rows.filter(r => r.key.startsWith(`${plugin}.`))
    const body =
      tab === 'sessao'
        ? await Sessao($, e)
        : tab === 'orquestrador'
          ? await Orquestrador($, e, ownedBy('orquestrador'))
          : tab === 'hud'
            ? await Hud($, e, ownedBy('terminal-hud'))
            : tab === 'tema'
              ? await Tema($, e, rows)
              : await Configs($, e, rows)
    return Shell($, e, {
      tab,
      note: noteText,
      onTab,
      children: body,
    })
  })
}

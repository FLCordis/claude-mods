import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { MenuTab } from '../types'
import { refreshCache } from './cache'
import { Hint } from './hint'
import { Shell } from './shell'
import { reason } from './state'
import { Configs } from './tabs/configs'
import { Hud, Orquestrador } from './tabs/mods'
import { Sessao, isEffortLevel } from './tabs/sessao'
import { Tema } from './tabs/tema'
import { PANE, isTab, openMenu, syncOpen } from './toggle'

const tabAtom = atom({ plugin: 'menu', key: 'tab' } as const, 'sessao')
const noteAtom = atom({ plugin: 'menu', key: 'note' } as const, null)
const isOpenAtom = atom({ plugin: 'menu', key: 'isOpen' } as const, false)
const configRowsAtom = atom({ plugin: 'menu', key: 'configRows' } as const, [])
const commandsAtom = atom({ plugin: 'menu', key: 'commands' } as const, [])
const modeAtom = atom({ plugin: 'menu', key: 'mode' } as const, null)
const effortAtom = atom({ plugin: 'menu', key: 'effort' } as const, null)
const effortChosenAtom = atom({ plugin: 'menu', key: 'effortChosen' } as const, null)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'menu',
      description: 'Abre o menu com abas: sessão, tema, mods e configs',
      argumentHint: '[sessao|tema|orquestrador|hud|configs]',
    })

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
    // Depois de um reload o pane pode seguir aberto (ou ter fechado sem o hook ver).
    await syncOpen($)

    return next(e)
  })

  // `/menu` abre (ou traz para a frente) o menu; `/menu tema` abre direto numa aba.
  on('command.run', { command: 'menu' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const opened = await openMenu($, isTab(arg) ? arg : undefined)
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

  // O botão do menu na ponta direita da linha sob o prompt, depois do que os outros mods desenham.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => Hint($, e, () => next(e)))

  // Como quer que o pane feche (Esc, o ✕ do engine, o botão), o botão sob o prompt volta a ▲.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    await update($, isOpenAtom, () => false)
    return closed
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [tab, noteText, rows, commands] = await Promise.all([
      read($, tabAtom),
      read($, noteAtom),
      read($, configRowsAtom),
      read($, commandsAtom),
    ])
    const onTab = (next: MenuTab) => {
      void (async () => {
        await update($, tabAtom, () => next)
        await update($, noteAtom, () => null)
        await $.store.set('tab', next)
        await refreshCache($)
      })().catch(error => $.ui.toast(`menu: ${reason(error)}`))
    }
    const ownedBy = (plugin: string) => rows.filter(r => r.key.startsWith(`${plugin}.`))
    const body =
      tab === 'sessao'
        ? await Sessao($, e)
        : tab === 'tema'
          ? await Tema($, e, rows, commands)
          : tab === 'orquestrador'
            ? await Orquestrador($, e, ownedBy('orquestrador'), commands)
            : tab === 'hud'
              ? await Hud($, e, ownedBy('terminal-hud'))
              : await Configs($, e, rows, commands)
    return Shell($, e, { tab, note: noteText, onTab, children: body })
  })
}

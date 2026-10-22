import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { MenuTab } from '../types'

export const PANE = 'menu'

// Cada arquivo declara os atoms que lê ou grava: o validador lista os valores por arquivo.
const noteAtom = atom({ plugin: 'menu', key: 'note' } as const, null)
const tickAtom = atom({ plugin: 'menu', key: 'tick' } as const, 0)

export const TAB_IDS: readonly MenuTab[] = ['sessao', 'orquestrador', 'hud', 'tema', 'configs']
export const isTab = (value: unknown): value is MenuTab => TAB_IDS.some(id => id === value)

/** Grava a nota sob o corpo da aba (o resultado da última ação). */
export function note($: EngineInterface, text: string) {
  return update($, noteAtom, () => text)
}

/** A mensagem de um erro, para a nota. */
export function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Força o redesenho do menu depois de uma ação que mudou algo fora do `$.state`. */
export function redraw($: EngineInterface) {
  return update($, tickAtom, n => n + 1)
}

export async function closeMenu($: EngineInterface) {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.close({ id: PANE })
}

/**
 * Roda um comando como se a pessoa digitasse `/command args`. O resultado vira a nota: o comando,
 * ou a recusa. `close` fecha o menu depois, só em sucesso (um painel toma a tela); numa recusa
 * o menu fica aberto para a nota ser vista. Devolve se o comando foi aceito.
 */
export async function runCommand(
  $: EngineInterface,
  command: string,
  args?: string,
  options: { close?: boolean } = {},
): Promise<boolean> {
  const label = args === undefined || args === '' ? `/${command}` : `/${command} ${args}`
  let ok = false
  try {
    await $.command.run(args === undefined ? { command } : { command, args })
    await note($, label)
    ok = true
  } catch (error) {
    await note($, `recusado: ${reason(error)}`)
  }
  if (ok && options.close) await closeMenu($)
  await redraw($)
  return ok
}

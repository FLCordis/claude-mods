import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { refreshCache } from './cache'
import { lang, t } from './i18n'
import { closeMenu } from './toggle'

// Cada arquivo declara os atoms que lê ou grava: o validador lista os valores por arquivo.
const noteAtom = atom({ plugin: 'menu', key: 'note' } as const, null)

/** Grava a nota sob o corpo da aba (o resultado da última ação). */
export function note($: EngineInterface, text: string) {
  return update($, noteAtom, () => text)
}

/** A mensagem de um erro, para a nota. */
export function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Anota uma recusa (`recusado: …`) no idioma do menu. */
export async function refused($: EngineInterface, error: unknown) {
  await note($, `${t(await lang($), 'refused')}${reason(error)}`)
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
    await refused($, error)
  }
  if (ok && options.close) await closeMenu($)
  await refreshCache($)
  return ok
}

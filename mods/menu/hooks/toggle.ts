import { atom, update } from 'claude-code'
import type { EngineInterface, UiOpenResult } from 'claude-code'

import type { MenuTab } from '../types'
import { refreshCache } from './cache'
import { revertPreview } from './themes/apply'
import { ensureCatalog } from './themes/catalog'

export const PANE = 'menu'

/** Altura pedida quando o pane abre acima do prompt e largura pedida quando encosta ao lado. */
const PANE_ROWS = 28
const PANE_COLUMNS = 64

const tabAtom = atom({ plugin: 'menu', key: 'tab' } as const, 'sessao')
const noteAtom = atom({ plugin: 'menu', key: 'note' } as const, null)
const isOpenAtom = atom({ plugin: 'menu', key: 'isOpen' } as const, false)

export const TAB_IDS: readonly MenuTab[] = ['sessao', 'tema', 'foco', 'orquestrador', 'uso', 'configs']
export const isTab = (value: unknown): value is MenuTab => TAB_IDS.some(id => id === value)

/** Os nomes que `/menu <aba>` aceita além dos ids: em inglês e os nomes antigos (zen, hud). */
const TAB_ALIASES: Record<string, MenuTab> = {
  session: 'sessao',
  theme: 'tema',
  zen: 'foco',
  focus: 'foco',
  orq: 'orquestrador',
  orchestrator: 'orquestrador',
  hud: 'uso',
  usage: 'uso',
  settings: 'configs',
  config: 'configs',
}

/** A aba que um argumento do `/menu` nomeia, ou undefined. */
export function tabNamed(arg: string): MenuTab | undefined {
  const name = arg.trim().toLowerCase()
  return isTab(name) ? name : TAB_ALIASES[name]
}

/** Se o pane está aberto, pela lista do engine: vale depois de um reload e de um fechamento sem hook. */
export async function isMenuOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(p => p.id === PANE)
}

/**
 * Abre o menu na aba pedida (senão na última usada), com o teclado e Esc para fechar. Sem
 * `holdToasts`: o menu fica aberto enquanto a pessoa quiser, e os toasts dos outros mods seguem.
 */
export async function openMenu($: EngineInterface, tab?: MenuTab): Promise<UiOpenResult> {
  const kept = tab ?? (await $.store.get('tab'))
  if (isTab(kept)) await update($, tabAtom, () => kept)
  // A nota é da última ação deste menu, não de uma abertura anterior.
  await update($, noteAtom, () => null)
  await refreshCache($)
  const opened = await $.ui.open({ id: PANE, title: 'menu', focus: true, closeOnEscape: true, rows: PANE_ROWS, columns: PANE_COLUMNS })
  await update($, isOpenAtom, () => true)
  // Abrindo na aba Tema: o catálogo carrega (ou baixa) com o menu já na tela.
  if (isTab(kept) && kept === 'tema') void ensureCatalog($).catch(() => undefined)
  return opened
}

/**
 * Fecha o menu. O `$.ui.close` do próprio plugin não passa pelo hook `ui.close` dele, então o que
 * aquele hook faz num fechamento da pessoa (o ▲ do botão, desfazer a prévia de tema) vem aqui também.
 */
export async function closeMenu($: EngineInterface): Promise<void> {
  if (await isMenuOpen($)) await $.ui.close({ id: PANE })
  await update($, isOpenAtom, () => false)
  await revertPreview($).catch(() => undefined)
}

/** O botão sob o prompt: fecha o menu aberto, abre o fechado. */
export async function toggleMenu($: EngineInterface): Promise<void> {
  if (await isMenuOpen($)) await closeMenu($)
  else await openMenu($)
}

/** Acerta o átomo com o engine: um reload ou um pane fechado sem hook o deixam desatualizado. */
export async function syncOpen($: EngineInterface): Promise<void> {
  const open = await isMenuOpen($)
  await update($, isOpenAtom, () => open)
}

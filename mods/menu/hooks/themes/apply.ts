import { atom, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import { configDir, writeUserSetting } from '../settings'
import { findTheme } from './catalog'
import { baseTheme, toClaudeTheme } from './convert'
import type { ClaudeTheme } from './convert'
import type { ThemeEntry } from './palette'
import { paintWindowsTerminal } from './wt'

/** O tema customizado do menu: sempre o mesmo arquivo, que o Claude Code relê ao vivo. */
export const CUSTOM_THEME = 'custom:menu'

/** O que a pessoa escolheu, guardado em `$.store` sob `theme`: um tema do catálogo ou um base puro. */
export type ThemeChoice = { kind: 'catalog'; entry: ThemeEntry } | { kind: 'base'; base: 'dark' | 'light' }

const chosenAtom = atom({ plugin: 'menu', key: 'themeChosen' } as const, null)
const previewAtom = atom({ plugin: 'menu', key: 'previewSlug' } as const, null)

/** O nome que o menu mostra para uma escolha. */
export function choiceName(choice: ThemeChoice): string {
  if (choice.kind === 'catalog') return choice.entry.name
  return choice.base === 'dark' ? 'padrão escuro' : 'padrão claro'
}

function isChoice(value: unknown): value is ThemeChoice {
  if (value === null || typeof value !== 'object') return false
  const v = value as { kind?: unknown; entry?: { slug?: unknown }; base?: unknown }
  if (v.kind === 'base') return v.base === 'dark' || v.base === 'light'
  return v.kind === 'catalog' && typeof v.entry?.slug === 'string'
}

/** A escolha guardada em `$.store`, ou undefined. */
export async function storedChoice($: EngineInterface): Promise<ThemeChoice | undefined> {
  const kept = await $.store.get('theme')
  return isChoice(kept) ? kept : undefined
}

async function writeThemeFile($: EngineInterface, theme: ClaudeTheme) {
  await $.fs.write(`${await configDir($)}/themes/menu.json`, `${JSON.stringify(theme, null, 2)}\n`)
}

/** O valor de `theme` em vigor, pela linha do /config. */
async function activeTheme($: EngineInterface): Promise<unknown> {
  return (await $.config.list()).find(r => r.key === 'theme')?.value
}

/** Se o tema customizado do menu já está em vigor: aí reescrever o arquivo troca as cores na hora. */
export async function isLive($: EngineInterface): Promise<boolean> {
  return (await activeTheme($)) === CUSTOM_THEME
}

/**
 * Põe `custom:menu` em vigor. Antes guarda o tema que estava (para "voltar ao original"). Pela linha
 * do /config quando ela aceita; quando só o diálogo muda o tema, grava no settings.json de usuário,
 * que vale a partir do próximo início. Devolve se já vale nesta sessão.
 */
async function activate($: EngineInterface): Promise<boolean> {
  const rows = await $.config.list()
  const row = rows.find(r => r.key === 'theme')
  if (row?.value === CUSTOM_THEME) return true
  if ((await $.store.get('themeBefore')) === undefined) {
    const user = (await $.settings.read({ source: 'user' })) as { theme?: unknown }
    await $.store.set('themeBefore', row?.value ?? user.theme ?? 'dark')
  }
  if (row !== undefined && !row.isLocked) {
    try {
      const set = await $.config.set({ key: row.key, value: CUSTOM_THEME })
      if (!('deny' in set) || set.deny === undefined) return true
    } catch {
      // Sem linha que aceite: cai no settings.json.
    }
  }
  await writeUserSetting($, 'theme', CUSTOM_THEME)
  return false
}

/** Pinta o Claude Code e o fundo do terminal com a escolha, sem guardar nada. */
async function paint($: EngineInterface, choice: ThemeChoice): Promise<string | null> {
  await writeThemeFile($, choice.kind === 'catalog' ? toClaudeTheme(choice.entry) : baseTheme(choice.base))
  try {
    await paintWindowsTerminal($, choice.kind === 'catalog' ? choice.entry : null)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** Aplica e guarda a escolha. Devolve a nota para o menu. */
export async function applyTheme($: EngineInterface, choice: ThemeChoice): Promise<string> {
  cancelPreview()
  const wtError = await paint($, choice)
  const live = await activate($)
  await $.store.set('theme', choice)
  await update($, chosenAtom, () => choiceName(choice))
  await update($, previewAtom, () => null)
  const parts = [`tema → ${choiceName(choice)}`]
  if (!live) parts.push('reinicie o Claude Code uma vez para ativar; depois a troca é ao vivo')
  if (wtError !== null) parts.push(`fundo do terminal não mudou: ${wtError}`)
  return parts.join(' · ')
}

// A prévia espera o foco parar num tema antes de pintar: andar pela lista não reescreve a cada passo.
const PREVIEW_DELAY_MS = 200
let previewTimer: Timer | undefined

function cancelPreview() {
  previewTimer?.cancel()
  previewTimer = undefined
}

/**
 * O foco parou num tema: pinta ao vivo sem guardar. Só com o tema do menu já em vigor, senão
 * o Claude Code não acompanharia e a prévia mostraria só o fundo do terminal.
 */
export function schedulePreview($: EngineInterface, slug: string) {
  cancelPreview()
  previewTimer = $.clock.after(PREVIEW_DELAY_MS, () => {
    previewTimer = undefined
    void (async () => {
      const entry = findTheme(slug)
      if (entry === undefined || !(await isLive($))) return
      await paint($, { kind: 'catalog', entry })
      await update($, previewAtom, () => slug)
    })().catch(() => undefined)
  })
}

/** Desfaz uma prévia pendente: volta ao tema guardado (o menu fechou, ou saiu da aba Tema). */
export async function revertPreview($: EngineInterface, previewing: string | null): Promise<void> {
  cancelPreview()
  if (previewing === null) return
  await update($, previewAtom, () => null)
  const kept = await storedChoice($)
  if (kept?.kind === 'catalog' && kept.entry.slug === previewing) return
  await paint($, kept ?? { kind: 'base', base: 'dark' })
}

/**
 * Volta ao tema de antes do menu: o valor de `theme` guardado na primeira troca, e o esquema
 * original do perfil do Windows Terminal. Devolve a nota para o menu.
 */
export async function restoreOriginal($: EngineInterface): Promise<string> {
  cancelPreview()
  const before = await $.store.get('themeBefore')
  const value = typeof before === 'string' && before !== '' ? before : 'dark'
  let live = false
  const row = (await $.config.list()).find(r => r.key === 'theme')
  if (row !== undefined && !row.isLocked) {
    try {
      const set = await $.config.set({ key: row.key, value })
      live = !('deny' in set) || set.deny === undefined
    } catch {
      live = false
    }
  }
  if (!live) await writeUserSetting($, 'theme', value)
  let wtError: string | null = null
  try {
    await paintWindowsTerminal($, null)
  } catch (error) {
    wtError = error instanceof Error ? error.message : String(error)
  }
  await $.store.delete('theme')
  await $.store.delete('themeBefore')
  await update($, chosenAtom, () => null)
  await update($, previewAtom, () => null)
  const parts = [`tema → ${value} (o de antes do menu)`]
  if (!live) parts.push('vale a partir do próximo início do Claude Code')
  if (wtError !== null) parts.push(`fundo do terminal não voltou: ${wtError}`)
  return parts.join(' · ')
}

/** Início de sessão: o nome do tema guardado para o menu e o fundo do terminal repintado. */
export async function restoreSession($: EngineInterface): Promise<void> {
  const kept = await storedChoice($)
  await update($, chosenAtom, () => (kept === undefined ? null : choiceName(kept)))
  // Só com o tema do menu em vigor: trocado pelo /theme, o fundo não deve seguir o menu.
  if (kept?.kind === 'catalog' && (await isLive($))) await paintWindowsTerminal($, kept.entry).catch(() => false)
}

/** Fim de sessão (não um /clear): o perfil do Windows Terminal volta ao esquema dele. */
export async function releaseTerminal($: EngineInterface): Promise<void> {
  cancelPreview()
  await paintWindowsTerminal($, null).catch(() => false)
}

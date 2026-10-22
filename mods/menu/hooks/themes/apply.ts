import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import { lang, t } from '../i18n'
import { configDir, writeUserSetting } from '../settings'
import { findTheme } from './catalog'
import { baseTheme, toClaudeTheme } from './convert'
import type { ClaudeTheme } from './convert'
import type { ThemeEntry } from './palette'
import { paintWindowsTerminal, releaseWindowsTerminal } from './wt'

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
  await settlePreview()
  await update($, previewAtom, () => null)
  const wtError = await paint($, choice)
  const live = await activate($)
  await $.store.set('theme', choice)
  await update($, chosenAtom, () => choiceName(choice))
  const l = await lang($)
  const parts = [t(l, 'themeSet')(choiceName(choice))]
  if (!live) parts.push(t(l, 'restartToActivate'))
  if (wtError !== null) parts.push(`${t(l, 'wtNotChanged')}${wtError}`)
  return parts.join(' · ')
}

// A prévia espera o foco parar num tema antes de pintar: andar pela lista não reescreve a cada passo.
const PREVIEW_DELAY_MS = 200
let previewTimer: Timer | undefined
// A pintura de uma prévia já em andamento: quem desfaz ou guarda espera ela acabar, senão ela
// terminaria depois e deixaria o arquivo do tema com a prévia.
let previewRun: Promise<void> | null = null

/** Cancela a prévia agendada e espera a que já está pintando. */
async function settlePreview(): Promise<void> {
  previewTimer?.cancel()
  previewTimer = undefined
  const running = previewRun
  if (running !== null) await running
}

/**
 * O foco parou num tema: pinta ao vivo sem guardar. Só com o tema do menu já em vigor, senão
 * o Claude Code não acompanharia e a prévia mostraria só o fundo do terminal.
 */
export function schedulePreview($: EngineInterface, slug: string) {
  previewTimer?.cancel()
  previewTimer = $.clock.after(PREVIEW_DELAY_MS, () => {
    previewTimer = undefined
    const run = (async () => {
      const entry = findTheme(slug)
      if (entry === undefined || !(await isLive($))) return
      // Marcada antes de pintar: um desfazer que chegue no meio sabe que há o que desfazer.
      await update($, previewAtom, () => slug)
      await paint($, { kind: 'catalog', entry })
    })().catch(() => undefined)
    previewRun = run
    void run.then(() => {
      if (previewRun === run) previewRun = null
    })
  })
}

/** Desfaz a prévia, se houver: volta ao tema guardado (o menu fechou, ou saiu da aba Tema). */
export async function revertPreview($: EngineInterface): Promise<void> {
  await settlePreview()
  const previewing = await read($, previewAtom)
  if (previewing === null) return
  await update($, previewAtom, () => null)
  const kept = await storedChoice($)
  if (kept?.kind === 'catalog' && kept.entry.slug === previewing) return
  await paint($, kept ?? { kind: 'base', base: 'dark' })
}

/**
 * Volta ao tema de antes do menu: o valor de `theme` guardado na primeira troca, e o esquema
 * original do perfil do Windows Terminal. Sem esse registro (o menu nunca trocou o tema), o tema
 * do Claude Code fica como está. Devolve a nota para o menu.
 */
export async function restoreOriginal($: EngineInterface): Promise<string> {
  await settlePreview()
  const before = await $.store.get('themeBefore')
  const value = typeof before === 'string' && before !== '' ? before : null
  let live = true
  if (value !== null) {
    live = false
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
  }
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
  const l = await lang($)
  const parts = [value === null ? t(l, 'nothingToRestore') : t(l, 'themeBefore')(value)]
  if (!live) parts.push(t(l, 'fromNextStart'))
  if (wtError !== null) parts.push(`${t(l, 'wtNotRestored')}${wtError}`)
  return parts.join(' · ')
}

/**
 * Início de sessão: o nome do tema guardado para o menu, o arquivo do tema regravado a partir da
 * escolha guardada (uma prévia que tenha ficado no arquivo some) e o fundo do terminal repintado.
 */
export async function restoreSession($: EngineInterface): Promise<void> {
  const kept = await storedChoice($)
  await update($, chosenAtom, () => (kept === undefined ? null : choiceName(kept)))
  await update($, previewAtom, () => null)
  // Só com o tema do menu em vigor: trocado pelo /theme, nem o arquivo nem o fundo seguem o menu.
  if (kept === undefined || !(await isLive($))) return
  await writeThemeFile($, kept.kind === 'catalog' ? toClaudeTheme(kept.entry) : baseTheme(kept.base))
  if (kept.kind === 'catalog') await paintWindowsTerminal($, kept.entry).catch(() => false)
}

/** Fim de sessão (não um /clear): desfaz a prévia e devolve o perfil do Windows Terminal. */
export async function releaseTerminal($: EngineInterface): Promise<void> {
  await revertPreview($).catch(() => undefined)
  await releaseWindowsTerminal($).catch(() => false)
}

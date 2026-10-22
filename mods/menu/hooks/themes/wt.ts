import type { EngineInterface } from 'claude-code'

import { parseJsonc } from './jsonc'
import type { ThemeEntry } from './palette'

/** O esquema de cores que o menu põe no settings.json do Windows Terminal. */
export const WT_SCHEME = 'claude-menu'

type WtProfile = { guid?: unknown; colorScheme?: unknown; [key: string]: unknown }
type WtSettings = {
  schemes?: Record<string, unknown>[]
  profiles?: WtProfile[] | { defaults?: WtProfile; list?: WtProfile[] }
  [key: string]: unknown
}

/** O esquema de cada perfil antes do menu mexer (ausente: o perfil seguia o padrão). */
type Originals = Record<string, { colorScheme?: unknown }>

const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'white'] as const

/** Uma paleta no formato de esquema do Windows Terminal. */
export function toWtScheme(entry: ThemeEntry): Record<string, string> {
  const scheme: Record<string, string> = {
    name: WT_SCHEME,
    background: entry.background,
    foreground: entry.foreground,
    cursorColor: entry.cursor,
    selectionBackground: entry.colors[8] ?? entry.foreground,
  }
  ANSI_NAMES.forEach((name, i) => {
    scheme[name] = entry.colors[i] ?? entry.foreground
    scheme[`bright${name[0]!.toUpperCase()}${name.slice(1)}`] = entry.colors[i + 8] ?? entry.foreground
  })
  return scheme
}

function profileList(settings: WtSettings): WtProfile[] {
  const profiles = settings.profiles
  if (Array.isArray(profiles)) return profiles
  return profiles?.list ?? []
}

const sameGuid = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()

/**
 * Pinta (ou, com `null`, devolve) o perfil `profileId` nas configurações já lidas. Guarda em
 * `originals` o esquema que o perfil tinha antes da primeira pintura e o recoloca na volta; o
 * esquema do menu só fica na lista enquanto algum perfil o usa. Devolve se algo mudou.
 */
export function withProfileTheme(settings: WtSettings, profileId: string, entry: ThemeEntry | null, originals: Originals): boolean {
  const profile = profileList(settings).find(p => sameGuid(p.guid, profileId))
  if (profile === undefined) return false
  const key = profileId.toLowerCase()
  const before = JSON.stringify(settings)

  if (entry === null) {
    const original = originals[key]
    if (original === undefined) return false
    if (original.colorScheme === undefined) delete profile.colorScheme
    else profile.colorScheme = original.colorScheme
    delete originals[key]
  } else {
    if (originals[key] === undefined) {
      const current = profile.colorScheme
      originals[key] = current === undefined || current === WT_SCHEME ? {} : { colorScheme: current }
    }
    profile.colorScheme = WT_SCHEME
  }

  const schemes = (settings.schemes ?? []).filter(s => s.name !== WT_SCHEME)
  const defaults = Array.isArray(settings.profiles) ? undefined : settings.profiles?.defaults
  const inUse = [...profileList(settings), defaults].some(p => p?.colorScheme === WT_SCHEME)
  if (entry !== null) schemes.push(toWtScheme(entry))
  else if (inUse) {
    // Outro perfil ainda usa o esquema (outra sessão aberta): ele fica como estava.
    const kept = (settings.schemes ?? []).find(s => s.name === WT_SCHEME)
    if (kept !== undefined) schemes.push(kept)
  }
  settings.schemes = schemes
  return JSON.stringify(settings) !== before
}

/** O settings.json do Windows Terminal que tem o perfil desta aba; null fora do WT. */
export async function wtSettingsPath($: EngineInterface): Promise<{ path: string; profileId: string } | null> {
  if ((await $.env.get('OS')) !== 'Windows_NT') return null
  const profileId = await $.env.get('WT_PROFILE_ID')
  const local = ((await $.env.get('LOCALAPPDATA')) ?? '').replaceAll('\\', '/')
  if (profileId === undefined || profileId === '' || local === '') return null
  const candidates = [
    `${local}/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json`,
    `${local}/Packages/Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe/LocalState/settings.json`,
    `${local}/Microsoft/Windows Terminal/settings.json`,
  ]
  for (const path of candidates) {
    if (!(await $.fs.exists(path))) continue
    if ((await $.fs.read(path)).toLowerCase().includes(profileId.toLowerCase())) return { path, profileId }
  }
  return null
}

/**
 * Põe a paleta no perfil do Windows Terminal desta aba (o WT relê o arquivo e repinta na hora),
 * ou com `null` devolve o esquema original. Antes da primeira gravação, uma cópia fica em
 * `settings.json.menu.bak`. Devolve `false` fora do Windows Terminal.
 */
export async function paintWindowsTerminal($: EngineInterface, entry: ThemeEntry | null): Promise<boolean> {
  const target = await wtSettingsPath($)
  if (target === null) return false
  const text = await $.fs.read(target.path)
  const settings = parseJsonc(text)
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('settings.json do Windows Terminal inválido')
  const originals = ((await $.store.get('wtOriginal')) ?? {}) as Originals
  if (!withProfileTheme(settings as WtSettings, target.profileId, entry, originals)) return true
  const backup = `${target.path}.menu.bak`
  if (!(await $.fs.exists(backup))) await $.fs.write(backup, text)
  await $.fs.write(target.path, `${JSON.stringify(settings, null, 4)}\n`)
  await $.store.set('wtOriginal', originals)
  return true
}

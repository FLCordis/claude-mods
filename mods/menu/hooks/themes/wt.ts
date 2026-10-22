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
 * As sessões que pintaram cada perfil, com a hora em que deram sinal de vida pela última vez:
 * duas abas do mesmo perfil dividem o esquema, e só a última a sair devolve o original.
 */
type Sessions = Record<string, Record<string, number>>

/** Sem sinal de vida por mais que isso, a sessão conta como encerrada (fechou sem `session.end`). */
const SESSION_STALE_MS = 3 * 60_000
/** De quanto em quanto tempo uma sessão que pintou o perfil dá sinal de vida. */
export const HEARTBEAT_MS = 60_000

// Uma gravação de cada vez: duas pinturas seguidas leriam o arquivo antes da outra gravar.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work)
  queue = run.catch(() => undefined)
  return run
}

/** O que sobra das sessões vivas do perfil sem esta, as caducas já fora. */
export function othersAlive(sessions: Sessions, key: string, self: string, now: number): string[] {
  return Object.entries(sessions[key] ?? {})
    .filter(([id, seen]) => id !== self && now - seen < SESSION_STALE_MS)
    .map(([id]) => id)
}

async function markSession($: EngineInterface, key: string, alive: boolean) {
  const [self, now] = await Promise.all([$.session.id(), $.clock.now()])
  const sessions = ((await $.store.get('wtSessions')) ?? {}) as Sessions
  const mine = { ...(sessions[key] ?? {}) }
  if (alive) mine[self] = now
  else delete mine[self]
  if (Object.keys(mine).length === 0) delete sessions[key]
  else sessions[key] = mine
  await $.store.set('wtSessions', sessions)
}

/** Lê, muda e grava o settings.json do WT; com backup na primeira gravação. */
async function rewrite($: EngineInterface, entry: ThemeEntry | null): Promise<boolean> {
  const target = await wtSettingsPath($)
  if (target === null) return false
  const text = await $.fs.read(target.path)
  const settings = parseJsonc(text)
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('settings.json do Windows Terminal inválido')
  const originals = ((await $.store.get('wtOriginal')) ?? {}) as Originals
  const changed = withProfileTheme(settings as WtSettings, target.profileId, entry, originals)
  if (changed) {
    const backup = `${target.path}.menu.bak`
    if (!(await $.fs.exists(backup))) await $.fs.write(backup, text)
    // O original fica guardado antes do arquivo mudar: uma falha no meio não o perde.
    await $.store.set('wtOriginal', originals)
    await $.fs.write(target.path, `${JSON.stringify(settings, null, 4)}\n`)
  }
  await markSession($, target.profileId.toLowerCase(), entry !== null)
  return true
}

/**
 * Põe a paleta no perfil do Windows Terminal desta aba (o WT relê o arquivo e repinta na hora),
 * ou com `null` devolve o esquema original (uma escolha da pessoa, nesta sessão). Antes da
 * primeira gravação, uma cópia fica em `settings.json.menu.bak`. Devolve `false` fora do WT.
 */
export function paintWindowsTerminal($: EngineInterface, entry: ThemeEntry | null): Promise<boolean> {
  return serial(() => rewrite($, entry))
}

/**
 * Fim da sessão: o perfil volta ao esquema original, a menos que outra sessão viva ainda o use
 * (outra aba do mesmo perfil com o tema do menu); aí só esta sai da lista.
 */
export function releaseWindowsTerminal($: EngineInterface): Promise<boolean> {
  return serial(async () => {
    const target = await wtSettingsPath($)
    if (target === null) return false
    const key = target.profileId.toLowerCase()
    const [self, now] = await Promise.all([$.session.id(), $.clock.now()])
    const sessions = ((await $.store.get('wtSessions')) ?? {}) as Sessions
    if (othersAlive(sessions, key, self, now).length > 0) {
      await markSession($, key, false)
      return true
    }
    return rewrite($, null)
  })
}

/** O sinal de vida desta sessão, só se ela pintou algum perfil. */
export function heartbeat($: EngineInterface): Promise<void> {
  return serial(async () => {
    const [self, now] = await Promise.all([$.session.id(), $.clock.now()])
    const sessions = ((await $.store.get('wtSessions')) ?? {}) as Sessions
    let touched = false
    for (const key of Object.keys(sessions)) {
      if (sessions[key]?.[self] === undefined) continue
      sessions[key] = { ...sessions[key], [self]: now }
      touched = true
    }
    if (touched) await $.store.set('wtSessions', sessions)
  })
}

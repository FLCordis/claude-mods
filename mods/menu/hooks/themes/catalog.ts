import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { configDir } from '../settings'
import { isLightBackground, normalizeHex, slugify } from './palette'
import type { ThemeEntry } from './palette'

/** O catálogo do Gogh num arquivo só (MIT): nome, variante e as 16 cores de cada tema. */
export const GOGH_URL = 'https://raw.githubusercontent.com/Gogh-Co/Gogh/master/data/themes-min.json'

const versionAtom = atom({ plugin: 'menu', key: 'themesVersion' } as const, 0)
const statusAtom = atom({ plugin: 'menu', key: 'themesStatus' } as const, 'idle')
const errorAtom = atom({ plugin: 'menu', key: 'themesError' } as const, null)

// O catálogo fica no módulo, não no `$.state`: são mais de mil temas, e o desenho mostra só uma
// janela deles. Um reload zera o módulo, mas o `session.start` de novo o relê do disco.
let entries: ThemeEntry[] = []
let loading: Promise<void> | null = null

/** Os temas carregados, em ordem alfabética. */
export function themeEntries(): readonly ThemeEntry[] {
  return entries
}

export function findTheme(slug: string): ThemeEntry | undefined {
  return entries.find(t => t.slug === slug)
}

/** Onde o catálogo baixado fica guardado. */
export async function catalogPath($: EngineInterface): Promise<string> {
  return `${await configDir($)}/menu/gogh-themes.json`
}

/**
 * Lê o JSON do Gogh: uma lista de temas com `name`, `variant`, `color_01`…`color_16`, `background`,
 * `foreground` e `cursor`. Tema sem as cores todas fica de fora; nomes repetidos, só o primeiro.
 */
export function parseGogh(text: string): ThemeEntry[] {
  const raw: unknown = JSON.parse(text)
  if (!Array.isArray(raw)) throw new Error('o catálogo não é uma lista')
  const bySlug = new Map<string, ThemeEntry>()
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const t = item as Record<string, unknown>
    const name = typeof t.name === 'string' ? t.name.trim() : ''
    const slug = slugify(name)
    if (slug === '' || bySlug.has(slug)) continue
    const colors = Array.from({ length: 16 }, (_, i) => normalizeHex(t[`color_${String(i + 1).padStart(2, '0')}`]))
    const background = normalizeHex(t.background)
    const foreground = normalizeHex(t.foreground)
    if (background === null || foreground === null || colors.some(c => c === null)) continue
    const variant = t.variant === 'light' || t.variant === 'dark' ? t.variant : isLightBackground(background) ? 'light' : 'dark'
    bySlug.set(slug, {
      slug,
      name,
      variant,
      background,
      foreground,
      cursor: normalizeHex(t.cursor) ?? foreground,
      colors: colors as string[],
      ...(typeof t.author_name === 'string' && t.author_name !== '' ? { author: t.author_name } : {}),
    })
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

async function publish($: EngineInterface, list: ThemeEntry[]) {
  entries = list
  await update($, versionAtom, n => n + 1)
  await update($, errorAtom, () => null)
  await update($, statusAtom, () => 'ready')
}

/** Lê o catálogo guardado em disco; devolve se havia um. Não baixa nada. */
export async function loadCatalog($: EngineInterface): Promise<boolean> {
  const path = await catalogPath($)
  if (!(await $.fs.exists(path))) return false
  await publish($, parseGogh(await $.fs.read(path)))
  return true
}

/** Baixa o catálogo do Gogh, guarda em disco e publica. Uma falha vira `themesError`. */
export async function downloadCatalog($: EngineInterface): Promise<void> {
  await update($, statusAtom, () => 'loading')
  await update($, errorAtom, () => null)
  try {
    const res = await $.http.fetch(GOGH_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const list = parseGogh(res.text)
    if (list.length === 0) throw new Error('o catálogo veio vazio')
    await $.fs.write(await catalogPath($), res.text)
    await publish($, list)
  } catch (error) {
    await update($, statusAtom, () => 'error')
    await update($, errorAtom, () => (error instanceof Error ? error.message : String(error)))
  }
}

/** Garante o catálogo: o do módulo, senão o do disco, senão baixa. Chamadas juntas esperam a mesma. */
export function ensureCatalog($: EngineInterface): Promise<void> {
  if (entries.length > 0) return Promise.resolve()
  loading ??= (async () => {
    try {
      if (!(await loadCatalog($).catch(() => false))) await downloadCatalog($)
    } finally {
      loading = null
    }
  })()
  return loading
}

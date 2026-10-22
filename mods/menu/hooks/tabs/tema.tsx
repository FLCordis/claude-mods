import { atom, read, update } from 'claude-code'
import type { ConfigRow, EngineInterface } from 'claude-code'

import type { MenuThemeFilter } from '../../types'
import { refreshCache } from '../cache'
import { lang, t } from '../i18n'
import { SHELL_ROWS } from '../shell'
import type { PaneEvent } from '../shell'
import { note, refused, runCommand } from '../state'
import { CUSTOM_THEME, applyTheme, restoreOriginal } from '../themes/apply'
import type { ThemeChoice } from '../themes/apply'
import { downloadCatalog, themeEntries } from '../themes/catalog'
import type { ThemeEntry } from '../themes/palette'

const queryAtom = atom({ plugin: 'menu', key: 'themeQuery' } as const, '')
const filterAtom = atom({ plugin: 'menu', key: 'themeFilter' } as const, 'todos')
const scrollAtom = atom({ plugin: 'menu', key: 'themeScroll' } as const, 0)
const versionAtom = atom({ plugin: 'menu', key: 'themesVersion' } as const, 0)
const statusAtom = atom({ plugin: 'menu', key: 'themesStatus' } as const, 'idle')
const errorAtom = atom({ plugin: 'menu', key: 'themesError' } as const, null)
const chosenAtom = atom({ plugin: 'menu', key: 'themeChosen' } as const, null)
const previewAtom = atom({ plugin: 'menu', key: 'previewSlug' } as const, null)

const FILTERS: readonly { id: MenuThemeFilter; label: 'all' | 'darkOnes' | 'lightOnes' }[] = [
  { id: 'todos', label: 'all' },
  { id: 'escuros', label: 'darkOnes' },
  { id: 'claros', label: 'lightOnes' },
]

/**
 * Linhas do corpo que não são da janela da lista: as do pane fora do corpo (abas, régua, margem,
 * nota, régua, teclas), as do cabeçalho da aba (atual, aviso, busca, filtros, ações), uma de folga
 * para as ações que quebram linha num terminal estreito e uma para o tema logo acima da janela.
 */
const FIXED_ROWS = SHELL_ROWS + 5 + 1 + 1

// As linhas do corpo no último desenho: o hook de foco não recebe a medida e precisa dela.
let lastBodyRows = 20

/** Quantos temas cabem na janela da lista. */
export const listRows = (bodyRows: number, hasStatus: boolean): number => Math.max(3, bodyRows - FIXED_ROWS - (hasStatus ? 1 : 0))

/** Os temas que casam com a busca (no nome, sem diferenciar maiúsculas) e o filtro de claro/escuro. */
export function filterThemes(list: readonly ThemeEntry[], query: string, filter: MenuThemeFilter): ThemeEntry[] {
  const needle = query.trim().toLowerCase()
  return list.filter(
    t =>
      (filter === 'todos' || (filter === 'claros') === (t.variant === 'light')) &&
      (needle === '' || t.name.toLowerCase().includes(needle)),
  )
}

/** A janela da lista como está agora, para os hooks de rolagem e foco. */
export async function themeWindow($: EngineInterface, bodyRows: number = lastBodyRows) {
  const [query, filter, top, status] = await Promise.all([read($, queryAtom), read($, filterAtom), read($, scrollAtom), read($, statusAtom)])
  const found = filterThemes(themeEntries(), query, filter)
  const rows = listRows(bodyRows, status === 'loading' || status === 'error')
  return { found, top, rows }
}

/** Move a janela para começar em `top`, sem passar das pontas. */
export async function scrollThemes($: EngineInterface, top: number, bodyRows?: number): Promise<void> {
  const { found, rows } = await themeWindow($, bodyRows)
  const at = Math.max(0, Math.min(Math.max(0, found.length - rows), top))
  await update($, scrollAtom, () => at)
}

/** `1250` → `1.250`. */
const count = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Roda uma ação do tema e põe o resultado (ou a recusa) na nota. */
function act($: EngineInterface, work: () => Promise<string | void>) {
  return () =>
    void (async () => {
      try {
        const text = await work()
        if (typeof text === 'string') await note($, text)
      } catch (error) {
        await refused($, error)
      }
      await refreshCache($)
    })()
}

/**
 * A aba Tema: o tema atual, busca, filtro claro/escuro, ações e a lista do catálogo numa janela de
 * altura fixa que rola sozinha (roda do mouse, setas, ou o foco andando pela lista).
 */
export async function Tema($: EngineInterface, e: PaneEvent, rows: readonly ConfigRow[], commands: readonly string[]): Promise<JSX.Element> {
  const els = $.ui.resolve(e)
  const { Box, Text, Button } = els
  const Input = 'Input' in els ? els.Input : undefined
  lastBodyRows = e.props.scroll.bodyRows

  const [l, query, filter, top, , status, error, chosen, preview, os, wtProfile] = await Promise.all([
    lang($),
    read($, queryAtom),
    read($, filterAtom),
    read($, scrollAtom),
    read($, versionAtom),
    read($, statusAtom),
    read($, errorAtom),
    read($, chosenAtom),
    read($, previewAtom),
    $.env.get('OS'),
    $.env.get('WT_PROFILE_ID'),
  ])
  const all = themeEntries()
  const found = filterThemes(all, query, filter)
  const hasStatus = status === 'loading' || status === 'error'
  const shown = listRows(e.props.scroll.bodyRows, hasStatus)
  const first = Math.max(0, Math.min(top, Math.max(0, found.length - shown)))
  const live = rows.find(r => r.key === 'theme')?.value === CUSTOM_THEME
  const paintsTerminal = os === 'Windows_NT' && wtProfile !== undefined && wtProfile !== ''

  const choose = (choice: ThemeChoice) => act($, () => applyTheme($, choice))
  const setQuery = (text: string) =>
    void (async () => {
      await update($, queryAtom, () => text)
      await update($, scrollAtom, () => 0)
    })()

  const header = (
    <Box key="themes:current" flexDirection="row" justifyContent="space-between" columnGap={1}>
      <Text wrap="truncate-end">
        <Text color="subtle">{t(l, 'current')} </Text>
        <Text bold>{chosen ?? t(l, 'claudeCodesTheme')}</Text>
      </Text>
      <Text color="subtle" dimColor>
        {found.length > shown ? t(l, 'rangeOf')(first + 1, Math.min(found.length, first + shown), count(found.length)) : t(l, 'themesCount')(count(found.length))}
      </Text>
    </Box>
  )

  const notice = (
    <Text key="themes:notice" color="subtle" dimColor wrap="truncate-end">
      {live ? t(l, 'liveNotice') : t(l, 'restartNotice')}
      {paintsTerminal ? '' : t(l, 'wtOnly')}
    </Text>
  )

  const search =
    Input === undefined ? null : (
      <Input
        key="themes:search"
        label={t(l, 'search')}
        placeholder={all.length > 0 ? t(l, 'goghThemes')(count(all.length)) : t(l, 'themeName')}
        value={query}
        submitLabel={t(l, 'searchGo')}
        onInput={setQuery}
        onSubmit={setQuery}
      />
    )

  const filters = (
    <Box key="themes:filters" flexDirection="row" columnGap={2}>
      {FILTERS.map(f => {
        const active = f.id === filter
        const label = t(l, f.label)
        return (
          <Button
            key={`themes:filter:${f.id}`}
            plain
            label={label}
            variant={active ? 'primary' : 'secondary'}
            onPress={() =>
              void (async () => {
                await update($, filterAtom, () => f.id)
                await update($, scrollAtom, () => 0)
              })()
            }
          >
            <Text color={active ? 'claude' : 'subtle'} bold={active}>
              {active ? '● ' : '○ '}
              {label}
            </Text>
          </Button>
        )
      })}
    </Box>
  )

  const actions = (
    <Box key="themes:actions" flexDirection="row" flexWrap="wrap" columnGap={2}>
      <Button key="themes:base:dark" plain dimColor label={t(l, 'defaultDark')} onPress={choose({ kind: 'base', base: 'dark' })} />
      <Button key="themes:base:light" plain dimColor label={t(l, 'defaultLight')} onPress={choose({ kind: 'base', base: 'light' })} />
      <Button key="themes:original" plain dimColor label={t(l, 'originalTheme')} onPress={act($, () => restoreOriginal($))} />
      <Button key="themes:download" plain dimColor label={t(l, 'downloadAgain')} onPress={act($, () => downloadCatalog($))} />
      {commands.includes('theme') && (
        <Button key="themes:native" plain dimColor label="/theme" onPress={() => void runCommand($, 'theme', undefined, { close: true })} />
      )}
    </Box>
  )

  const statusLine =
    status === 'loading' ? (
      <Text key="themes:status" color="suggestion">
        {t(l, 'downloading')}
      </Text>
    ) : status === 'error' ? (
      <Text key="themes:status" color="error" wrap="truncate-end">
        {t(l, 'downloadFailed')(error ?? t(l, 'unknownError'))}
      </Text>
    ) : null

  // Um tema além de cada ponta da janela: o foco (setas, Tab) passa da primeira ou da última
  // visível e a janela vai atrás dele, em vez de o foco pular para as ações.
  const items = found.slice(Math.max(0, first - 1), first + shown + 1).map(entry => {
    const isChosen = chosen === entry.name
    const isPreview = preview === entry.slug
    return (
      <Button key={`theme:${entry.slug}`} plain label={entry.name} onPress={choose({ kind: 'catalog', entry })}>
        {entry.colors.slice(1, 7).map((c, i) => (
          <Text key={String(i)} color={c}>
            ■
          </Text>
        ))}
        <Text color={entry.foreground}>■ </Text>
        <Text bold={isChosen} wrap="truncate-end">
          {entry.name}
        </Text>
        {entry.variant === 'light' && <Text color="subtle"> ☀</Text>}
        {isChosen && <Text color="success"> ✓</Text>}
        {isPreview && !isChosen && <Text color="suggestion"> {t(l, 'preview')}</Text>}
      </Button>
    )
  })

  const empty =
    all.length === 0 ? (
      <Text key="themes:empty" color="subtle" dimColor>
        {status === 'loading' ? '' : t(l, 'noThemesYet')}
      </Text>
    ) : found.length === 0 ? (
      <Text key="themes:empty" color="subtle" dimColor>
        {t(l, 'noThemeFor')(query)}
      </Text>
    ) : null

  return (
    <Box flexDirection="column">
      {header}
      {notice}
      {search}
      {filters}
      {actions}
      {statusLine}
      {empty}
      {items}
    </Box>
  )
}

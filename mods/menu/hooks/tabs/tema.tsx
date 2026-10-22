import { atom, read, update } from 'claude-code'
import type { ConfigRow, EngineInterface } from 'claude-code'

import type { MenuThemeFilter } from '../../types'
import { refreshCache } from '../cache'
import type { PaneEvent } from '../shell'
import { note, reason, runCommand } from '../state'
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

const FILTERS: readonly { id: MenuThemeFilter; label: string }[] = [
  { id: 'todos', label: 'todos' },
  { id: 'escuros', label: 'escuros' },
  { id: 'claros', label: 'claros' },
]

/**
 * Linhas do corpo que não são da janela da lista: as do pane fora do corpo (abas, régua, margem,
 * nota, régua, teclas), as do cabeçalho da aba (atual, aviso, busca, filtros, ações), uma de folga
 * para as ações que quebram linha num terminal estreito e uma para o tema logo acima da janela.
 */
const FIXED_ROWS = 7 + 5 + 1 + 1

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
        await note($, `recusado: ${reason(error)}`)
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

  const [query, filter, top, , status, error, chosen, preview, os, wtProfile] = await Promise.all([
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
        <Text color="subtle">Atual </Text>
        <Text bold>{chosen ?? 'o do Claude Code'}</Text>
      </Text>
      <Text color="subtle" dimColor>
        {found.length > shown ? `${first + 1}–${Math.min(found.length, first + shown)} de ${count(found.length)}` : `${count(found.length)} temas`}
      </Text>
    </Box>
  )

  const notice = (
    <Text key="themes:notice" color="subtle" dimColor wrap="truncate-end">
      {live ? 'ao vivo: o foco num tema mostra a prévia, enter guarda' : 'o primeiro tema pede reiniciar o Claude Code uma vez; depois é ao vivo'}
      {paintsTerminal ? '' : ' · fundo do terminal só no Windows Terminal'}
    </Text>
  )

  const search =
    Input === undefined ? null : (
      <Input
        key="themes:search"
        label="Buscar"
        placeholder={all.length > 0 ? `${count(all.length)} temas do Gogh` : 'nome do tema'}
        value={query}
        submitLabel="buscar"
        onInput={setQuery}
        onSubmit={setQuery}
      />
    )

  const filters = (
    <Box key="themes:filters" flexDirection="row" columnGap={2}>
      {FILTERS.map(f => {
        const active = f.id === filter
        return (
          <Button
            key={`themes:filter:${f.id}`}
            plain
            label={f.label}
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
              {f.label}
            </Text>
          </Button>
        )
      })}
    </Box>
  )

  const actions = (
    <Box key="themes:actions" flexDirection="row" flexWrap="wrap" columnGap={2}>
      <Button key="themes:base:dark" plain dimColor label="◐ padrão escuro" onPress={choose({ kind: 'base', base: 'dark' })} />
      <Button key="themes:base:light" plain dimColor label="◑ padrão claro" onPress={choose({ kind: 'base', base: 'light' })} />
      <Button key="themes:original" plain dimColor label="↺ tema original" onPress={act($, () => restoreOriginal($))} />
      <Button key="themes:download" plain dimColor label="⟳ baixar de novo" onPress={act($, () => downloadCatalog($))} />
      {commands.includes('theme') && (
        <Button key="themes:native" plain dimColor label="/theme" onPress={() => void runCommand($, 'theme', undefined, { close: true })} />
      )}
    </Box>
  )

  const statusLine =
    status === 'loading' ? (
      <Text key="themes:status" color="suggestion">
        Baixando os temas do Gogh…
      </Text>
    ) : status === 'error' ? (
      <Text key="themes:status" color="error" wrap="truncate-end">
        Não deu para baixar os temas: {error ?? 'erro desconhecido'} (⟳ tenta de novo)
      </Text>
    ) : null

  // Um tema além de cada ponta da janela: o foco (setas, Tab) passa da primeira ou da última
  // visível e a janela vai atrás dele, em vez de o foco pular para as ações.
  const items = found.slice(Math.max(0, first - 1), first + shown + 1).map(t => {
    const isChosen = chosen === t.name
    const isPreview = preview === t.slug
    return (
      <Button key={`theme:${t.slug}`} plain label={t.name} onPress={choose({ kind: 'catalog', entry: t })}>
        {t.colors.slice(1, 7).map((c, i) => (
          <Text key={String(i)} color={c}>
            ■
          </Text>
        ))}
        <Text color={t.foreground}>■ </Text>
        <Text bold={isChosen} wrap="truncate-end">
          {t.name}
        </Text>
        {t.variant === 'light' && <Text color="subtle"> ☀</Text>}
        {isChosen && <Text color="success"> ✓</Text>}
        {isPreview && !isChosen && <Text color="suggestion"> prévia</Text>}
      </Button>
    )
  })

  const empty =
    all.length === 0 ? (
      <Text key="themes:empty" color="subtle" dimColor>
        {status === 'loading' ? '' : 'Nenhum tema baixado ainda: ⟳ baixar de novo.'}
      </Text>
    ) : found.length === 0 ? (
      <Text key="themes:empty" color="subtle" dimColor>
        Nenhum tema com “{query}”.
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

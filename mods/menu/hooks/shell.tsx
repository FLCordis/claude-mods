import type { EngineInterface, RenderInput } from 'claude-code'

import type { MenuLang, MenuTab } from '../types'
import { Chip, Rule } from './chips'
import { LANGS, MSG, setLang, t } from './i18n'
import { reason } from './state'
import { closeMenu } from './toggle'

/** O `e` do hook `ui.render` em `Pane`, em qualquer superfície. */
export type PaneEvent = RenderInput<'Pane'>

type TabDef = { id: MenuTab; label: keyof typeof MSG; short: { pt: string; en: string } }

export const TABS: readonly TabDef[] = [
  { id: 'sessao', label: 'tabSessao', short: { pt: 'Sessão', en: 'Sess.' } },
  { id: 'tema', label: 'tabTema', short: { pt: 'Tema', en: 'Theme' } },
  { id: 'foco', label: 'tabFoco', short: { pt: 'Foco', en: 'Focus' } },
  { id: 'orquestrador', label: 'tabOrquestrador', short: { pt: 'Orq', en: 'Orch' } },
  { id: 'uso', label: 'tabUso', short: { pt: 'Uso', en: 'Usage' } },
  { id: 'configs', label: 'tabConfigs', short: { pt: 'Configs', en: 'Settings' } },
]

/** O rótulo de uma aba no idioma; abaixo de 64 colunas, o curto. */
export function tabLabel(tab: TabDef, lang: MenuLang, narrow: boolean): string {
  return narrow ? tab.short[lang] : (t(lang, tab.label) as string)
}

/** Linhas da moldura fora do corpo: abas (3), margem, nota, régua, idioma (3), teclas e uma de folga. */
export const SHELL_ROWS = 3 + 1 + 1 + 1 + 3 + 1 + 1

export type ShellProps = {
  tab: MenuTab
  lang: MenuLang
  note: string | null
  onTab: (tab: MenuTab) => void
  /** A aba cuida da própria rolagem (uma lista em janela): a moldura fica do tamanho exato do corpo. */
  isFixed?: boolean
  children: JSX.Element
}

const width = (text: string) => [...text].length

/**
 * A moldura do menu: a barra de abas no estilo de um navegador (a ativa numa caixa que se emenda
 * na régua de baixo, com o foco inicial; as outras só em texto; `esc ×` na ponta), corpo, nota da
 * última ação, régua, o seletor de idioma e o rodapé com as teclas.
 *
 * A caixa da aba ativa é desenhada em três linhas de texto, com as posições contadas pelos
 * rótulos: a superfície não tem borda só em cima ou só embaixo.
 *
 * A raiz tem sempre pelo menos a altura do corpo do pane: aberto acima do prompt, o pane se
 * ajusta à árvore, e uma árvore que muda de altura a cada aba tiraria os botões do lugar do clique.
 */
export function Shell($: EngineInterface, e: PaneEvent, { tab, lang, note, onTab, isFixed = false, children }: ShellProps): JSX.Element {
  const { Box, Text, Button } = $.ui.resolve(e)
  const columns = e.props.bodyColumns
  const rows = e.props.scroll.bodyRows
  const narrow = columns < 64
  const GAP = 2
  // Uma coluna de respiro entre a borda do pane e a primeira aba (e depois do `esc ×`).
  const PAD = 1

  // Onde a caixa da aba ativa começa e quanto mede por dentro (`◆ rótulo` com um espaço de cada lado).
  const at = Math.max(0, TABS.findIndex(x => x.id === tab))
  const left = TABS.slice(0, at).reduce((sum, x) => sum + width(tabLabel(x, lang, narrow)) + GAP, 0)
  const inner = width(`◆ ${tabLabel(TABS[at]!, lang, narrow)}`) + 2
  const top = `${' '.repeat(PAD + left)}╭${'─'.repeat(inner)}╮`
  const bottom = `${'─'.repeat(PAD + left)}╯${' '.repeat(inner)}╰${'─'.repeat(Math.max(0, columns - PAD - left - inner - 2))}`

  const tabs = TABS.map(x => {
    const active = x.id === tab
    const label = tabLabel(x, lang, narrow)
    if (!active) {
      return (
        <Button key={`tab:${x.id}`} label={label} plain variant="secondary" onPress={() => onTab(x.id)}>
          <Text color="subtle">{label}</Text>
        </Button>
      )
    }
    return (
      <Box key={`tab:${x.id}-box`} flexDirection="row">
        <Text color="subtle" dimColor>│ </Text>
        <Button key={`tab:${x.id}`} label={label} plain variant="primary" autoFocus onPress={() => onTab(x.id)}>
          <Text color="inverseText" backgroundColor="warning" bold underline>
            ◆ {label}
          </Text>
        </Button>
        <Text color="subtle" dimColor> │</Text>
      </Box>
    )
  })

  return (
    <Box
      flexDirection="column"
      width={columns}
      height={isFixed ? rows : undefined}
      minHeight={isFixed ? undefined : rows}
    >
      <Text color="subtle" dimColor wrap="truncate-end">
        {top}
      </Text>
      <Box flexDirection="row" columnGap={GAP} width={columns} paddingX={PAD}>
        {tabs}
        <Box flexGrow={1} />
        <Button key="menu:close" label="esc ×" plain variant="secondary" onPress={() => void closeMenu($).catch(error => $.ui.toast(`menu: ${reason(error)}`))}>
          <Text color="subtle">esc ×</Text>
        </Button>
      </Box>
      <Text color="subtle" dimColor wrap="truncate-end">
        {bottom}
      </Text>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} marginTop={1} paddingX={1} overflow={isFixed ? 'hidden' : undefined}>
        {children}
      </Box>
      {note !== null && (
        <Box paddingX={1} flexShrink={0}>
          <Text color="suggestion" wrap="truncate-end">
            {note}
          </Text>
        </Box>
      )}
      <Box flexDirection="column" flexShrink={0}>
        {Rule($, e)}
        <Box flexDirection="row" alignItems="center" columnGap={2} paddingX={1}>
          <Text color="subtle">{t(lang, 'language')}</Text>
          {LANGS.map(l =>
            Chip($, e, {
              key: `lang:${l.id}`,
              label: l.label,
              active: l.id === lang,
              color: l.id === lang ? 'warning' : 'text',
              onPress: () => void setLang($, l.id).catch(error => $.ui.toast(`menu: ${reason(error)}`)),
            }),
          )}
        </Box>
        <Box paddingX={1}>
          <Text color="subtle" dimColor wrap="truncate-end">
            {t(lang, 'keys')}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

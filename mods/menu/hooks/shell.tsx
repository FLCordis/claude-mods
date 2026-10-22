import type { EngineInterface, RenderInput } from 'claude-code'

import type { MenuTab } from '../types'
import { Rule } from './chips'
import { reason } from './state'
import { closeMenu } from './toggle'

/** O `e` do hook `ui.render` em `Pane`, em qualquer superfície. */
export type PaneEvent = RenderInput<'Pane'>

export const TABS: readonly { id: MenuTab; label: string; short: string }[] = [
  { id: 'sessao', label: 'Sessão', short: 'Sessão' },
  { id: 'tema', label: 'Tema', short: 'Tema' },
  { id: 'zen', label: 'Zen', short: 'Zen' },
  { id: 'orquestrador', label: 'orquestrador', short: 'orq' },
  { id: 'hud', label: 'hud', short: 'hud' },
  { id: 'configs', label: 'Configs', short: 'Configs' },
]

export type ShellProps = {
  tab: MenuTab
  note: string | null
  onTab: (tab: MenuTab) => void
  /** A aba cuida da própria rolagem (uma lista em janela): a moldura fica do tamanho exato do corpo. */
  isFixed?: boolean
  children: JSX.Element
}

/**
 * A moldura do menu: abas no topo (a ativa com fundo de destaque e o foco inicial) com o fechar
 * na ponta, régua, corpo, nota da última ação, régua e rodapé com as teclas.
 *
 * A raiz tem sempre pelo menos a altura do corpo do pane: aberto acima do prompt, o pane se
 * ajusta à árvore, e uma árvore que muda de altura a cada aba tiraria os botões do lugar do clique.
 */
export function Shell($: EngineInterface, e: PaneEvent, { tab, note, onTab, isFixed = false, children }: ShellProps): JSX.Element {
  const { Box, Text, Button } = $.ui.resolve(e)
  const columns = e.props.bodyColumns
  const rows = e.props.scroll.bodyRows
  const narrow = columns < 64
  return (
    <Box
      flexDirection="column"
      width={columns}
      height={isFixed ? rows : undefined}
      minHeight={isFixed ? undefined : rows}
    >
      <Box flexDirection="row" columnGap={1}>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} flexShrink={1}>
          {TABS.map(t => {
            const active = t.id === tab
            const label = narrow ? t.short : t.label
            return (
              <Button
                key={`tab:${t.id}`}
                label={label}
                plain
                variant={active ? 'primary' : 'secondary'}
                autoFocus={active ? true : undefined}
                onPress={() => onTab(t.id)}
              >
                {active ? (
                  <Text color="inverseText" backgroundColor="claude" bold>
                    {' '}◆ {label}{' '}
                  </Text>
                ) : (
                  <Text color="subtle">{label}</Text>
                )}
              </Button>
            )
          })}
        </Box>
        <Box flexGrow={1} />
        <Box flexShrink={0}>
          <Button
            key="menu:close"
            label="esc ✕"
            plain
            dimColor
            role="dismiss"
            onPress={() => void closeMenu($).catch(error => $.ui.toast(`menu: ${reason(error)}`))}
          />
        </Box>
      </Box>
      {Rule($, e)}
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
        <Text color="subtle" dimColor wrap="truncate-end">
          tab/setas movem · enter escolhe · esc fecha
        </Text>
      </Box>
    </Box>
  )
}

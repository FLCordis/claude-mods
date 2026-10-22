import type { EngineInterface, RenderInput } from 'claude-code'

import type { MenuTab } from '../types'
import { Rule } from './chips'

/** O `e` do hook `ui.render` em `Pane`, em qualquer superfície. */
export type PaneEvent = RenderInput<'Pane'>

export const TABS: readonly { id: MenuTab; label: string; short: string; hotkey: string }[] = [
  { id: 'sessao', label: 'Sessão', short: 'Sessão', hotkey: '1' },
  { id: 'orquestrador', label: 'orquestrador', short: 'orq', hotkey: '2' },
  { id: 'hud', label: 'hud', short: 'hud', hotkey: '3' },
  { id: 'tema', label: 'Tema', short: 'Tema', hotkey: '4' },
  { id: 'configs', label: 'Configs', short: 'Configs', hotkey: '5' },
]

export type ShellProps = {
  tab: MenuTab
  note: string | null
  onTab: (tab: MenuTab) => void
  children: JSX.Element
}

/**
 * A moldura do menu: abas no topo (a ativa com fundo de destaque), régua, corpo, nota da última
 * ação, régua e rodapé com as teclas. O fechar (✕) é o do próprio engine, na moldura do pane.
 */
export function Shell($: EngineInterface, e: PaneEvent, { tab, note, onTab, children }: ShellProps): JSX.Element {
  const { Box, Text, Button } = $.ui.resolve(e)
  const narrow = e.props.bodyColumns < 64
  return (
    <Box flexDirection="column" width={e.props.bodyColumns}>
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {TABS.map(t => {
            const active = t.id === tab
            const label = narrow ? t.short : t.label
            return (
              <Button
                key={`tab:${t.id}`}
                label={`${t.hotkey} ${label}`}
                hotkey={t.hotkey}
                plain
                variant={active ? 'primary' : 'secondary'}
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
      {Rule($, e)}
      <Box flexDirection="column" marginTop={1} paddingX={1}>
        {children}
      </Box>
      {note !== null && (
        <Box marginTop={1} paddingX={1}>
          <Text color="suggestion" wrap="truncate-end">
            {note}
          </Text>
        </Box>
      )}
      <Box marginTop={1}>{Rule($, e)}</Box>
      <Text color="subtle" dimColor wrap="truncate-end">
        tab move · enter escolhe · 1-5 abas · esc fecha
      </Text>
    </Box>
  )
}

import type { Color, EngineInterface } from 'claude-code'

import type { PaneEvent } from './shell'

export type ChipProps = {
  /** A chave do Button: o endereço do clique. A caixa em volta leva `<key>-box`. */
  key: string
  label: string
  /** Em destaque: borda e texto na cor, em negrito. */
  active?: boolean
  /** A cor do rótulo (e da borda quando ativo); `text` por padrão. */
  color?: Color
  onPress: () => void
}

/** Um botão em caixa arredondada: `╭────────╮ │ Opus │ ╰────────╯`. */
export function Chip($: EngineInterface, e: PaneEvent, { key, label, active = false, color = 'text', onPress }: ChipProps): JSX.Element {
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box key={`${key}-box`} borderStyle="round" borderColor={active ? color : 'subtle'} borderDimColor={!active} paddingX={1}>
      <Button key={key} label={label} plain variant={active ? 'primary' : 'secondary'} onPress={onPress}>
        <Text color={color} bold={active}>
          {label}
        </Text>
      </Button>
    </Box>
  )
}

/** Uma fileira de chips que quebra linha quando falta largura. */
export function ChipRow($: EngineInterface, e: PaneEvent, chips: JSX.Element[]): JSX.Element {
  const { Box } = $.ui.resolve(e)
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      {chips}
    </Box>
  )
}

/** Uma régua `────` na largura pedida (a do corpo, por padrão). */
export function Rule($: EngineInterface, e: PaneEvent, columns: number = e.props.bodyColumns): JSX.Element {
  const { Text } = $.ui.resolve(e)
  return (
    <Text color="subtle" dimColor>
      {'─'.repeat(Math.max(1, columns))}
    </Text>
  )
}

/** O rótulo apagado de uma seção (`Modelo`, `Effort`). */
export function SectionLabel($: EngineInterface, e: PaneEvent, text: string): JSX.Element {
  const { Text } = $.ui.resolve(e)
  return <Text color="subtle">{text}</Text>
}

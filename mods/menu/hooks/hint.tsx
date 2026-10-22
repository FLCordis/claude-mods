import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { hintLine, modeLabelColumns } from './format'
import { reason } from './state'
import { toggleMenu } from './toggle'

const isOpenAtom = atom({ plugin: 'menu', key: 'isOpen' } as const, false)
const modeAtom = atom({ plugin: 'menu', key: 'mode' } as const, null)

/** O rótulo do botão; o mod abaixo recebe o texto dele em `tail` e reserva a largura. */
export const BUTTON = (isOpen: boolean) => `◆ menu ${isOpen ? '▼' : '▲'}`

/**
 * A linha sob o prompt com o botão do menu na ponta direita. O que vem de baixo (a régua do
 * terminal-hud) fica à esquerda; tudo numa linha só, porque o engine desenha o rótulo de modo
 * (`⏵⏵ …`) numa coluna à esquerda desta árvore.
 *
 * Larguras explícitas: o layout do terminal mede uma parte elástica (flexGrow com largura 0, ou
 * flexShrink) na largura natural dela, e aí o rótulo encolhe e o botão sai da tela. O mod abaixo
 * recebe o rótulo do botão em `props.tail` e dimensiona a parte dele; a dica própria recebe o que
 * sobra, contado aqui.
 *
 * Sem outro mod abaixo, o que volta é o nó do próprio engine. Ele fica de fora: ocupa a linha
 * inteira e às vezes traz uma segunda linha com um `·` solto. A dica é desenhada aqui, numa linha.
 */
export async function Hint(
  $: EngineInterface,
  e: RenderInput<'PromptHint'>,
  below: (e: RenderInput<'PromptHint'>) => Promise<RenderElement>,
): Promise<JSX.Element> {
  const isOpen = await read($, isOpenAtom)
  const label = BUTTON(isOpen)
  let drawn: RenderElement | null = null
  try {
    drawn = await below({ ...e, props: { ...e.props, tail: label } })
  } catch {
    drawn = null
  }
  const { Box, Button, Text } = $.ui.resolve(e)
  const line = hintLine(e.props.hint)
  const columns = e.viewport?.columns ?? 80
  const mode = await read($, modeAtom)
  const hintWidth = Math.max(0, columns - modeLabelColumns(mode) - [...label].length - 1 - 2)
  const rest =
    drawn !== null && drawn.type !== 'engine' ? (
      <Box flexShrink={0}>{drawn}</Box>
    ) : line === '' ? null : (
      <Box width={hintWidth} flexShrink={0}>
        <Text color="subtle" dimColor wrap="truncate-end">
          {line}
        </Text>
      </Box>
    )
  return (
    <Box flexDirection="row" columnGap={1}>
      {rest}
      <Box flexShrink={0}>
        <Button
          key="menu:toggle"
          plain
          label={label}
          onPress={() => void toggleMenu($).catch(error => $.ui.toast(`menu: ${reason(error)}`))}
        />
      </Box>
    </Box>
  )
}

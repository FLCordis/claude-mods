import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { hintLine } from './format'
import { reason } from './state'
import { toggleMenu } from './toggle'

const isOpenAtom = atom({ plugin: 'menu', key: 'isOpen' } as const, false)

/**
 * A linha sob o prompt com o botão do menu na ponta direita. O que vem de baixo (a régua do
 * terminal-hud) fica à esquerda e encolhe primeiro; tudo numa linha só, porque o engine desenha o
 * rótulo de modo (`⏵⏵ …`) numa coluna à esquerda desta árvore.
 *
 * Sem outro mod abaixo, o que volta é o nó do próprio engine. Ele fica de fora: ocupa a linha
 * inteira e às vezes traz uma segunda linha com um `·` solto. A dica é desenhada aqui, numa linha.
 */
export async function Hint(
  $: EngineInterface,
  e: RenderInput<'PromptHint'>,
  below: () => Promise<RenderElement>,
): Promise<JSX.Element> {
  let drawn: RenderElement | null = null
  try {
    drawn = await below()
  } catch {
    drawn = null
  }
  const isOpen = await read($, isOpenAtom)
  const { Box, Button, Text } = $.ui.resolve(e)
  const line = hintLine(e.props.hint)
  // A dica própria pode levar `overflow` (corta no fim); o que veio de outro mod não: se trouxer o
  // nó do engine, o terminal recusa a árvore inteira com ele sob um Box assim.
  const rest =
    drawn !== null && drawn.type !== 'engine' ? (
      drawn
    ) : line === '' ? null : (
      <Box flexGrow={1} width={0} overflow="hidden">
        <Text color="subtle" dimColor wrap="truncate-end">
          {line}
        </Text>
      </Box>
    )
  // A linha divide espaço com o rótulo de modo do engine (`⏵⏵ … ·`), numa coluna à esquerda: se a
  // largura natural da árvore passar do que sobra, o rótulo encolhe e o `·` dele cai para baixo.
  // O que vem de baixo começa em largura 0 e só cresce no espaço livre; o botão não encolhe.
  return (
    <Box flexDirection="row" flexGrow={1} columnGap={1}>
      <Box flexGrow={1} width={0}>
        {rest}
      </Box>
      <Box flexShrink={0}>
        <Button
          key="menu:toggle"
          plain
          label={`◆ menu ${isOpen ? '▼' : '▲'}`}
          onPress={() => void toggleMenu($).catch(error => $.ui.toast(`menu: ${reason(error)}`))}
        />
      </Box>
    </Box>
  )
}

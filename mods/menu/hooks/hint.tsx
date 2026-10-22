import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { reason } from './state'
import { toggleMenu } from './toggle'

const isOpenAtom = atom({ plugin: 'menu', key: 'isOpen' } as const, false)

/**
 * A linha sob o prompt com o botão do menu na ponta direita. O que vem de baixo (a régua do
 * terminal-hud, ou a dica do próprio engine) fica à esquerda e encolhe primeiro; tudo numa linha
 * só, porque o engine desenha o rótulo de modo (`⏵⏵ …`) numa coluna à esquerda desta árvore.
 */
export async function Hint(
  $: EngineInterface,
  e: RenderInput<'PromptHint'>,
  below: () => Promise<RenderElement>,
): Promise<JSX.Element> {
  let rest: RenderElement | null = null
  try {
    rest = await below()
  } catch {
    rest = null
  }
  const isOpen = await read($, isOpenAtom)
  const { Box, Button } = $.ui.resolve(e)
  // Sem `overflow` em volta do que vem de baixo: quando é o nó do próprio engine (a dica), o
  // terminal recusa a árvore inteira com ele sob um Box assim e desenha só a dica dele.
  return (
    <Box flexDirection="row" flexGrow={1} justifyContent="space-between" columnGap={1}>
      <Box flexGrow={1} flexShrink={1}>
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

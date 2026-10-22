import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface } from 'claude-code'

import { Chip, ChipRow, SectionLabel } from '../chips'
import { basename, prettyModel } from '../format'
import { MODES, modeLabel, writeDefaultMode } from '../settings'
import type { PaneEvent } from '../shell'
import { closeMenu, note, reason, redraw, runCommand } from '../state'

const modeAtom = atom({ plugin: 'menu', key: 'mode' } as const, null)
const effortAtom = atom({ plugin: 'menu', key: 'effort' } as const, null)
const effortChosenAtom = atom({ plugin: 'menu', key: 'effortChosen' } as const, null)

export const MODELS = [
  ['fable', 'Fable'],
  ['opus', 'Opus'],
  ['sonnet', 'Sonnet'],
  ['haiku', 'Haiku'],
] as const

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type EffortLevel = (typeof EFFORTS)[number]

export const isEffortLevel = (value: unknown): value is EffortLevel => EFFORTS.some(level => level === value)

/** A escala do effort, do frio ao quente, como no mod de referência. */
const EFFORT_COLORS: Record<string, Color> = {
  low: 'planMode',
  medium: 'success',
  high: 'warning',
  xhigh: 'claude',
  max: 'error',
}

/** As cores que o próprio Claude Code usa para cada modo de permissão. */
export const MODE_COLORS: Record<string, Color> = {
  default: 'text',
  plan: 'planMode',
  acceptEdits: 'autoAccept',
  auto: 'warning',
  bypassPermissions: 'error',
  dontAsk: 'subtle',
}

/** `▰▰▱▱▱`: uma barra cheia por nível, da esquerda; nível desconhecido, nenhuma. */
export function effortBar(level: string | null): string {
  const at = level === null ? -1 : EFFORTS.indexOf(level as (typeof EFFORTS)[number])
  return EFFORTS.map((_, i) => (i <= at ? '▰' : '▱')).join('')
}

/**
 * Escolhe o effort: vale para cada requisição da sessão (o hook `turn.step` reescreve), fica
 * guardado para as próximas sessões e, quando o /config tem a linha, ela é atualizada junto
 * para o mostrador do Claude Code concordar.
 */
async function setEffort($: EngineInterface, level: string) {
  await update($, effortChosenAtom, () => level)
  await $.store.set('effort', level)
  try {
    const row = (await $.config.list()).find(r => r.kind === 'choice' && /effort/i.test(r.key) && (r.options ?? []).includes(level))
    if (row !== undefined) await $.config.set({ key: row.key, value: level })
  } catch {
    // A linha do /config é só espelho: a reescrita da requisição é o que vale.
  }
  await note($, `effort → ${level}`)
  await redraw($)
}

async function setDefaultMode($: EngineInterface, mode: string) {
  try {
    await note($, await writeDefaultMode($, mode))
  } catch (error) {
    await note($, `recusado: ${reason(error)}`)
  }
  await redraw($)
}

/** A aba Sessão: modelo, effort, modo em vigor, modo das novas sessões e ações rápidas. */
export async function Sessao($: EngineInterface, e: PaneEvent): Promise<JSX.Element> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const [model, root, usage, observed, chosen, mode, userSettings] = await Promise.all([
    $.session.model(),
    $.session.root(),
    $.session.usage(),
    read($, effortAtom),
    read($, effortChosenAtom),
    read($, modeAtom),
    $.settings.read({ source: 'user' }) as Promise<{ permissions?: { defaultMode?: unknown } }>,
  ])
  const effort = chosen ?? observed
  const defaultMode = userSettings.permissions?.defaultMode
  const startsIn = typeof defaultMode === 'string' && defaultMode !== '' ? defaultMode : 'default'
  const currentAlias = MODELS.find(([alias]) => model.toLowerCase().includes(alias))?.[0]

  return (
    <Box flexDirection="column" rowGap={1}>
      <Text color="subtle" dimColor wrap="truncate-end">
        {basename(root)} · {model} · ctx {usage.context.percent ?? 0}%
      </Text>

      <Box flexDirection="column">
        {SectionLabel($, e, 'Modelo')}
        {ChipRow(
          $,
          e,
          MODELS.map(([alias, name]) =>
            Chip($, e, {
              key: `model:${alias}`,
              label: name,
              active: alias === currentAlias,
              color: alias === currentAlias ? 'warning' : 'text',
              onPress: () => void runCommand($, 'model', alias),
            }),
          ),
        )}
        <Box flexDirection="row" columnGap={2}>
          <Button key="model:default" plain dimColor onPress={() => void runCommand($, 'model', 'default')}>
            ↺ padrão do Claude Code
          </Button>
          <Text color="subtle" dimColor>
            {prettyModel(model)}
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text>
          <Text color="subtle">Effort </Text>
          <Text color={EFFORT_COLORS[effort ?? ''] ?? 'claude'}>{effortBar(effort)}</Text>
          {effort !== null && <Text color="subtle"> {effort}</Text>}
          {chosen !== null && observed !== null && chosen !== observed && (
            <Text color="subtle" dimColor>
              {' '}(o Claude Code mandaria {observed})
            </Text>
          )}
        </Text>
        {ChipRow(
          $,
          e,
          EFFORTS.map(level =>
            Chip($, e, {
              key: `effort:${level}`,
              label: level,
              active: level === effort,
              color: EFFORT_COLORS[level] ?? 'text',
              onPress: () => void setEffort($, level),
            }),
          ),
        )}
      </Box>

      <Box flexDirection="column">
        {SectionLabel($, e, 'Rodando em')}
        <Text>
          <Text color={MODE_COLORS[mode ?? ''] ?? 'warning'} bold>
            {modeLabel(mode)}
          </Text>
          <Text color="subtle" dimColor>
            {' '}· shift+tab troca
          </Text>
        </Text>
      </Box>

      <Box flexDirection="column">
        {SectionLabel($, e, 'Novas sessões começam em')}
        {ChipRow(
          $,
          e,
          MODES.filter(m => m.id !== 'dontAsk').map(m =>
            Chip($, e, {
              key: `default:${m.id}`,
              label: m.id === startsIn ? `${m.label} · agora` : m.label,
              active: m.id === startsIn,
              color: m.id === startsIn ? 'warning' : (MODE_COLORS[m.id] ?? 'text'),
              onPress: () => void setDefaultMode($, m.id),
            }),
          ),
        )}
      </Box>

      <Box flexDirection="column">
        {SectionLabel($, e, 'Ações')}
        {ChipRow($, e, [
          Chip($, e, {
            key: 'act:compact',
            label: 'compactar',
            onPress: () =>
              void (async () => {
                try {
                  const { skip } = await $.session.compact()
                  await note($, skip === undefined ? 'compactado' : `compactação pulada: ${String(skip)}`)
                  await closeMenu($)
                } catch (error) {
                  await note($, `recusado: ${reason(error)}`)
                }
                await redraw($)
              })(),
          }),
          Chip($, e, { key: 'act:context', label: 'contexto', onPress: () => void runCommand($, 'context', undefined, { close: true }) }),
          Chip($, e, { key: 'act:cost', label: 'custo', onPress: () => void runCommand($, 'cost', undefined, { close: true }) }),
        ])}
      </Box>
    </Box>
  )
}

import { atom, read, update } from 'claude-code'
import type { ConfigRow, EngineInterface } from 'claude-code'

import { Chip, ChipRow, SectionLabel } from '../chips'
import { ConfigRows } from '../config-rows'
import { lang, t } from '../i18n'
import type { PaneEvent } from '../shell'
import { runCommand } from '../state'

const filterAtom = atom({ plugin: 'menu', key: 'filter' } as const, '')

/** Os painéis nativos que ganham botão, nesta ordem, quando a sessão tem o comando. */
export const PANELS = [
  'plugins',
  'permissions',
  'mcp',
  'hooks',
  'memory',
  'usage',
  'context',
  'cost',
  'status',
  'doctor',
  'model',
  'theme',
  'keybindings',
] as const

/** As linhas do /config por dono, o Claude Code primeiro, só as que casam com o filtro. */
export function groupRows(rows: readonly ConfigRow[], filter: string): { owner: string; rows: ConfigRow[] }[] {
  const needle = filter.trim().toLowerCase()
  const kept = rows.filter(r => needle === '' || r.key.toLowerCase().includes(needle) || r.label.toLowerCase().includes(needle))
  const groups = new Map<string, ConfigRow[]>()
  for (const row of kept) {
    const owner = row.provider.plugin === 'engine' ? 'Claude Code' : row.provider.plugin
    groups.set(owner, [...(groups.get(owner) ?? []), row])
  }
  const owners = [...groups.keys()].sort((a, b) => (a === 'Claude Code' ? -1 : b === 'Claude Code' ? 1 : a.localeCompare(b)))
  return owners.map(owner => ({ owner, rows: groups.get(owner) ?? [] }))
}

/** A aba Configs: filtro, todas as linhas do /config editáveis e os botões dos painéis nativos. */
export async function Configs(
  $: EngineInterface,
  e: PaneEvent,
  rows: readonly ConfigRow[],
  commands: readonly string[],
): Promise<JSX.Element> {
  const els = $.ui.resolve(e)
  const { Box, Text } = els
  const Input = 'Input' in els ? els.Input : undefined
  const [l, filter] = await Promise.all([lang($), read($, filterAtom)])
  const available = new Set(commands)
  const panels = PANELS.filter(name => available.has(name))
  const groups = groupRows(rows, filter)

  return (
    <Box flexDirection="column" rowGap={1}>
      {Input !== undefined && (
        <Input
          key="filter"
          label={t(l, 'filter')}
          placeholder={t(l, 'filterHint')}
          value={filter}
          submitLabel={t(l, 'filterGo')}
          onInput={(text: string) => void update($, filterAtom, () => text)}
          onSubmit={(text: string) => void update($, filterAtom, () => text)}
        />
      )}
      {groups.length === 0 && <Text dimColor>{t(l, 'noMatch')}</Text>}
      {groups.map(group => (
        <Box key={`group:${group.owner}`} flexDirection="column">
          <Text bold>{group.owner}</Text>
          {ConfigRows($, e, group.rows, l)}
        </Box>
      ))}
      <Box flexDirection="column">
        {SectionLabel($, e, t(l, 'panels'))}
        {panels.length === 0 ? (
          <Text dimColor>{t(l, 'noPanels')}</Text>
        ) : (
          ChipRow(
            $,
            e,
            panels.map(name =>
              Chip($, e, { key: `panel:${name}`, label: name, onPress: () => void runCommand($, name, undefined, { close: true }) }),
            ),
          )
        )}
      </Box>
    </Box>
  )
}

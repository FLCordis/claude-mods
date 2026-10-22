import type { ConfigRow, EngineInterface } from 'claude-code'

import { Chip, ChipRow, SectionLabel } from '../chips'
import { writeUserSetting } from '../settings'
import type { PaneEvent } from '../shell'
import { note, reason, redraw, runCommand } from '../state'

/** A linha do /config que escolhe o tema, quando este build a expõe. */
export function themeRow(rows: readonly ConfigRow[]): ConfigRow | undefined {
  return rows.find(r => r.kind === 'choice' && (r.key === 'theme' || /^(theme|tema)$/i.test(r.label)))
}

/**
 * Troca o tema: pela linha do /config quando ela aceita; quando só o diálogo dela muda o valor
 * (a recusa que o engine devolve), grava `theme` direto no settings.json de usuário.
 */
async function setTheme($: EngineInterface, row: ConfigRow, option: string) {
  try {
    const result = await $.config.set({ key: row.key, value: option })
    if ('deny' in result && result.deny !== undefined) {
      await writeUserSetting($, 'theme', option)
      await note($, `tema → ${option} (settings.json)`)
    } else {
      await note($, `tema → ${option}`)
    }
  } catch (error) {
    await note($, `recusado: ${reason(error)}`)
  }
  await redraw($)
}

/** A aba Tema: as opções de tema do Claude Code como chips e uma prévia das cores em uso. */
export async function Tema($: EngineInterface, e: PaneEvent, rows: readonly ConfigRow[]): Promise<JSX.Element> {
  const { Box, Text } = $.ui.resolve(e)
  const row = themeRow(rows)
  const hasPicker = (await $.command.list()).some(c => c.name === 'theme')

  const preview = (
    <Box flexDirection="column">
      {SectionLabel($, e, 'Prévia das cores do tema em uso')}
      <Text wrap="truncate-end">
        <Text color="claude">● claude</Text>
        {'  '}
        <Text color="success">✔ sucesso</Text>
        {'  '}
        <Text color="warning">⚠ aviso</Text>
        {'  '}
        <Text color="error">✖ erro</Text>
        {'  '}
        <Text color="suggestion">sugestão</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text color="planMode">plan</Text>
        {'  '}
        <Text color="autoAccept">accept edits</Text>
        {'  '}
        <Text color="permission">permissão</Text>
        {'  '}
        <Text color="remember">memória</Text>
        {'  '}
        <Text color="subtle">sutil</Text>
        {'  '}
        <Text color="inactive">inativo</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text color="diffAdded">+ linha adicionada</Text>
        {'  '}
        <Text color="diffRemoved">- linha removida</Text>
        {'  '}
        <Text color="inverseText" backgroundColor="claude">
          {' '}selecionado{' '}
        </Text>
      </Text>
    </Box>
  )

  const picker = hasPicker
    ? [
        Chip($, e, {
          key: 'theme:native',
          label: 'seletor nativo (/theme)',
          onPress: () => void runCommand($, 'theme', undefined, { close: true }),
        }),
      ]
    : []

  if (row === undefined) {
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text color="subtle" dimColor>
          este build não expõe o tema no /config
        </Text>
        {picker.length > 0 && ChipRow($, e, picker)}
        {preview}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" rowGap={1}>
      <Box flexDirection="column">
        {SectionLabel($, e, row.isLocked ? `${row.label} 🔒 (definido por política)` : row.label)}
        {row.isLocked ? (
          <Text>{String(row.value)}</Text>
        ) : (
          ChipRow($, e, [
            ...(row.options ?? []).map(option =>
              Chip($, e, {
                key: `theme:${option}`,
                label: option,
                active: option === row.value,
                color: option === row.value ? 'warning' : 'text',
                onPress: () => void setTheme($, row, option),
              }),
            ),
            ...picker,
          ])
        )}
      </Box>
      {preview}
    </Box>
  )
}

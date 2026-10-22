import type { ConfigRow, ConfigValue, EngineInterface } from 'claude-code'

import { Chip, ChipRow } from './chips'
import type { PaneEvent } from './shell'
import { note, reason, redraw } from './state'

/** Acima disso uma linha `choice` vira um Select em vez de uma fileira de chips. */
const MAX_CHOICE_CHIPS = 6

/** Grava uma linha do /config e anota o resultado; `noteLabel` troca o rótulo na nota. */
export async function setConfig($: EngineInterface, row: ConfigRow, value: ConfigValue, noteLabel: string = row.label) {
  try {
    const result = await $.config.set({ key: row.key, value })
    if ('deny' in result && result.deny !== undefined) await note($, `recusado: ${result.deny}`)
    else await note($, `${noteLabel} → ${String(value)}`)
  } catch (error) {
    await note($, `recusado: ${reason(error)}`)
  }
  await redraw($)
}

/** Enter num campo numérico: grava o número, ou avisa que não é um. */
async function submitNumber($: EngineInterface, row: ConfigRow, text: string) {
  const n = Number(text.trim())
  if (text.trim() === '' || Number.isNaN(n)) {
    await note($, `${row.label}: "${text}" não é um número`)
    await redraw($)
    return
  }
  await setConfig($, row, n)
}

/** As linhas do /config, cada uma com o controle do seu tipo: chip liga/desliga, chips de escolha, campo. */
export function ConfigRows($: EngineInterface, e: PaneEvent, rows: readonly ConfigRow[]): JSX.Element {
  const els = $.ui.resolve(e)
  const { Box, Text } = els
  // Uma superfície sem campo de texto (o celular) mostra o valor; a edição fica para o /config.
  const Input = 'Input' in els ? els.Input : undefined
  const Select = 'Select' in els ? els.Select : undefined

  const label = (row: ConfigRow) => (
    <Text color="subtle" wrap="truncate-end">
      {row.label}
    </Text>
  )

  const one = (row: ConfigRow): JSX.Element => {
    if (row.isLocked) {
      return (
        <Text key={`row:${row.key}`} wrap="truncate-end">
          <Text color="subtle">{row.label} </Text>
          <Text color="subtle" dimColor>
            {String(row.value)} 🔒
          </Text>
        </Text>
      )
    }
    if (row.kind === 'boolean') {
      const on = row.value === true
      return (
        <Box key={`row:${row.key}`}>
          {Chip($, e, {
            key: `cfg:${row.key}`,
            label: `${row.label} · ${on ? 'on' : 'off'}`,
            active: on,
            color: on ? 'success' : 'text',
            onPress: () => void setConfig($, row, !on),
          })}
        </Box>
      )
    }
    if (row.kind === 'choice') {
      const options = row.options ?? []
      if (options.length > MAX_CHOICE_CHIPS && Select !== undefined) {
        return (
          <Box key={`row:${row.key}`} flexDirection="column">
            {label(row)}
            <Select
              key={`cfg:${row.key}`}
              options={options.map(value => ({ label: value, value }))}
              value={String(row.value)}
              onSelect={(value: string) => void setConfig($, row, value)}
            />
          </Box>
        )
      }
      return (
        <Box key={`row:${row.key}`} flexDirection="column">
          {label(row)}
          {ChipRow(
            $,
            e,
            options.map(option =>
              Chip($, e, {
                key: `cfg:${row.key}:${option}`,
                label: option,
                active: option === row.value,
                color: option === row.value ? 'warning' : 'text',
                onPress: () => void setConfig($, row, option),
              }),
            ),
          )}
        </Box>
      )
    }
    return (
      <Box key={`row:${row.key}`} flexDirection="row" columnGap={2}>
        {label(row)}
        {Input === undefined ? (
          <Text>{String(row.value)}</Text>
        ) : (
          <Input
            key={`cfg:${row.key}`}
            value={String(row.value)}
            submitLabel="gravar"
            onSubmit={(text: string) => void (row.kind === 'number' ? submitNumber($, row, text) : setConfig($, row, text))}
          />
        )}
      </Box>
    )
  }

  return <Box flexDirection="column">{rows.map(one)}</Box>
}
